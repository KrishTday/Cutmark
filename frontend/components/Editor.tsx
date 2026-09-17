"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import UploadZone from "./UploadZone";
import Timeline from "./Timeline";
import VideoPreview from "./VideoPreview";
import SpecPanel from "./SpecPanel";
import { getPresignedUpload, uploadToS3, startJob, getJobStatus } from "@/lib/api";
import { JobStatusResponse } from "@/lib/types";

type Status = "IDLE" | "UPLOADING" | "PROCESSING" | "COMPLETE" | "FAILED";

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 150; // 10 minutes at 4s intervals

export default function Editor() {
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const [status, setStatus] = useState<Status>("IDLE");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<JobStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pollHandle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollJobStatusRef = useRef<(jobId: string, attempt?: number) => void>(() => {});

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (pollHandle.current) clearTimeout(pollHandle.current);
    };
  }, [objectUrl]);

  const handleFileSelected = useCallback((selected: File) => {
    setFile(selected);
    setResult(null);
    setErrorMessage(null);
    setStatus("IDLE");
    setUploadProgress(0);
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(selected);
    });
  }, []);

  const handleLoadedMetadata = useCallback((d: number) => {
    setDuration(d);
    setTrimStart(0);
    setTrimEnd(d);
  }, []);

  const pollJobStatus = useCallback((jobId: string, attempt = 0) => {
    if (attempt >= MAX_POLL_ATTEMPTS) {
      setStatus("FAILED");
      setErrorMessage("Processing timed out. Check the Step Functions execution in the AWS console.");
      return;
    }
    pollHandle.current = setTimeout(async () => {
      try {
        const job = await getJobStatus(jobId);
        if (job.status === "COMPLETE") {
          setResult(job);
          setStatus("COMPLETE");
        } else if (job.status === "FAILED") {
          setResult(job);
          setStatus("FAILED");
          setErrorMessage(job.error ?? "Processing failed.");
        } else {
          setResult(job); // captions can land before the trim/scene-detect branch finishes
          pollJobStatusRef.current(jobId, attempt + 1);
        }
      } catch {
        pollJobStatusRef.current(jobId, attempt + 1);
      }
    }, POLL_INTERVAL_MS);
  }, []);

  pollJobStatusRef.current = pollJobStatus;

  const handleProcess = useCallback(async () => {
    if (!file) return;
    setErrorMessage(null);
    try {
      setStatus("UPLOADING");
      const presigned = await getPresignedUpload(file.name, file.type);
      await uploadToS3(presigned.uploadUrl, file, setUploadProgress);

      setStatus("PROCESSING");
      await startJob(presigned.jobId, presigned.key, trimStart, trimEnd);
      pollJobStatus(presigned.jobId);
    } catch (err) {
      setStatus("FAILED");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, [file, trimStart, trimEnd, pollJobStatus]);

  const isBusy = status === "UPLOADING" || status === "PROCESSING";

  return (
    <section className="py-10">
      {!file && <UploadZone onFileSelected={handleFileSelected} />}

      {file && objectUrl && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_1fr]">
          <div>
            <VideoPreview
              ref={videoRef}
              src={objectUrl}
              captionsUrl={result?.captionsUrl}
              onLoadedMetadata={handleLoadedMetadata}
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
                onChange={(s, e) => {
                  setTrimStart(s);
                  setTrimEnd(e);
                }}
                onScrub={(t) => {
                  if (videoRef.current) videoRef.current.currentTime = t;
                }}
              />
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={handleProcess}
                disabled={isBusy || status === "COMPLETE"}
                className="border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
              >
                {status === "IDLE" && "Process clip"}
                {status === "UPLOADING" && `Uploading — ${uploadProgress}%`}
                {status === "PROCESSING" && "Processing…"}
                {status === "COMPLETE" && "Done"}
                {status === "FAILED" && "Retry"}
              </button>
              <button
                onClick={() => {
                  setFile(null);
                  setObjectUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return null;
                  });
                  setStatus("IDLE");
                  setResult(null);
                }}
                disabled={isBusy}
                className="border border-line px-4 py-2 text-sm text-ink-muted hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Choose another file
              </button>
            </div>
          </div>

          <SpecPanel
            fileName={file.name}
            fileSize={file.size}
            duration={duration}
            trimStart={trimStart}
            trimEnd={trimEnd}
            status={status}
            uploadProgress={uploadProgress}
            result={result}
            errorMessage={errorMessage}
          />
        </div>
      )}
    </section>
  );
}