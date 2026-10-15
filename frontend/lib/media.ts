import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
export interface MediaMetadata {
  duration: number; width: number; height: number; hasAudio: boolean; frameRate: number | null;
  videoCodec: string | null; audioCodec: string | null; hdr: boolean;
}
export async function probeMedia(blob: Blob, signal?: AbortSignal): Promise<MediaMetadata> {
  if (!blob.size) throw new Error("The media file is empty.");
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const abort = () => input.dispose();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("No readable video track was found. Choose a video with a supported container.");
    const audio = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("This file has no valid video duration.");
    const metrics = await video.computeFrameRateMetrics({ targetPacketCount: 256 });
    return { duration, width: await video.getDisplayWidth(), height: await video.getDisplayHeight(), hdr: await video.hasHighDynamicRange(), hasAudio: Boolean(audio),
      frameRate: metrics.frameRateIsConstant ? metrics.underlyingFrameRate : null,
      videoCodec: await video.getCodec(), audioCodec: audio ? await audio.getCodec() : null };
  } finally { signal?.removeEventListener("abort", abort); input.dispose(); }
}
/** Inspect actual presentation timestamps, including VFR and reordered packets. */
export async function adjacentFrame(blob: Blob, time: number, direction: -1 | 1): Promise<number | null> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video || !await video.canDecode()) return null;
    const sink = new VideoSampleSink(video);
    const current = await sink.getSample(Math.max(0, time));
    if (!current) return null;
    const timestamp = current.timestamp;
    current.close();
    if (direction === -1) {
      const previous = await sink.getSample(Math.max(0, timestamp - 0.000001));
      if (!previous) return null;
      const value = previous.timestamp; previous.close(); return value;
    }
    for await (const sample of sink.samples(timestamp)) {
      const value = sample.timestamp; sample.close();
      if (value > timestamp + 0.000001) return value;
    }
    return timestamp;
  } finally { input.dispose(); }
}
export async function lastIncludedFrame(blob: Blob, end: number): Promise<number | null> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video || !await video.canDecode()) return null;
    const sample = await new VideoSampleSink(video).getSample(Math.max(0, end - 0.000001));
    if (!sample) return null;
    const time = sample.timestamp; sample.close(); return time;
  } finally { input.dispose(); }
}
export async function validateOutput(blob: Blob, expected: MediaMetadata, expectedDuration: number, signal?: AbortSignal): Promise<MediaMetadata> {
  const metadata = await probeMedia(blob, signal);
  signal?.throwIfAborted();
  if (expected.hdr && !metadata.hdr) throw new Error("The export changed HDR color metadata. The file was not accepted.");
  if (metadata.hasAudio !== expected.hasAudio) throw new Error("The export lost an expected media track. Retry with the compatible processor.");
  if (metadata.width !== expected.width || metadata.height !== expected.height) throw new Error("The export dimensions differ from the requested output. The file was not accepted.");
  const tolerance = Math.max(0.1, expected.frameRate ? 2 / expected.frameRate : 0.25);
  if (Math.abs(metadata.duration - expectedDuration) > tolerance) throw new Error("The exported duration differs from your selection. Retry the export.");
  await new Promise<void>((resolve, reject) => {
    const video = document.createElement("video"), url = URL.createObjectURL(blob);
    const cleanup = () => { signal?.removeEventListener("abort", abort); video.onloadeddata = null; video.onerror = null; clearTimeout(timer); video.pause(); video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("The export could not be decoded in time. Try the compatible processor.")); }, 15000);
    const abort = () => { cleanup(); reject(new DOMException("Cancelled", "AbortError")); };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    video.muted = true; video.preload = "auto";
    video.onloadeddata = () => { const valid = video.videoWidth > 0; cleanup(); if (valid) resolve(); else reject(new Error("The export has no playable video frame.")); };
    video.onerror = () => { cleanup(); reject(new Error("The exported file cannot be played by this browser.")); };
    video.src = url; video.load();
  });
  return metadata;
}
