"use client";

import { JobStatusResponse } from "@/lib/types";

interface SpecPanelProps {
  fileName?: string;
  fileSize?: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  status: "IDLE" | "UPLOADING" | "PROCESSING" | "COMPLETE" | "FAILED";
  uploadProgress?: number;
  result?: JobStatusResponse | null;
  errorMessage?: string | null;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line py-2 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

const STATUS_LABEL: Record<SpecPanelProps["status"], string> = {
  IDLE: "waiting for file",
  UPLOADING: "uploading",
  PROCESSING: "processing",
  COMPLETE: "complete",
  FAILED: "failed",
};

export default function SpecPanel({
  fileName,
  fileSize,
  duration,
  trimStart,
  trimEnd,
  status,
  uploadProgress,
  result,
  errorMessage,
}: SpecPanelProps) {
  return (
    <div className="border border-line p-4">
      <h2 className="font-display text-lg font-semibold">Job spec</h2>
      <div className="mt-3">
        <Row label="File" value={fileName ?? "—"} />
        <Row label="Size" value={formatBytes(fileSize)} />
        <Row label="Source length" value={duration ? formatDuration(duration) : "—"} />
        <Row label="Trim range" value={duration ? `${formatDuration(trimStart)} – ${formatDuration(trimEnd)}` : "—"} />
        <Row
          label="Status"
          value={status === "UPLOADING" && uploadProgress !== undefined ? `uploading ${uploadProgress}%` : STATUS_LABEL[status]}
        />
        <Row label="Scene cuts" value={result?.sceneMarkers?.length ?? "—"} />
        <Row label="Captions" value={result?.captionsUrl ? "ready" : status === "PROCESSING" ? "pending" : "—"} />
      </div>

      {errorMessage && (
        <p className="mt-3 border border-accent-strong bg-accent/5 p-2 text-sm text-accent-strong">
          {errorMessage}
        </p>
      )}

      {result?.status === "COMPLETE" && result.videoUrl && (
        <a
          href={result.videoUrl}
          download
          className="mt-4 block border border-ink bg-ink px-3 py-2 text-center text-sm text-paper hover:bg-accent-strong"
        >
          Download processed clip
        </a>
      )}
    </div>
  );
}
