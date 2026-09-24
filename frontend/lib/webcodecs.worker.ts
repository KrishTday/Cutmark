import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";

type ProcessRequest = { file: Blob; trimStart: number; trimEnd: number };
type ProcessResponse =
  | { type: "progress"; percent: number }
  | { type: "complete"; buffer: ArrayBuffer }
  | { type: "error"; message: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ProcessRequest>) => void) | null;
  postMessage: (message: ProcessResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = async ({ data }) => {
  try {
    const input = new Input({ source: new BlobSource(data.file), formats: ALL_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("This file has no video track the browser can process.");
    if (!(await videoTrack.canDecode())) throw new Error("This browser cannot decode the video's format with WebCodecs.");
    const audioTrack = await input.getPrimaryAudioTrack();
    if (audioTrack && !(await audioTrack.canDecode())) throw new Error("This browser cannot decode the video's audio format with WebCodecs.");

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      trim: { start: data.trimStart, end: data.trimEnd },
      // Always encode trims so their boundaries are frame/sample accurate.
      copy: false,
      video: { codec: "avc", quality: new Quality("high"), hardwareAcceleration: "prefer-hardware" },
      audio: { codec: "aac", quality: new Quality("high") },
      showWarnings: false,
    });
    if (!conversion.isValid || !conversion.utilizedTracks.includes(videoTrack) || (audioTrack && !conversion.utilizedTracks.includes(audioTrack))) {
      const reason = conversion.discardedTracks[0]?.reason;
      throw new Error(reason ? `WebCodecs cannot encode this video's tracks (${reason}).` : "WebCodecs cannot encode this video in this browser.");
    }

    let lastPercent = -1;
    conversion.onProgress = (progress) => {
      const percent = Math.min(99, Math.max(0, Math.floor(progress * 100)));
      if (percent === lastPercent) return;
      lastPercent = percent;
      workerScope.postMessage({ type: "progress", percent });
    };
    await conversion.execute();
    if (!target.buffer) throw new Error("WebCodecs completed without producing an MP4 file.");
    workerScope.postMessage({ type: "complete", buffer: target.buffer }, [target.buffer]);
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "WebCodecs could not process this video.",
    });
  }
};
