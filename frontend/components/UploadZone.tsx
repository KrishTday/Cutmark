"use client";

import { useCallback, useRef, useState } from "react";

interface UploadZoneProps { onFileSelected: (file: File) => void; }
const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"];

export default function UploadZone({ onFileSelected }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndEmit = useCallback((file: File | undefined) => {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_TYPES.includes(file.type) && !["mp4", "mov", "webm", "mkv"].includes(extension ?? "")) {
      setError("Unsupported file type. Choose an MP4, MOV, WebM, or MKV video.");
      return;
    }
    setError(null);
    onFileSelected(file);
  }, [onFileSelected]);

  return (
    <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.72fr)]">
      <div className="p-5 sm:p-7 lg:p-8">
        <div
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setIsDragging(false); validateAndEmit(event.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputRef.current?.click(); } }}
          role="button"
          tabIndex={0}
          aria-label="Choose a video or drop one here"
          className={`group relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed px-5 py-8 text-center transition-[background-color,border-color,transform] duration-200 focus-visible:outline-accent ${isDragging ? "-translate-y-0.5 border-accent bg-[#23232A]" : "border-line-strong bg-[#15161B] hover:-translate-y-0.5 hover:border-accent/70 hover:bg-[#1B1C22]"}`}
        >
          <div className="absolute inset-x-5 top-4 flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-faint sm:inset-x-6">
            <span>Source video</span><span>One clip at a time</span>
          </div>
          <span className="relative mb-5 grid size-12 place-items-center rounded-xl border border-line-strong bg-surface-raised text-accent transition-transform duration-200 group-hover:-translate-y-0.5" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-6" fill="none"><path d="M12 15V4m0 0L8 8m4-4 4 4M5 14v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <p className="text-base font-semibold tracking-[-0.025em] text-ink">{isDragging ? "Drop to add video" : "Choose a video to start"}</p>
          <p className="mt-2 text-xs text-ink-muted">Drag and drop, or <span className="font-medium text-accent">browse files</span></p>
          <div className="mt-5 flex flex-wrap justify-center gap-1.5">
            {["MP4", "MOV", "WEBM", "MKV"].map((format) => <span key={format} className="rounded-md border border-white/[0.07] bg-black/15 px-2 py-1 font-mono text-[9px] tracking-[0.08em] text-[#9B8BA7]">{format}</span>)}
          </div>
          <input ref={inputRef} type="file" tabIndex={-1} accept={ACCEPTED_TYPES.join(",") + ",.mp4,.mov,.webm,.mkv"} className="sr-only" onChange={(event) => { validateAndEmit(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl border border-rose-900/70 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">{error}</p>}
      </div>

      <aside className="border-t border-line bg-[#15161B] px-5 py-6 sm:px-7 sm:py-8 lg:border-l lg:border-t-0 lg:px-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-faint">A simple workflow</p>
        <ol className="mt-5 space-y-2">
          <li className="relative flex gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-white/[0.025]">
            <span className="z-[1] grid size-7 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-raised font-mono text-[9px] text-accent">01</span>
            <span><span className="block text-xs font-semibold text-ink">Set the in and out</span><span className="mt-1 block text-[11px] leading-[1.6] text-ink-muted">Preview the clip, then frame the exact range you want to keep.</span></span>
          </li>
          <li className="relative flex gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-white/[0.025]">
            <span className="z-[1] grid size-7 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-raised font-mono text-[9px] text-ink-muted">02</span>
            <span><span className="block text-xs font-semibold text-ink">Find the cuts</span><span className="mt-1 block text-[11px] leading-[1.6] text-ink-muted">Jump between scene changes and let the edges snap into place.</span></span>
          </li>
          <li className="relative flex gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-white/[0.025]">
            <span className="z-[1] grid size-7 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-raised font-mono text-[9px] text-ink-muted">03</span>
            <span><span className="block text-xs font-semibold text-ink">Finish the details</span><span className="mt-1 block text-[11px] leading-[1.6] text-ink-muted">Review captions, refine the wording, and export your work.</span></span>
          </li>
        </ol>
        <p className="mt-5 rounded-lg border border-line bg-[#111217] px-3.5 py-3 text-[10px] leading-[1.6] text-ink-muted">Your source clip stays in the browser throughout the edit.</p>
      </aside>
    </div>
  );
}
