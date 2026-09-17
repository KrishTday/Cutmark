"use client";

import { useCallback, useRef } from "react";

interface TimelineProps {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  sceneMarkers?: number[];
  disabled?: boolean;
  onChange: (start: number, end: number) => void;
  onScrub?: (time: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

export default function Timeline({
  duration,
  trimStart,
  trimEnd,
  currentTime,
  sceneMarkers = [],
  disabled = false,
  onChange,
  onScrub,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  const startDrag = (handle: "start" | "end") => (downEvent: React.PointerEvent) => {
    if (disabled) return;
    downEvent.preventDefault();
    const move = (e: PointerEvent) => {
      const t = timeFromClientX(e.clientX);
      if (handle === "start") {
        onChange(Math.min(t, trimEnd - 0.1), trimEnd);
      } else {
        onChange(trimStart, Math.max(t, trimStart + 0.1));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handleTrackClick = (e: React.MouseEvent) => {
    if (disabled || !onScrub) return;
    onScrub(timeFromClientX(e.clientX));
  };

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        className="relative h-16 cursor-pointer border border-line bg-surface"
      >
        {/* untrimmed regions, dimmed */}
        <div className="absolute inset-y-0 left-0 bg-line/40" style={{ width: `${pct(trimStart)}%` }} />
        <div
          className="absolute inset-y-0 right-0 bg-line/40"
          style={{ width: `${100 - pct(trimEnd)}%` }}
        />

        {/* kept region */}
        <div
          className="absolute inset-y-0 border-x border-accent bg-accent/10"
          style={{ left: `${pct(trimStart)}%`, width: `${pct(trimEnd) - pct(trimStart)}%` }}
        />

        {/* scene markers */}
        {sceneMarkers.map((t, i) => (
          <div
            key={i}
            title={`Scene change at ${formatTime(t)}`}
            className="absolute top-0 h-full w-px bg-marker"
            style={{ left: `${pct(t)}%` }}
          />
        ))}

        {/* playhead */}
        <div
          className="absolute top-0 h-full w-px bg-ink"
          style={{ left: `${pct(currentTime)}%` }}
        />

        {/* handles */}
        <div
          onPointerDown={startDrag("start")}
          className="absolute top-0 h-full w-2 -translate-x-1/2 cursor-ew-resize bg-accent-strong"
          style={{ left: `${pct(trimStart)}%` }}
        />
        <div
          onPointerDown={startDrag("end")}
          className="absolute top-0 h-full w-2 -translate-x-1/2 cursor-ew-resize bg-accent-strong"
          style={{ left: `${pct(trimEnd)}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between font-mono text-xs text-ink-muted">
        <span>in {formatTime(trimStart)}</span>
        <span>{sceneMarkers.length > 0 && `${sceneMarkers.length} scene cut${sceneMarkers.length === 1 ? "" : "s"} detected`}</span>
        <span>out {formatTime(trimEnd)}</span>
      </div>
    </div>
  );
}
