import type {RenderImage} from "./image-tools";
import type {TitleCue} from "./title-tools";
import {framingFilter,audioFilter} from "./adjustments";
import type { OutputSpec } from "./output-spec";
import type { CaptionStyle } from "./caption-renderer";
import type { CaptionCue } from "./captions";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { analyzeScenes } from "./scene-analysis";
import { probeMedia } from "./media";
import { validateRange, sequenceDuration, sourceOccurrences, type SourceRange } from "./timing";

export interface LocalResult {
  video: Blob;
  captions: Blob;
  captionError?: string;
  sceneDetectionError?: string;
  sceneMarkers: number[];
}

export type ProcessingPhase = "trimming" | "sceneDetection" | "captions";
export type ProcessingPhaseStatus = "working" | "complete" | "failed" | "skipped";
export type ProcessingUpdate = (phase: ProcessingPhase, status: ProcessingPhaseStatus, message: string) => void;

let engine: FFmpeg | null = null;
let engineLoad: Promise<FFmpeg> | null = null;
let engineGeneration = 0;
const loadingEngines = new Set<FFmpeg>();
let engineMode: "multi-thread" | "single-thread" | null = null;

function canUseMultiThreadFFmpeg() {
  return typeof crossOriginIsolated !== "undefined" && crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";
}

function getEngine(onLoading?: (message: string) => void): Promise<FFmpeg> {
  if (engine) return Promise.resolve(engine);
  if (engineLoad) return engineLoad;

  const generation = engineGeneration;
  engineLoad = (async () => {
    if (canUseMultiThreadFFmpeg()) {
      const multiThreaded = new FFmpeg();
      loadingEngines.add(multiThreaded);
      try {
        onLoading?.("Starting the multi-thread video processor…");
        await multiThreaded.load({
          coreURL: "/ffmpeg-mt/ffmpeg-core.js",
          wasmURL: "/ffmpeg-mt/ffmpeg-core.wasm",
          workerURL: "/ffmpeg-mt/ffmpeg-core.worker.js",
        });
        loadingEngines.delete(multiThreaded);
        if (generation !== engineGeneration) { multiThreaded.terminate(); throw new DOMException("Cancelled", "AbortError"); }
        engine = multiThreaded;
        engineMode = "multi-thread";
        return multiThreaded;
      } catch (error) {
        loadingEngines.delete(multiThreaded);
        multiThreaded.terminate();
        if (generation !== engineGeneration) throw error;
        onLoading?.("Multi-threading is unavailable here; starting the compatible video processor…");
      }
    }

    const singleThreaded = new FFmpeg();
    loadingEngines.add(singleThreaded);
    try {
      onLoading?.("Loading the compatible video processor; first use can take a little longer…");
      await singleThreaded.load({
        coreURL: "/ffmpeg/ffmpeg-core.js",
        wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      });
      loadingEngines.delete(singleThreaded);
      if (generation !== engineGeneration) { singleThreaded.terminate(); throw new DOMException("Cancelled", "AbortError"); }
      engine = singleThreaded;
      engineMode = "single-thread";
      return singleThreaded;
    } catch (error) {
      loadingEngines.delete(singleThreaded);
      singleThreaded.terminate();
      if (generation !== engineGeneration) throw error;
      engine = null;
      engineMode = null;
      throw error;
    }
  })().catch((error: unknown) => {
    if (generation === engineGeneration) engineLoad = null;
    throw error;
  });

  return engineLoad;
}

type WebCodecsWorkerResponse =
  | { type: "progress"; percent: number }
  | { type: "complete"; buffer: ArrayBuffer }
  | { type: "error"; message: string };

function canUseWebCodecs() {
  return typeof Worker !== "undefined" && "VideoDecoder" in globalThis && "VideoEncoder" in globalThis;
}

