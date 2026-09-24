"use client";

import { useCallback, useRef } from "react";

interface TimelineProps {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  sceneMarkers?: number[];
  snapToScenes?: boolean;
  disabled?: boolean;
  onChange: (start: number, end: number) => void;
  onScrub?: (time: number) => void;
}

type Handle = "start" | "end";

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = (safeSeconds % 60).toFixed(2).padStart(5, "0");
  return `${String(minutes).padStart(2, "0")}:${remainder}`;
}

function parseTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes(":")) {
    const [minutes, seconds] = trimmed.split(":");
    const parsedMinutes = Number(minutes);
    const parsedSeconds = Number(seconds);
    if (!Number.isFinite(parsedMinutes) || !Number.isFinite(parsedSeconds) || parsedMinutes < 0 || parsedSeconds < 0 || parsedSeconds >= 60) return null;
    return parsedMinutes * 60 + parsedSeconds;
  }
  const seconds = Number(trimmed);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export default function Timeline({
  duration,
  trimStart,
  trimEnd,
  currentTime,
  sceneMarkers = [],
  snapToScenes = false,
  disabled = false,
  onChange,
  onScrub,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeHandle = useRef<Handle | null>(null);
  const timeFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track || duration <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const moveHandle = useCallback((handle: Handle, time: number) => {
    let targetTime = time;
    if (snapToScenes && sceneMarkers.length) {
      const nearest = sceneMarkers.reduce((best, marker) => Math.abs(marker - time) < Math.abs(best - time) ? marker : best, sceneMarkers[0]);
      const snapThreshold = Math.max(0.2, duration * 0.008);
      if (Math.abs(nearest - time) <= snapThreshold) targetTime = nearest;
    }
    if (handle === "start") onChange(Math.min(Math.max(0, targetTime), trimEnd - 0.1), trimEnd);
    else onChange(trimStart, Math.max(Math.min(duration, targetTime), trimStart + 0.1));
  }, [duration, onChange, sceneMarkers, snapToScenes, trimEnd, trimStart]);

  const handleKeyDown = (handle: Handle) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 1 : 0.1;
    let time: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") time = (handle === "start" ? trimStart : trimEnd) - step;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") time = (handle === "start" ? trimStart : trimEnd) + step;
    if (event.key === "Home") time = handle === "start" ? 0 : trimStart + 0.1;
    if (event.key === "End") time = handle === "start" ? trimEnd - 0.1 : duration;
    if (time !== null) {
      event.preventDefault();
      moveHandle(handle, time);
    }
  };

  const finishTextEdit = (handle: Handle, draft: string, input: HTMLInputElement) => {
    const parsed = parseTime(draft);
    if (parsed === null) {
      input.value = formatTime(handle === "start" ? trimStart : trimEnd);
      return;
    }
    moveHandle(handle, parsed);
  };

  const pct = (time: number) => duration > 0 ? (time / duration) * 100 : 0;
  const selectedDuration = Math.max(0, trimEnd - trimStart);
  const rulerTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section aria-label="Clip trim controls" className="select-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Trim clip</h2>
          <p className="mt-1 text-[11px] text-ink-muted">Drag either edge or enter an exact time.</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-semibold tabular-nums text-ink">{formatTime(selectedDuration)}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-ink-faint">Selected duration</p>
        </div>
      </div>

      <div className="mt-4 px-3">
        <div className="relative mb-1 h-5 text-[10px] font-mono tabular-nums text-ink-faint" aria-hidden="true">
          {rulerTicks.map((tick, index) => {
            const time = tick * duration;
            const transform = index === 0 ? "translateX(0)" : index === rulerTicks.length - 1 ? "translateX(-100%)" : "translateX(-50%)";
            return <span key={tick} className="absolute top-0" style={{ left: `${tick * 100}%`, transform }}>{formatTime(time)}</span>;
          })}
        </div>

        <div
          ref={trackRef}
          onClick={(event) => { if (!disabled && onScrub) onScrub(timeFromClientX(event.clientX)); }}
          className={`relative h-[72px] overflow-visible rounded-xl border border-line-strong bg-[#211A2D] shadow-inner shadow-black/30 ${disabled ? "cursor-default" : "cursor-crosshair"}`}
          aria-label="Video timeline"
        >
          <div className="absolute inset-y-0 left-0 bg-[#100C17]/80" style={{ width: `${pct(trimStart)}%` }} />
          <div className="absolute inset-y-0 right-0 bg-[#100C17]/80" style={{ width: `${100 - pct(trimEnd)}%` }} />
          <div className="absolute inset-y-0 border-x border-accent/75 bg-trim-selection/80" style={{ left: `${pct(trimStart)}%`, width: `${Math.max(0, pct(trimEnd) - pct(trimStart))}%` }} />

          {rulerTicks.map((tick) => <span key={tick} className="pointer-events-none absolute bottom-0 top-0 z-[1] w-px bg-white/10" style={{ left: `${tick * 100}%` }} />)}

          {sceneMarkers.map((time, index) => <span key={`${time}-${index}`} className="pointer-events-none absolute inset-y-0 z-[2] w-px bg-marker/80" style={{ left: `${pct(time)}%` }} title={`Scene change at ${formatTime(time)}`} />)}

          <span className="pointer-events-none absolute bottom-0 top-0 z-[4] w-px bg-marker shadow-[0_0_8px_rgba(255,143,120,0.65)]" style={{ left: `${pct(currentTime)}%` }} aria-label={`Playhead at ${formatTime(currentTime)}`} />

          {(["start", "end"] as const).map((handle) => {
            const time = handle === "start" ? trimStart : trimEnd;
            const max = handle === "start" ? Math.max(0, trimEnd - 0.1) : duration;
            const min = handle === "start" ? 0 : Math.min(duration, trimStart + 0.1);
            return (
              <button
                key={handle}
                type="button"
                role="slider"
                aria-label={handle === "start" ? "Clip in point" : "Clip out point"}
                aria-valuemin={min}
                aria-valuemax={max}
                aria-valuenow={time}
                aria-valuetext={formatTime(time)}
                disabled={disabled || duration <= 0}
                onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); activeHandle.current = handle; event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); }}
                onPointerMove={(event) => { if (activeHandle.current === handle) moveHandle(handle, timeFromClientX(event.clientX)); }}
                onPointerUp={(event) => { event.stopPropagation(); activeHandle.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
                onPointerCancel={() => { activeHandle.current = null; }}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={handleKeyDown(handle)}
                style={{ left: `${pct(time)}%` }}
                className={`group absolute inset-y-[-1px] z-[5] w-2.5 -translate-x-1/2 touch-none cursor-ew-resize rounded-sm border-0 bg-transparent shadow-none transition-colors hover:bg-white/5 focus-visible:outline-accent disabled:pointer-events-none`}
              >
                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#E4CEFF] shadow-[0_0_7px_rgba(195,161,255,0.7)]" />
                <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-0.5 rounded-[3px] border border-[#E4CEFF]/80 bg-[#A77AE8] px-[2px] py-1 opacity-95 shadow-[0_1px_7px_rgba(0,0,0,0.5)]" aria-hidden="true">
                  <span className="h-px w-0.5 bg-white/90" /><span className="h-px w-0.5 bg-white/90" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-end gap-3 sm:gap-4">
        <label className="block min-w-0">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">In point</span>
          <span className="flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface-raised px-2.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 sm:px-3">
            <input key={trimStart} type="text" inputMode="decimal" aria-label="Clip in time" defaultValue={formatTime(trimStart)} disabled={disabled} onBlur={(event) => finishTextEdit("start", event.currentTarget.value, event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="w-full min-w-0 bg-transparent font-mono text-sm tabular-nums text-ink outline-none disabled:text-ink-muted" />
            <span className="shrink-0 text-[10px] text-ink-faint">MM:SS.ss</span>
          </span>
        </label>
        <span className="pb-3 text-xs text-ink-faint" aria-hidden="true">to</span>
        <label className="block min-w-0">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Out point</span>
          <span className="flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface-raised px-2.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15 sm:px-3">
            <input key={trimEnd} type="text" inputMode="decimal" aria-label="Clip out time" defaultValue={formatTime(trimEnd)} disabled={disabled} onBlur={(event) => finishTextEdit("end", event.currentTarget.value, event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} className="w-full min-w-0 bg-transparent font-mono text-sm tabular-nums text-ink outline-none disabled:text-ink-muted" />
            <span className="shrink-0 text-[10px] text-ink-faint">MM:SS.ss</span>
          </span>
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-marker" /> Playhead {formatTime(currentTime)}</span>
        <span className="truncate text-right">{sceneMarkers.length ? `${sceneMarkers.length} scene ${sceneMarkers.length === 1 ? "change" : "changes"} detected` : "Click the timeline to seek"}</span>
      </div>
    </section>
  );
}
