"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import UploadZone from "./UploadZone";
import Timeline from "./Timeline";
import VideoPreview from "./VideoPreview";
import SpecPanel from "./SpecPanel";
import { processLocally } from "@/lib/local-processing";

type Status = "IDLE" | "PROCESSING" | "COMPLETE" | "FAILED";
type Result = { videoUrl: string; captionsUrl: string; sceneMarkers: number[] };

export default function Editor() {
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [status, setStatus] = useState<Status>("IDLE");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef<Result | null>(null);

  const clearResult = useCallback(() => {
    if (resultRef.current) {
      URL.revokeObjectURL(resultRef.current.videoUrl);
      URL.revokeObjectURL(resultRef.current.captionsUrl);
    }
    resultRef.current = null;
    setResult(null);
  }, []);

  useEffect(() => () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (resultRef.current) {
      URL.revokeObjectURL(resultRef.current.videoUrl);
      URL.revokeObjectURL(resultRef.current.captionsUrl);
    }
  }, [objectUrl]);

  const handleFileSelected = useCallback((selected: File) => {
    setFile(selected);
    clearResult();
    setErrorMessage(null);
    setStatus("IDLE");
    setProgress("");
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(selected);
    });
  }, [clearResult]);

  const handleProcess = useCallback(async () => {
    if (!file) return;
    clearResult();
    setStatus("PROCESSING");
    setProgress("Starting browser video engine…");
    setErrorMessage(null);
    try {
      const processed = await processLocally(file, trimStart, trimEnd, setProgress);
      const next: Result = {
        videoUrl: URL.createObjectURL(processed.video),
        captionsUrl: URL.createObjectURL(processed.captions),
        sceneMarkers: processed.sceneMarkers,
      };
      resultRef.current = next;
      setResult(next);
      setStatus("COMPLETE");
      setProgress("Ready — your video stayed on this device.");
    } catch (err) {
      setStatus("FAILED");
      setErrorMessage(err instanceof Error ? err.message : "Unable to process this video in the browser.");
    }
  }, [file, trimStart, trimEnd, clearResult]);

  const isBusy = status === "PROCESSING";
  const previewSrc = result?.videoUrl ?? objectUrl;

  return (
    <section className="py-10">
      {!file && <UploadZone onFileSelected={handleFileSelected} />}
      {file && previewSrc && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_1fr]">
          <div>
            <VideoPreview
              ref={videoRef}
              src={previewSrc}
              captionsUrl={result?.captionsUrl}
              onLoadedMetadata={(d) => { setDuration(d); if (result) { setTrimStart(0); setTrimEnd(d); } else { setTrimStart(0); setTrimEnd(d); } }}
              onTimeUpdate={setCurrentTime}
            />
            <div className="mt-4">
              <Timeline
                duration={duration}
                trimStart={trimStart}
                trimEnd={trimEnd}
                currentTime={currentTime}
                sceneMarkers={result?.sceneMarkers}
                disabled={isBusy || status === "COMPLETE"}
                onChange={(s, e) => { setTrimStart(s); setTrimEnd(e); }}
                onScrub={(t) => { if (videoRef.current) videoRef.current.currentTime = t; }}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={handleProcess} disabled={isBusy || status === "COMPLETE"} className="border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40">
                {status === "IDLE" && "Process on this device"}
                {status === "PROCESSING" && "Processing…"}
                {status === "COMPLETE" && "Done"}
                {status === "FAILED" && "Retry"}
              </button>
              {result && <a href={result.videoUrl} download={`${file.name.replace(/\.[^.]+$/, "")}-splice.mp4`} className="border border-line px-4 py-2 text-sm text-ink hover:border-line-strong">Download MP4</a>}
              {result && <a href={result.captionsUrl} download="captions.vtt" className="border border-line px-4 py-2 text-sm text-ink hover:border-line-strong">Download captions</a>}
              <button onClick={() => { setFile(null); setObjectUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; }); clearResult(); setStatus("IDLE"); }} disabled={isBusy} className="border border-line px-4 py-2 text-sm text-ink-muted hover:border-line-strong disabled:opacity-40">Choose another file</button>
            </div>
            {progress && <p className="mt-3 text-sm text-ink-muted" aria-live="polite">{progress}</p>}
          </div>
          <SpecPanel fileName={file.name} fileSize={file.size} duration={duration} trimStart={trimStart} trimEnd={trimEnd} status={status} result={result} errorMessage={errorMessage} />
        </div>
      )}
    </section>
  );
}