function processWithWebCodecs(file: File, trimStart: number, trimEnd: number, onProgress: (message: string) => void, signal?: AbortSignal, captionRender?:{cues:CaptionCue[];style:CaptionStyle}, copyAudio = false, spec?:OutputSpec,titleRender?:TitleCue[],imageRender?:RenderImage[]) {
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL("./webcodecs.worker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (error?: Error, blob?: Blob) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else if (blob) resolve(blob);
      else reject(new Error("WebCodecs did not return a video."));
    };

    const abort = () => finish(new DOMException("Cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    worker.onmessage = (event: MessageEvent<WebCodecsWorkerResponse>) => {
      const response = event.data;
      if (response.type === "progress") {
        onProgress(`Encoding with WebCodecs… about ${response.percent}%`);
      } else if (response.type === "complete") {
        finish(undefined, new Blob([response.buffer], { type: "video/mp4" }));
      } else {
        finish(new Error(response.message));
      }
    };
    worker.onerror = (event) => finish(new Error(event.message || "The WebCodecs worker could not start."));
    worker.onmessageerror = () => finish(new Error("The WebCodecs worker returned an unreadable result."));
    try {
      // Blob-backed File data is structured-cloned without copying the full video into the UI thread.
      worker.postMessage({ file, trimStart, trimEnd, captionRender, copyAudio, outputSpec:spec,titleRender,imageRender });
    } catch (error) {
      finish(error instanceof Error ? error : new Error("The WebCodecs worker could not receive this video."));
    }
  });
}

function resetEngine() {
  engineGeneration += 1;
  engine?.terminate();
  for (const pending of loadingEngines) pending.terminate();
  loadingEngines.clear();
  engine = null; engineLoad = null; engineMode = null;
}
function throwIfCancelled(signal?: AbortSignal) { signal?.throwIfAborted(); }
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
async function checkedExec(ffmpeg: FFmpeg, args: string[]) {
  const code = await ffmpeg.exec(args);
  if (code !== 0) throw new Error("The video processor failed (exit " + code + "). Retry with another source or a shorter selection.");
}

async function removeFile(ffmpeg: FFmpeg, path: string) {
  try { await ffmpeg.deleteFile(path); } catch { /* The file may not have been created. */ }
}

function describeProcessingError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message || error.name || fallback;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const detail = "message" in error ? String(error.message ?? "") : "";
    if (detail && detail !== "[object Object]") return detail;
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch { /* Some browser error objects cannot be serialized. */ }
  }
  return fallback;
}

/** Compatibility entry point; every scan uses the same worker and detector. */
async function scanSceneTimes(file: File, onProgress: (message: string) => void, start = 0, end?: number, signal?: AbortSignal) {
  throwIfCancelled(signal);
  const metadata = await probeMedia(file, signal), to = end ?? metadata.duration;
  const invalid = validateRange(start, to, metadata.duration);
  if (invalid) throw new Error(invalid);
  const result = await analyzeScenes(file, crypto.randomUUID(), metadata.duration, start, to,
    { mode:"quick",sensitivity:"balanced",scope:start===0&&to===metadata.duration?"source":"selection" },onProgress,signal??new AbortController().signal);
  return result.cuts.map(cut=>cut.time);
}

export async function detectScenesLocally(file: File, onProgress: (message: string) => void, signal?: AbortSignal): Promise<number[]> {
  return scanSceneTimes(file, onProgress, 0, undefined, signal);
}

