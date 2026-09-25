import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

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
let engineMode: "multi-thread" | "single-thread" | null = null;

function canUseMultiThreadFFmpeg() {
  return typeof crossOriginIsolated !== "undefined" && crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";
}

function getEngine(onLoading?: (message: string) => void): Promise<FFmpeg> {
  if (engine) return Promise.resolve(engine);
  if (engineLoad) return engineLoad;

  engineLoad = (async () => {
    if (canUseMultiThreadFFmpeg()) {
      const multiThreaded = new FFmpeg();
      try {
        onLoading?.("Starting the multi-thread video processor…");
        await multiThreaded.load({
          coreURL: "/ffmpeg-mt/ffmpeg-core.js",
          wasmURL: "/ffmpeg-mt/ffmpeg-core.wasm",
          workerURL: "/ffmpeg-mt/ffmpeg-core.worker.js",
        });
        engine = multiThreaded;
        engineMode = "multi-thread";
        return multiThreaded;
      } catch {
        multiThreaded.terminate();
        onLoading?.("Multi-threading is unavailable here; starting the compatible video processor…");
      }
    }

    const singleThreaded = new FFmpeg();
    try {
      onLoading?.("Loading the compatible video processor; first use can take a little longer…");
      await singleThreaded.load({
        coreURL: "/ffmpeg/ffmpeg-core.js",
        wasmURL: "/ffmpeg/ffmpeg-core.wasm",
      });
      engine = singleThreaded;
      engineMode = "single-thread";
      return singleThreaded;
    } catch (error) {
      singleThreaded.terminate();
      engine = null;
      engineMode = null;
      throw error;
    }
  })().catch((error: unknown) => {
    engineLoad = null;
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

function processWithWebCodecs(file: File, trimStart: number, trimEnd: number, onProgress: (message: string) => void) {
  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL("./webcodecs.worker.ts", import.meta.url), { type: "module" });
    let settled = false;
    const finish = (error?: Error, blob?: Blob) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      if (error) reject(error);
      else if (blob) resolve(blob);
      else reject(new Error("WebCodecs did not return a video."));
    };

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
      worker.postMessage({ file, trimStart, trimEnd });
    } catch (error) {
      finish(error instanceof Error ? error : new Error("The WebCodecs worker could not receive this video."));
    }
  });
}

function vttTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
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

function removeRepeatedSpeechWords(text: string) {
  const words = text.match(/\S+/g) ?? [];
  const cleaned: string[] = [];
  let previous = "";
  let repeated = 0;
  for (const word of words) {
    const normalized = word.toLocaleLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
    if (normalized && normalized === previous) repeated += 1;
    else {
      previous = normalized;
      repeated = 1;
    }
    if (!normalized || repeated <= 2) cleaned.push(word);
  }
  return cleaned.join(" ");
}

