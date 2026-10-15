import { ALL_FORMATS, AudioSampleSink, BlobSource, CanvasSink, Input } from "mediabunny";
import { buildPeakPyramid } from "./timeline-view";
type Request = { kind: "thumbnails"; file: File; times: number[] } | { kind: "waveform"; file: File; duration: number };
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (data: unknown, transfer?: Transferable[]) => void };
scope.onmessage = async ({ data }) => {
  const input = new Input({ source: new BlobSource(data.file), formats: ALL_FORMATS });
  try {
    if (data.kind === "thumbnails") {
      const track = await input.getPrimaryVideoTrack();
      if (!track || !await track.canDecode()) throw new Error("This browser cannot decode timeline thumbnails for this video. Editing remains available.");
      const sink = new CanvasSink(track, { width: 160, poolSize: 1 });
      for (const time of data.times) {
        const frame = await sink.getCanvas(time);
        if (!frame) continue;
        const canvas = frame.canvas as OffscreenCanvas;
        const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
        scope.postMessage({ type: "thumbnail", time, frameTime: frame.timestamp, blob });
      }
      scope.postMessage({ type: "complete" });
    } else {
      const track = await input.getPrimaryAudioTrack();
      if (!track) { scope.postMessage({ type: "absent" }); return; }
      if (!await track.canDecode()) throw new Error("Waveform unavailable for this audio codec. Trimming and export remain available.");
      const binCount = Math.max(1, Math.min(262144, Math.ceil(data.duration * 200)));
      const peaks = new Float32Array(binCount), binSeconds = data.duration / binCount;
      let maximum = 0, lastPercent = -1;
      for await (const sample of new AudioSampleSink(track).samples()) {
        try {
          if (sample.numberOfFrames > 1048576) throw new Error("This audio packet is too large for waveform analysis on this device.");
          const plane = new Float32Array(sample.numberOfFrames);
          for (let channel = 0; channel < sample.numberOfChannels; channel++) {
            sample.copyTo(plane, { planeIndex: channel, format: "f32-planar" });
            for (let frame = 0; frame < plane.length; frame++) {
              const index = Math.floor((sample.timestamp + frame / sample.sampleRate) / binSeconds);
              if (index < 0 || index >= peaks.length) continue;
              const peak = Math.abs(plane[frame]);
              if (!Number.isFinite(peak)) continue;
              peaks[index] = Math.max(peaks[index], peak); maximum = Math.max(maximum, peak);
            }
          }
          const percent = Math.min(99, Math.floor((sample.timestamp + sample.duration) / data.duration * 100));
          if (percent >= lastPercent + 2) { lastPercent = percent; scope.postMessage({ type: "progress", percent }); }
        } finally { sample.close(); }
      }
      const levels = buildPeakPyramid(peaks);
      scope.postMessage({ type: "waveform", levels, binSeconds, maximum }, levels.map((level) => level.buffer));
    }
  } catch (error) {
    scope.postMessage({ type: "error", message: error instanceof Error ? error.message : "Timeline analysis could not finish. Editing remains available." });
  } finally { input.dispose(); }
};
