"use client";

interface SpecPanelProps {
  fileName?: string;
  fileSize?: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  status: "IDLE" | "PROCESSING" | "COMPLETE" | "FAILED";
  result?: { videoUrl: string; captionsUrl?: string; captionError?: string; sceneMarkers: number[] } | null;
}

function formatBytes(bytes?: number) {
  return bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : "—";
}
function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-3"><dt className="text-xs text-ink-muted">{label}</dt><dd className="max-w-[65%] truncate text-right text-xs font-medium tabular-nums text-ink" title={typeof children === "string" ? children : undefined}>{children}</dd></div>;
}

export default function SpecPanel({ fileName, fileSize, duration, trimStart, trimEnd, status, result }: SpecPanelProps) {
  const statusText = { IDLE: "Ready", PROCESSING: "Processing", COMPLETE: "Complete", FAILED: "Needs attention" }[status];
  return <aside className="space-y-4">
    <section className="rounded-xl border border-line bg-[#1A1B21] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">Clip details</h2>
        <span className={`text-[11px] font-medium ${status === "FAILED" ? "text-rose-300" : status === "COMPLETE" ? "text-ink" : status === "PROCESSING" ? "text-accent" : "text-ink-muted"}`}>{statusText}</span>
      </div>
      <dl className="mt-3 divide-y divide-line/70 border-y border-line/70">
        <Detail label="File name">{fileName ?? "—"}</Detail>
        <Detail label="File size">{formatBytes(fileSize)}</Detail>
        <Detail label="Duration">{duration ? formatDuration(duration) : "—"}</Detail>
        <Detail label="Selected range">{duration ? `${formatDuration(trimStart)} – ${formatDuration(trimEnd)}` : "—"}</Detail>
      </dl>
    </section>

    <section className="rounded-xl border border-line bg-[#1A1B21] p-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">Analysis</h2>
      <dl className="mt-3 divide-y divide-line/70 border-y border-line/70">
        <div className="flex items-center justify-between py-3">
          <span className="text-xs text-ink-muted">Scene changes</span>
          <span className="text-xs font-medium tabular-nums text-ink">{result?.sceneMarkers.length ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between border-t border-line/80 py-3">
          <span className="text-xs text-ink-muted">Captions</span>
          <span className={`text-xs font-medium ${result?.captionError ? "text-amber-200" : "text-ink"}`}>{result?.captionError ? "Unavailable" : result?.captionsUrl ? "Subtitles ready" : "Not generated"}</span>
        </div>
      </dl>
    </section>

    <section className="rounded-xl border border-line bg-[#1A1B21] p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-ink"><span className="grid size-6 place-items-center rounded-md bg-accent-soft text-accent"><svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true"><path d="M8 2.25 13 4v3.75c0 3.2-2.13 5.16-5 6-2.87-.84-5-2.8-5-6V4l5-1.75Z" stroke="currentColor" strokeWidth="1.2"/><path d="m5.8 7.8 1.45 1.45L10.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>Local processing</p>
      <p className="mt-2 text-[11px] leading-[1.6] text-ink-muted">Video stays on this device. The speech model downloads from Hugging Face on first use.</p>
    </section>
  </aside>;
}
