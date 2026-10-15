import { pipeline } from "@huggingface/transformers";
import { serializeCaptions } from "./captions";
const scope = self as unknown as { onmessage: ((event: MessageEvent<{ audio: Float32Array; duration: number }>) => void) | null; postMessage: (value: unknown) => void };
scope.onmessage = async ({ data }) => {
  let model: Awaited<ReturnType<typeof pipeline<"automatic-speech-recognition">>> | null = null;
  try {
    scope.postMessage({ type: "progress", message: "Loading the English model; cached downloads are reused…" });
    model = await pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny.en", {
      dtype: "q8", device: "wasm",
      progress_callback: (progress: { status?: string; file?: string; progress?: number }) => {
        if (progress.status === "progress" && typeof progress.progress === "number")
          scope.postMessage({ type: "progress", message: `Downloading model asset ${progress.file ?? ""}: ${Math.round(progress.progress)}%` });
      },
    });
    scope.postMessage({ type: "progress", message: "Transcribing English speech on this device…" });
    const result = await model(data.audio, { chunk_length_s: 25, stride_length_s: 4, return_timestamps: true });
    const transcript = result as { text?: string; chunks?: { text: string; timestamp: [number, number | null] }[] };
    const cues = (transcript.chunks ?? []).flatMap((chunk, index) => {
      const start = Math.max(0, chunk.timestamp[0]), end = Math.min(data.duration, chunk.timestamp[1] ?? start + 0.5);
      return Number.isFinite(start) && end > start && chunk.text.trim() ? [{ id: index + 1, start, end, text: chunk.text.trim() }] : [];
    });
    if (!cues.length && transcript.text?.trim()) cues.push({ id: 1, start: 0, end: data.duration, text: transcript.text.trim() });
    if (!cues.length) throw Object.assign(new Error("No speech was found. Video editing and export remain available."), { name: "NoSpeechError" });
    scope.postMessage({ type: "complete", vtt: serializeCaptions(cues) });
  } catch (error) {
    scope.postMessage({ type: "error", name: error instanceof Error ? error.name : "Error", message: error instanceof Error ? error.message : "Caption generation failed. Retry when the model download is available." });
  } finally { await model?.dispose(); }
};