async function scanSceneTimes(file: File, onProgress: (message: string) => void, start = 0, end?: number) {
  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const canvas = document.createElement("canvas");
  canvas.width = 80;
  canvas.height = 45;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser could not prepare the scene preview.");

  const waitFor = (eventName: "loadeddata" | "loadedmetadata") => new Promise<void>((resolve, reject) => {
    if (eventName === "loadeddata" ? video.readyState >= 2 : video.readyState >= 1) { resolve(); return; }
    const fail = () => { window.clearTimeout(timeout); reject(new Error("The browser could not read this video for scene detection.")); };
    const ready = () => { window.clearTimeout(timeout); video.removeEventListener("error", fail); resolve(); };
    const timeout = window.setTimeout(() => { video.removeEventListener(eventName, ready); video.removeEventListener("error", fail); reject(new Error("Reading video metadata took too long.")); }, 5000);
    video.addEventListener(eventName, ready, { once: true });
    video.addEventListener("error", fail, { once: true });
  });

  try {
    onProgress("Reading video metadata…");
    video.src = objectUrl;
    video.load();
    await waitFor("loadedmetadata");
    await waitFor("loadeddata");
    const from = Math.max(0, Math.min(video.duration, start));
    const to = Math.max(from, Math.min(video.duration, end ?? video.duration));
    const span = to - from;
    if (!Number.isFinite(span) || span <= 0) return [];

    // Sample several times per second so short scenes are visible to the
    // detector. Frames stay low resolution and are decoded by the browser.
    const sampleCount = Math.min(480, Math.max(2, Math.ceil(span * 4)));
    const deadline = performance.now() + 30_000;
    let previous: Uint8ClampedArray | null = null;
    const changes: { time: number; score: number }[] = [];
    for (let index = 0; index < sampleCount; index += 1) {
      if (performance.now() >= deadline) { onProgress("Quick scan time limit reached; keeping the cuts found so far."); break; }
      const time = from + span * index / sampleCount;
      if (Math.abs(video.currentTime - time) > 0.01 || video.readyState < 2) {
        try { await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => { video.removeEventListener("seeked", onSeeked); reject(new Error("Scene sample timed out.")); }, Math.max(1, Math.min(1000, deadline - performance.now())));
          const onSeeked = () => { window.clearTimeout(timeout); resolve(); };
          video.addEventListener("seeked", onSeeked, { once: true });
          video.currentTime = time;
        }); } catch {
          onProgress("Quick scan stopped early; keeping the cuts found so far.");
          break;
        }
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      if (previous) {
        let difference = 0;
        for (let pixel = 0; pixel < pixels.length; pixel += 4) {
          difference += Math.abs(pixels[pixel] - previous[pixel]) + Math.abs(pixels[pixel + 1] - previous[pixel + 1]) + Math.abs(pixels[pixel + 2] - previous[pixel + 2]);
        }
        const score = difference / (canvas.width * canvas.height * 3 * 255);
        changes.push({ time, score });
      }
      previous = new Uint8ClampedArray(pixels);
      if (index % 20 === 0 || index === sampleCount - 1) onProgress(`Checking scene ${index + 1} of ${sampleCount}…`);
    }
    // A hard cut is a sharp local change. Comparing with nearby samples adapts
    // to motion-heavy footage while filtering gradual pans and lighting shifts.
    const candidates = changes.flatMap((sample, index) => {
      if (sample.score < 0.18) return [];
      const nearby = [index - 2, index - 1, index + 1, index + 2]
        .filter((neighbor) => neighbor >= 0 && neighbor < changes.length)
        .map((neighbor) => changes[neighbor].score);
      const baseline = nearby.length ? nearby.reduce((sum, score) => sum + score, 0) / nearby.length : 0;
      const previousScore = changes[index - 1]?.score ?? -1;
      const nextScore = changes[index + 1]?.score ?? -1;
      if (sample.score < previousScore || sample.score < nextScore || sample.score < baseline * 1.8 + 0.045) return [];
      return [{ time: Math.max(from, sample.time - span / sampleCount / 2), score: sample.score }];
    });

    const cuts: { time: number; score: number }[] = [];
    for (const candidate of candidates) {
      const nearbyIndex = cuts.findIndex((cut) => candidate.time - cut.time < 0.4);
      if (nearbyIndex < 0) cuts.push(candidate);
      else if (candidate.score > cuts[nearbyIndex].score) cuts[nearbyIndex] = candidate;
    }
    return cuts.map(({ time }) => Number(time.toFixed(3)));
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function detectScenesLocally(file: File, onProgress: (message: string) => void): Promise<number[]> {
  return scanSceneTimes(file, onProgress);
}

