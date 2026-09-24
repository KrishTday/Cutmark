import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export interface LocalResult {
  video: Blob;
  captions: Blob;
  sceneMarkers: number[];
}

let engine: FFmpeg | null = null;

async function getEngine(onProgress: (message: string) => void) {
  if (!engine) {
    engine = new FFmpeg();
    engine.on("log", ({ message }) => {
      if (message.includes("pts_time")) onProgress("Finding scene changes…");
    });
    await engine.load({
      coreURL: "/ffmpeg/ffmpeg-core.js",
      wasmURL: "/ffmpeg/ffmpeg-core.wasm",
    });
  }
  return engine;
}

function vttTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

export async function processLocally(
  file: File,
  trimStart: number,
  trimEnd: number,
  onProgress: (message: string) => void,
): Promise<LocalResult> {
  const ffmpeg = await getEngine(onProgress);
  const input = "splice-input";
  const output = "splice-output.mp4";
  const pcmPath = "splice-audio.f32";
  const names = await ffmpeg.listDir("/");
  if (names.some((entry) => entry.name === input)) await ffmpeg.deleteFile(input);
  if (names.some((entry) => entry.name === output)) await ffmpeg.deleteFile(output);
  if (names.some((entry) => entry.name === pcmPath)) await ffmpeg.deleteFile(pcmPath);
  await ffmpeg.writeFile(input, await fetchFile(file));

  onProgress("Detecting scene changes…");
  const logLines: string[] = [];
  const onLog = ({ message }: { message: string }) => logLines.push(message);
  ffmpeg.on("log", onLog);
  await ffmpeg.exec([
    "-i", input, "-vf", "select='gt(scene,0.35)',showinfo", "-an", "-f", "null", "-",
  ]);
  ffmpeg.off("log", onLog);
  const sceneMarkers = Array.from(logLines.join("\n").matchAll(/pts_time:([\d.]+)/g))
    .map((match) => Number(match[1]))
    .filter((time) => time > trimStart && time < trimEnd)
    .map((time) => Number((time - trimStart).toFixed(3)));

  let captions = "WEBVTT\n\n";
  try {
    onProgress("Preparing audio for captions…");
    await ffmpeg.exec(["-ss", String(trimStart), "-i", input, "-t", String(trimEnd - trimStart), "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", pcmPath]);
    const pcm = await ffmpeg.readFile(pcmPath) as Uint8Array;
    const audio = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
    onProgress("Loading Whisper Tiny speech model… (first use downloads it)");
    const { pipeline } = await import("@huggingface/transformers");
    const transcribe = await pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny.en", {
      dtype: "q8",
      device: typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm",
      progress_callback: (progress: { status?: string; progress?: number }) => {
        if (progress.status === "progress" && typeof progress.progress === "number") {
          onProgress(`Downloading speech model… ${Math.round(progress.progress)}%`);
        }
      },
    });
    onProgress("Transcribing speech on this device…");
    const result = await transcribe(audio, { chunk_length_s: 25, stride_length_s: 4, return_timestamps: "word" });
    const chunks = (result as { chunks?: { text: string; timestamp: [number, number | null] }[] }).chunks ?? [];
    captions += chunks
      .filter((chunk) => chunk.timestamp[0] >= 0 && chunk.timestamp[0] < trimEnd - trimStart)
      .map((chunk, index) => {
        const start = Math.max(0, chunk.timestamp[0]);
        const end = Math.min(trimEnd - trimStart, chunk.timestamp[1] ?? chunk.timestamp[0] + 0.5);
        return `${index + 1}\n${vttTime(start)} --> ${vttTime(Math.max(start + 0.1, end))}\n${chunk.text.trim()}\n`;
      }).join("\n");
  } catch (error) {
    console.warn("On-device transcription was unavailable; exporting the clip without captions.", error);
  }

  onProgress("Exporting trimmed video…");
  await ffmpeg.exec([
    "-ss", String(trimStart), "-i", input, "-t", String(trimEnd - trimStart),
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output,
  ]);
  const encoded = await ffmpeg.readFile(output) as Uint8Array;
  const outputBuffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(outputBuffer).set(encoded);
  const video = new Blob([outputBuffer], { type: "video/mp4" });
  await ffmpeg.deleteFile(input);
  await ffmpeg.deleteFile(output);
  try { await ffmpeg.deleteFile(pcmPath); } catch { /* Audio extraction may have failed. */ }
  return { video, captions: new Blob([captions], { type: "text/vtt" }), sceneMarkers };
}
