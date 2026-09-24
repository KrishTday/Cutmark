"use client";

interface SpecPanelProps {
  fileName?: string;
  fileSize?: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  status: "IDLE" | "PROCESSING" | "COMPLETE" | "FAILED";
  result?: { videoUrl: string; captionsUrl: string; sceneMarkers: number[] } | null;
  errorMessage?: string | null;
}

function formatBytes(bytes?: number) {
  return bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : "—";
}
function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-baseline justify-between border-b border-line py-2 text-sm"><span className="text-ink-muted">{label}</span><span className="font-mono">{value}</span></div>;
}

export default function SpecPanel({ fileName, fileSize, duration, trimStart, trimEnd, status, result, errorMessage }: SpecPanelProps) {
  const statusLabel = { IDLE: "ready", PROCESSING: "processing on device", COMPLETE: "complete", FAILED: "failed" }[status];
  return <aside className="border border-line p-4">
    <h2 className="font-display text-lg font-semibold">Clip details</h2>
    <div className="mt-3">
      <Row label="File" value={fileName ?? "—"} />
      <Row label="Size" value={formatBytes(fileSize)} />
      <Row label="Source length" value={duration ? formatDuration(duration) : "—"} />
      <Row label="Trim range" value={duration ? `${formatDuration(trimStart)} – ${formatDuration(trimEnd)}` : "—"} />
      <Row label="Status" value={statusLabel} />
      <Row label="Scene cuts" value={result?.sceneMarkers.length ?? "—"} />
      <Row label="Captions" value={result ? "ready" : "—"} />
    </div>
    {errorMessage && <p className="mt-3 border border-accent-strong bg-accent/5 p-2 text-sm text-accent-strong">{errorMessage}</p>}
    <p className="mt-4 text-xs leading-relaxed text-ink-muted">Video and audio are processed in your browser. The speech model is downloaded from Hugging Face on first use and cached by your browser.</p>
  </aside>;
}