export async function processLocally(
  file: File,
  trimStart: number,
  trimEnd: number,
  onProgress: ProcessingUpdate,
  options: { sceneDetection: boolean; captions: boolean; sourceDuration: number },
  knownSceneTimes?: number[],
): Promise<LocalResult> {
  const input = "splice-input";
  const output = "splice-output.mp4";
  const pcmPath = "splice-audio.f32";
  let ffmpeg: FFmpeg | null = null;
  let ffmpegInputReady = false;
  try {
  const sourceDuration = options.sourceDuration;
  const fullRange = Number.isFinite(sourceDuration) && sourceDuration > 0 && trimStart <= 0.01 && Math.abs(trimEnd - sourceDuration) <= 0.05;
  const isMp4 = file.type.toLowerCase() === "video/mp4" || /\.mp4$/i.test(file.name);
  const canReuseOriginal = fullRange && isMp4;
  let video: Blob | null = null;

  if (canReuseOriginal) {
    // A full-length MP4 does not need an encode. Avoid loading the 32 MB WASM
    // core and preserve the original bytes and quality for the common case.
    video = file;
    onProgress("trimming", "working", "No trim needed; keeping the original MP4…");
    onProgress("trimming", "complete", "Original MP4 is ready; no re-encode needed.");
  } else {
    let renderedWithWebCodecs = false;
    if (canUseWebCodecs()) {
      onProgress("trimming", "working", "Preparing browser video acceleration…");
      try {
        video = await processWithWebCodecs(file, trimStart, trimEnd, (message) => onProgress("trimming", "working", message));
        renderedWithWebCodecs = true;
      } catch {
        onProgress("trimming", "working", "WebCodecs cannot encode this file here; switching to FFmpeg…");
      }
    } else {
      onProgress("trimming", "working", "WebCodecs is unavailable; preparing FFmpeg…");
    }

    if (!renderedWithWebCodecs) {
      ffmpeg = await getEngine((message) => onProgress("trimming", "working", message));
      const modeLabel = engineMode === "multi-thread" ? "multi-thread FFmpeg" : "FFmpeg";
      onProgress("trimming", "working", `Preparing source video for ${modeLabel} (${Math.max(1, Math.round(file.size / (1024 * 1024)))} MB)…`);
      await Promise.all([input, output, pcmPath].map((path) => removeFile(ffmpeg!, path)));
      await ffmpeg.writeFile(input, await fetchFile(file));
      ffmpegInputReady = true;

      const selectedDuration = Math.max(0.001, trimEnd - trimStart);
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
        await ffmpeg.exec([
          "-ss", String(trimStart), "-i", input, "-t", String(trimEnd - trimStart),
          "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-stats_period", "0.5", output,
        ]);
      } finally {
        ffmpeg.off("log", onEncodeLog);
      }
      const encoded = await ffmpeg.readFile(output) as Uint8Array;
      const outputBuffer = new ArrayBuffer(encoded.byteLength);
      new Uint8Array(outputBuffer).set(encoded);
      video = new Blob([outputBuffer], { type: "video/mp4" });
    }
    onProgress("trimming", "complete", "Trimmed video is ready.");
  }
  if (!video) throw new Error("The video processor finished without producing an output file.");

  let sceneMarkers: number[] = [];
  let sceneDetectionError: string | undefined;
  if (!options.sceneDetection) {
    onProgress("sceneDetection", "skipped", "Skipped for a faster export.");
  } else {
  try {
    onProgress("sceneDetection", "working", "Finding scene changes in the selected range…");
    if (knownSceneTimes) {
      sceneMarkers = knownSceneTimes
        .filter((time) => time > trimStart && time < trimEnd)
        .map((time) => Number((time - trimStart).toFixed(3)));
    } else {
      const sceneTimes = await scanSceneTimes(file, (message) => onProgress("sceneDetection", "working", message), trimStart, trimEnd);
      sceneMarkers = sceneTimes
        .filter((time) => time > trimStart && time < trimEnd)
        .map((time) => Number((time - trimStart).toFixed(3)));
    }
    onProgress("sceneDetection", "complete", `${sceneMarkers.length} scene ${sceneMarkers.length === 1 ? "change" : "changes"} found.`);
  } catch (error) {
    sceneDetectionError = error instanceof Error ? error.message : "Scene detection could not finish.";
    onProgress("sceneDetection", "failed", sceneDetectionError);
  }
  }

  let captions = "WEBVTT\n\n";
  let captionError: string | undefined;
  if (!options.captions) {
    onProgress("captions", "skipped", "Skipped for a faster export.");
  } else {
  onProgress("captions", "working", "Preparing audio for speech recognition…");
  try {
    ffmpeg ??= await getEngine((message) => onProgress("captions", "working", message));
    await removeFile(ffmpeg, pcmPath);
    if (!ffmpegInputReady) {
      await removeFile(ffmpeg, input);
      onProgress("captions", "working", "Reading source video for captions…");
      await ffmpeg.writeFile(input, await fetchFile(file));
      ffmpegInputReady = true;
    }
    await ffmpeg.exec(["-ss", String(trimStart), "-i", input, "-t", String(trimEnd - trimStart), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", pcmPath]);
    const pcm = await ffmpeg.readFile(pcmPath) as Uint8Array;
    const audio = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
    onProgress("captions", "working", "Loading the English speech model; first use downloads it.");
    const { pipeline } = await import("@huggingface/transformers");
    const createTranscriber = (device: "webgpu" | "wasm") => pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny.en", {
      dtype: "q8",
      device,
      progress_callback: (progress: { status?: string; progress?: number }) => {
        if (progress.status === "progress" && typeof progress.progress === "number") {
          onProgress("captions", "working", `Downloading speech model… ${Math.round(progress.progress)}%`);
        }
      },
    });
    type SpeechTranscriber = Awaited<ReturnType<typeof createTranscriber>>;
    let transcribe: SpeechTranscriber | null = null;
    let transcribeWith: "webgpu" | "wasm" | null = null;
    if (typeof navigator !== "undefined" && "gpu" in navigator) {
      try {
        const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown | null> } }).gpu;
        if (gpu && await gpu.requestAdapter()) {
          onProgress("captions", "working", "Preparing GPU speech model…");
          try {
            transcribe = await createTranscriber("webgpu");
            transcribeWith = "webgpu";
          } catch {
            onProgress("captions", "working", "GPU unavailable; using compatibility mode…");
          }
        }
      } catch {
        onProgress("captions", "working", "GPU unavailable; using compatibility mode…");
      }
    }
    const runTranscription = (model: SpeechTranscriber) => model(audio, {
      chunk_length_s: 25,
      stride_length_s: 4,
      return_timestamps: true,
      no_repeat_ngram_size: 3,
      repetition_penalty: 1.15,
    });
    let result: Awaited<ReturnType<SpeechTranscriber>> | undefined;
    if (transcribe && transcribeWith === "webgpu") {
      onProgress("captions", "working", "Transcribing speech with GPU acceleration…");
      try {
        result = await runTranscription(transcribe);
      } catch {
        // Some browsers initialize WebGPU successfully but cannot run Whisper's
        // full inference graph. Retry the same audio with the portable WASM backend.
        onProgress("captions", "working", "GPU speech processing failed; retrying in compatibility mode…");
        transcribe = null;
      }
    }
    if (!transcribe) transcribe = await createTranscriber("wasm");
    if (!result) {
      onProgress("captions", "working", "Transcribing speech on this device…");
      result = await runTranscription(transcribe);
    }
    // Segment timestamps use Whisper's emitted timestamp tokens. Word timestamps
    // require cross-attention tensors that this ONNX export does not contain.
    const transcript = result as { text?: string; chunks?: { text: string; timestamp: [number, number | null] }[] };
    const selectedDuration = trimEnd - trimStart;
    const cues = (transcript.chunks ?? [])
      .filter((chunk) => Number.isFinite(chunk.timestamp[0]) && chunk.timestamp[0] >= 0 && chunk.timestamp[0] < selectedDuration && chunk.text.trim())
      .map((chunk, index) => {
        const start = Math.max(0, chunk.timestamp[0]);
        const end = Math.max(start + 0.1, Math.min(selectedDuration, chunk.timestamp[1] ?? chunk.timestamp[0] + 0.5));
        return `${index + 1}\n${vttTime(start)} --> ${vttTime(end)}\n${removeRepeatedSpeechWords(chunk.text.trim())}\n`;
      });
    if (cues.length) captions += cues.join("\n");
    else if (transcript.text?.trim()) {
      captions += `1\n${vttTime(0)} --> ${vttTime(selectedDuration)}\n${removeRepeatedSpeechWords(transcript.text.trim())}\n`;
    } else {
      captionError = "No speech was detected in the selected section.";
    }
    onProgress("captions", captionError ? "failed" : "complete", captionError ?? `${cues.length || 1} caption ${cues.length === 1 ? "cue" : "cues"} created.`);
  } catch (error) {
    captionError = describeProcessingError(error, "Speech recognition could not run in this browser.");
    onProgress("captions", "failed", captionError);
  }
  }

  return { video, captions: new Blob([captions], { type: "text/vtt" }), captionError, sceneDetectionError, sceneMarkers };
  } finally {
    if (ffmpeg) await Promise.all([input, output, pcmPath].map((path) => removeFile(ffmpeg!, path)));
  }
}