export async function processLocally(
  file: File,
  trimStart: number,
  trimEnd: number,
  onProgress: ProcessingUpdate,
  options: { sceneDetection: boolean; captions: boolean; sourceDuration: number; titleRender?:TitleCue[];imageRender?:RenderImage[];ranges?:SourceRange[]; outputSpec?:OutputSpec; signal?: AbortSignal; forceFFmpeg?: boolean; captionRender?:{cues:CaptionCue[];style:CaptionStyle} },
  knownSceneTimes?: number[],
): Promise<LocalResult> {
  const jobId = crypto.randomUUID();
  const input = jobId + "-input", output = jobId + "-output.mp4", pcmPath = jobId + "-audio.f32";
  const signal = options.signal;
  throwIfCancelled(signal);
  const rangeError = validateRange(trimStart, trimEnd, options.sourceDuration);
  if (rangeError) throw new Error(rangeError);
  const abort = () => resetEngine();
  signal?.addEventListener("abort", abort, { once: true });
  const report = onProgress;
  onProgress = (...args) => { if (!signal?.aborted) report(...args); };
  let ffmpeg: FFmpeg | null = null;
  try {
  const sourceDuration = options.sourceDuration;
  const outputRanges: SourceRange[] = options.ranges ?? [{ id: jobId, sourceId: jobId, start: trimStart, end: trimEnd }];
  if (!outputRanges.length || outputRanges.length>100) throw new Error("Keep between one and 100 ranges.");
  for(const range of outputRanges){const error=validateRange(range.start,range.end,sourceDuration);if(error)throw new Error(error);}
  const joined=outputRanges.length>1,outputDuration=sequenceDuration(outputRanges);
  const fullRange = !joined && Number.isFinite(sourceDuration) && sourceDuration > 0 && trimStart === 0 && Math.abs(trimEnd - sourceDuration) < 0.000001;
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const brand = String.fromCharCode(...header.slice(8, 12));
  const isMp4 = String.fromCharCode(...header.slice(4, 8)) === "ftyp" && ["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V "].includes(brand);
  const canReuseOriginal = fullRange && isMp4 && !options.forceFFmpeg && !options.captionRender && !options.titleRender?.length && !options.imageRender?.length && !options.outputSpec?.reencode;
  let video: Blob | null = null;

  if(joined){
    if(!options.outputSpec)throw new Error("Joined export needs a measured output configuration.");
    video=await processOrderedSources([{id:outputRanges[0].sourceId,file}],outputRanges,options.outputSpec,message=>onProgress("trimming","working",message),signal??new AbortController().signal,options.captionRender,options.titleRender,options.imageRender,options.forceFFmpeg);
    onProgress("trimming","complete","Joined video is ready.");
  } else if (canReuseOriginal) {
    // A full-length MP4 does not need an encode. Avoid loading the 32 MB WASM
    // core and preserve the original bytes and quality for the common case.
    video = file;
    onProgress("trimming", "working", "No trim needed; keeping the original MP4…");
    onProgress("trimming", "complete", "Original MP4 is ready; no re-encode needed.");
  } else {
    let renderedWithWebCodecs = false;
    if (!joined && !options.outputSpec?.audioAdjustments && canUseWebCodecs() && !options.forceFFmpeg) {
      onProgress("trimming", "working", "Preparing browser video acceleration…");
      try {
        video = await processWithWebCodecs(file, trimStart, trimEnd, (message) => onProgress("trimming", "working", message), signal, options.captionRender,false,options.outputSpec,options.titleRender,options.imageRender);
        renderedWithWebCodecs = true;
      } catch (error) {
        throwIfCancelled(signal);
        if(options.captionRender && error instanceof Error && /caption.*(?:font|fit|glyph)/i.test(error.message))throw error;
        onProgress("trimming", "working", "WebCodecs cannot encode this file here; switching to FFmpeg…");
      }
    } else {
      onProgress("trimming", "working", "WebCodecs is unavailable; preparing FFmpeg…");
    }

    if(!renderedWithWebCodecs&&canUseWebCodecs()&&options.outputSpec){
      video=await processOrderedSources([{id:outputRanges[0].sourceId,file}],outputRanges,options.outputSpec,message=>onProgress("trimming","working",message),signal??new AbortController().signal,options.captionRender,options.titleRender,options.imageRender,true);
      renderedWithWebCodecs=true;
    }
    if (!renderedWithWebCodecs) {
      ffmpeg = await abortable(getEngine((message) => onProgress("trimming", "working", message)), signal);
      throwIfCancelled(signal);
      const modeLabel = engineMode === "multi-thread" ? "multi-thread FFmpeg" : "FFmpeg";
      onProgress("trimming", "working", `Preparing source video for ${modeLabel} (${Math.max(1, Math.round(file.size / (1024 * 1024)))} MB)…`);
      await Promise.all([input, output, pcmPath].map((path) => removeFile(ffmpeg!, path)));
      const sourceBytes = await fetchFile(file);
      throwIfCancelled(signal);
      await ffmpeg.writeFile(input, sourceBytes);
      throwIfCancelled(signal);

      const selectedDuration = Math.max(0.001, outputDuration);
      let lastPercent = 0;
      const onEncodeLog = ({ message }: { message: string }) => {
        const match = /\btime=(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(message);
        if (!match) return;
        const encodedSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(`${match[3]}.${match[4] ?? "0"}`);
        lastPercent = Math.max(lastPercent, Math.min(99, Math.floor((encodedSeconds / selectedDuration) * 100)));
        onProgress("trimming", "working", `Encoding with ${modeLabel}… about ${lastPercent}%`);
      };
      ffmpeg.on("log", onEncodeLog);
      try {
        const audio=options.outputSpec?.audio??(await probeMedia(file,signal)).hasAudio;
        const filters:string[]=[];
        if(joined){
          outputRanges.forEach((range,index)=>{
            filters.push("[0:v:0]trim=start="+range.start+":end="+range.end+",setpts=PTS-STARTPTS[v"+index+"]");
            if(audio)filters.push("[0:a:0]atrim=start="+range.start+":end="+range.end+",asetpts=PTS-STARTPTS,apad,atrim=duration="+(range.end-range.start)+"[a"+index+"]");
          });
          filters.push(outputRanges.map((_,index)=>"[v"+index+"]"+(audio?"[a"+index+"]":"")).join("")+"concat=n="+outputRanges.length+":v=1:a="+(audio?"1":"0")+"[joinedv]"+(audio?"[joineda]":""));
        }
        const spec=options.outputSpec;
        const visual=spec?.framing?framingFilter(spec.sourceWidth!,spec.sourceHeight!,spec.width,spec.height,spec.framing):spec?.resize?"scale="+spec.width+":"+spec.height+":force_original_aspect_ratio=decrease:force_divisible_by=2,pad="+spec.width+":"+spec.height+":(ow-iw)/2:(oh-ih)/2,setsar=1":null;
        if(joined&&visual)filters.push("[joinedv]"+visual+"[finalv]");
        if(joined&&audio&&spec?.audioAdjustments)filters.push("[joineda]"+audioFilter(spec.audioAdjustments,outputDuration)+"[finala]");
        await checkedExec(ffmpeg, [
          ...(joined?["-i",input,"-filter_complex",filters.join(";"),"-map",visual?"[finalv]":"[joinedv]",...(audio?["-map",spec?.audioAdjustments?"[finala]":"[joineda]"]:["-an"])]:["-ss", String(trimStart), "-i", input, "-t", String(trimEnd - trimStart)]),
          ...(!joined?["-map", "0:v:0", ...(options.outputSpec?.audio===false?["-an"]:["-map","0:a:0?"])]:[]),
          ...(!joined&&visual?["-vf",visual]:[]),
          ...(!joined&&audio&&spec?.audioAdjustments?["-af",audioFilter(spec.audioAdjustments,outputDuration)]:[]),
          "-fps_mode", "passthrough", "-c:v", "libx264", "-preset", "ultrafast", "-crf", String(options.captionRender?Math.min(18,options.outputSpec?.crf??23):options.outputSpec?.crf??23),
          "-c:a", "aac", "-b:a", String(options.outputSpec?.audioBitrate??128000), "-movflags", "+faststart", "-stats_period", "0.5", output,
        ]);
      } finally {
        ffmpeg.off("log", onEncodeLog);
      }
      const encoded = await ffmpeg.readFile(output) as Uint8Array;
      const outputBuffer = new ArrayBuffer(encoded.byteLength);
      new Uint8Array(outputBuffer).set(encoded);
      video = new Blob([outputBuffer], { type: "video/mp4" });
      if(options.captionRender||options.titleRender?.length||options.imageRender?.length){
        if(!canUseWebCodecs())throw new Error("Burned-in captions need a supported browser video encoder. Your previous export is preserved; choose subtitle files to export without burn-in.");
        onProgress("trimming","working","Applying the caption layout to prepared video frames…");
        const prepared=new File([video],jobId+"-prepared.mp4",{type:"video/mp4"});
        video=await processWithWebCodecs(prepared,0,outputDuration,message=>onProgress("trimming","working",message),signal,options.captionRender,true,options.outputSpec?{...options.outputSpec,framing:undefined,audioAdjustments:undefined}:undefined,options.titleRender,options.imageRender);
      }
    }
    onProgress("trimming", "complete", "Trimmed video is ready.");
  }
  throwIfCancelled(signal);
  if (!video?.size) throw new Error("The video processor finished without producing an output file.");

  let sceneMarkers: number[] = [];
  let sceneDetectionError: string | undefined;
  if (!options.sceneDetection) {
    onProgress("sceneDetection", "skipped", "Skipped for a faster export.");
  } else {
  try {
    onProgress("sceneDetection", "working", "Finding scene changes in the selected range…");
    if (knownSceneTimes) {
      sceneMarkers = knownSceneTimes
        .flatMap(time=>sourceOccurrences(time,outputRanges[0].sourceId,outputRanges).map(hit=>hit.sequenceTime));
    } else {
      const sceneTimes = await scanSceneTimes(file, (message) => onProgress("sceneDetection", "working", message), trimStart, trimEnd, signal);
      sceneMarkers = sceneTimes
        .flatMap(time=>sourceOccurrences(time,outputRanges[0].sourceId,outputRanges).map(hit=>hit.sequenceTime));
    }
    onProgress("sceneDetection", "complete", `${sceneMarkers.length} scene ${sceneMarkers.length === 1 ? "change" : "changes"} found.`);
  } catch (error) {
    throwIfCancelled(signal);
    sceneDetectionError = error instanceof Error ? error.message : "Scene detection could not finish.";
    onProgress("sceneDetection", "failed", sceneDetectionError);
  }
  }

  let captions = "WEBVTT\n\n";
  let captionError: string | undefined;
  if (!options.captions) {
    onProgress("captions", "skipped", "Skipped for a faster export.");
  } else {
  try {
    captions = await transcribeLocally(file, trimStart, trimEnd, (message) => onProgress("captions", "working", message), signal);
    onProgress("captions", "complete", "Captions ready.");
  } catch (error) {
    throwIfCancelled(signal);
    captionError = describeProcessingError(error, "Speech recognition could not run in this browser.");
    onProgress("captions", "failed", captionError);
  }
  }

  throwIfCancelled(signal);
  return { video, captions: new Blob([captions], { type: "text/vtt" }), captionError, sceneDetectionError, sceneMarkers };
  } catch(error){if(ffmpeg&&!signal?.aborted)resetEngine();throw error;} finally {
    signal?.removeEventListener("abort", abort);
    if (ffmpeg && !signal?.aborted) await Promise.all([input, output, pcmPath].map((path) => removeFile(ffmpeg!, path)));
  }
}


export async function transcribeLocally(file: File, start: number, end: number, onProgress: (message: string) => void, signal?: AbortSignal): Promise<string> {
  throwIfCancelled(signal);
  const id = crypto.randomUUID(), input = id + "-source", pcmPath = id + "-audio.f32";
  let ffmpeg: FFmpeg | null = null;
  const abort = () => resetEngine();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    ffmpeg = await abortable(getEngine(onProgress), signal);
    const bytes = await fetchFile(file);
    throwIfCancelled(signal);
    await ffmpeg.writeFile(input, bytes);
    onProgress("Preparing selection audio…");
    await checkedExec(ffmpeg, ["-ss", String(start), "-i", input, "-t", String(end - start), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", pcmPath]);
    const pcm = await ffmpeg.readFile(pcmPath) as Uint8Array;
    if (!pcm.byteLength) throw new Error("No audio was available in the selected section.");
    const audio = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
    throwIfCancelled(signal);
    await Promise.all([input, pcmPath].map((path) => removeFile(ffmpeg!, path)));
    let peak = 0;
    for (const value of audio) peak = Math.max(peak, Math.abs(value));
    if (peak < 0.00001) throw Object.assign(new Error("The selection is silent; no speech was found."), { name: "NoSpeechError" });
    return await new Promise<string>((resolve, reject) => {
      const worker = new Worker(new URL("./transcription.worker.ts", import.meta.url), { type: "module" });
      const finish = (error?: Error, text?: string) => {
        worker.terminate(); signal?.removeEventListener("abort", cancel);
        if (error) reject(error); else resolve(text ?? "WEBVTT\\n\\n");
      };
      const cancel = () => finish(new DOMException("Cancelled", "AbortError"));
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) { cancel(); return; }
      worker.onmessage = ({ data }: MessageEvent<{ type: string; message?: string; name?: string; vtt?: string }>) => {
        if (data.type === "progress") onProgress(data.message ?? "Transcribing…");
        else if (data.type === "complete") finish(undefined, data.vtt);
        else finish(Object.assign(new Error(data.message ?? "The speech model failed. Check your connection for the first download and retry."), { name: data.name ?? "Error" }));
      };
      worker.onerror = () => finish(new Error("The speech worker could not run. Retry captions without changing your edit."));
      worker.postMessage({ audio, duration: end - start }, [audio.buffer]);
    });
  } finally {
    signal?.removeEventListener("abort", abort);
    if (ffmpeg && !signal?.aborted) await Promise.all([input, pcmPath].map((path) => removeFile(ffmpeg!, path)));
  }
}


/** Multi-source assembly uses exact frame durations and one continuous output audio timeline. */
export async function processAssembly(
 assembly:import("./assembly").Assembly,media:Record<string,Blob>,spec:OutputSpec,
 onProgress:(message:string)=>void,signal:AbortSignal,
 captions?:{cues:CaptionCue[];style:CaptionStyle},titles?:TitleCue[],images?:RenderImage[],forceFFmpeg=false
):Promise<Blob>{
 const {validateAssembly}=await import("./assembly");const error=validateAssembly(assembly);if(error)throw new Error(error);
 for(const source of assembly.sources){if(source.reference.metadata.hdr)throw new Error("HDR assembly re-encoding is unavailable; source files are preserved.");if(!media[source.reference.fingerprint])throw new Error("Relink missing assembly source: "+source.reference.fileName);}
 return processOrderedSources(assembly.sources.map(source=>({id:source.id,file:media[source.reference.fingerprint]})),assembly.ranges,spec,onProgress,signal,captions,titles,images,forceFFmpeg);
}

function processSequenceWithWorker(sources:{id:string;file:Blob}[],ranges:SourceRange[],spec:OutputSpec,onProgress:(message:string)=>void,signal:AbortSignal,captions?:{cues:CaptionCue[];style:CaptionStyle},titles?:TitleCue[],images?:RenderImage[]):Promise<Blob>{
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL("./sequence-render.worker.ts",import.meta.url),{type:"module"});let settled=false;
  const finish=(error?:Error,buffer?:ArrayBuffer)=>{if(settled)return;settled=true;worker.terminate();signal.removeEventListener("abort",abort);if(error)reject(error);else if(buffer)resolve(new Blob([buffer],{type:"video/mp4"}));else reject(new Error("The sequence renderer returned no video."));};
  const abort=()=>finish(new DOMException("Cancelled","AbortError"));signal.addEventListener("abort",abort,{once:true});if(signal.aborted){abort();return;}
  worker.onmessage=({data}:MessageEvent<WebCodecsWorkerResponse>)=>{if(data.type==="progress")onProgress("Encoding joined frames and audio… about "+data.percent+"%");else if(data.type==="complete")finish(undefined,data.buffer);else finish(new Error(data.message));};
  worker.onerror=event=>finish(new Error(event.message||"The sequence renderer could not start."));worker.onmessageerror=()=>finish(new Error("The sequence renderer returned an unreadable result."));
  try{worker.postMessage({sources,ranges,spec,captions,titles,images});}catch(error){finish(error instanceof Error?error:new Error("Sources could not be passed to the sequence renderer."));}
 });
}
async function processOrderedSources(sources:{id:string;file:Blob}[],ranges:SourceRange[],spec:OutputSpec,onProgress:(message:string)=>void,signal:AbortSignal,captions?:{cues:CaptionCue[];style:CaptionStyle},titles?:TitleCue[],images?:RenderImage[],forceFFmpeg=false):Promise<Blob>{
 signal.throwIfAborted();if(!canUseWebCodecs())throw new Error("Accurate joined export needs the browser video encoder. Save a project backup and open it in a supported browser.");
 if(!forceFFmpeg)try{return await processSequenceWithWorker(sources,ranges,spec,onProgress,signal,captions,titles,images);}catch(error){signal.throwIfAborted();if(error instanceof Error&&/font|caption.*fit|Relink missing image|Image dimensions|image format|image layers/i.test(error.message))throw error;onProgress("Preparing sources for the compatible sequence renderer…");}
 const prepared:{id:string;file:Blob}[]=[],job=crypto.randomUUID(),input=job+"-source",output=job+"-prepared.mp4";let ffmpeg:FFmpeg|null=null;
 const abort=()=>resetEngine();signal.addEventListener("abort",abort,{once:true});
 try{
  ffmpeg=await abortable(getEngine(onProgress),signal);
  for(let i=0;i<sources.length;i++){
   signal.throwIfAborted();onProgress("Preparing compatible source "+(i+1)+" of "+sources.length+" ("+(sources[i].file.size/1024/1024).toFixed(1)+" MB)…");
   await ffmpeg.writeFile(input,await fetchFile(sources[i].file));
   let mono=false;
   if(spec.audio){const {Input,BlobSource,ALL_FORMATS}=await import("mediabunny");const probe=new Input({source:new BlobSource(sources[i].file),formats:ALL_FORMATS});try{const audio=await probe.getPrimaryAudioTrack();mono=Boolean(audio&&await audio.getNumberOfChannels()===1);}finally{probe.dispose();}}
   await checkedExec(ffmpeg,["-i",input,"-map","0:v:0",...(spec.audio?["-map","0:a:0?"]:["-an"]),"-fps_mode","passthrough","-enc_time_base:v","-1","-c:v","libx264","-preset","ultrafast","-crf",String(Math.min(12,spec.crf)),"-pix_fmt","yuv420p","-c:a","aac",...(mono?["-af","pan=stereo|c0=c0|c1=c0"]:[]),"-ac","2","-ar","48000","-b:a","192000","-movflags","+faststart",output]);
   const bytes=await ffmpeg.readFile(output) as Uint8Array,buffer=new ArrayBuffer(bytes.byteLength);new Uint8Array(buffer).set(bytes);prepared.push({id:sources[i].id,file:new Blob([buffer],{type:"video/mp4"})});
   await Promise.all([input,output].map(path=>removeFile(ffmpeg!,path)));
  }
  return await processSequenceWithWorker(prepared,ranges,spec,onProgress,signal,captions,titles,images);
 }catch(error){if(ffmpeg&&!signal.aborted)resetEngine();throw error;}
 finally{signal.removeEventListener("abort",abort);if(ffmpeg&&!signal.aborted)await Promise.all([input,output].map(path=>removeFile(ffmpeg!,path)));}
}
