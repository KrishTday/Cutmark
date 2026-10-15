"use client";
import type { EditorialMarker } from "@/lib/scene-tools";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTime, minimumSelection, validateRange } from "@/lib/timing";
import { fitView, peakAtPixel, snapInView, zoomView, type TimelineView } from "@/lib/timeline-view";
import TimeField from "./TimeField";
import useTimelineAnalysis from "./useTimelineAnalysis";
interface TimelineProps {
  file?: File | null; duration: number; frameRate?: number | null; trimStart: number; trimEnd: number; currentTime: number;
  playing?: boolean; sceneMarkers?: number[]; editorialMarkers?: EditorialMarker[]; snapToScenes?: boolean; disabled?: boolean;
  onChange: (start: number, end: number) => void; onScrub?: (time: number) => void;
}
type Handle = "start" | "end" | "playhead";
export default function Timeline({ file = null, duration, frameRate, trimStart, trimEnd, currentTime, playing = false, sceneMarkers = [], editorialMarkers = [], snapToScenes = false, disabled = false, onChange, onScrub }: TimelineProps) {
  const minimum = minimumSelection(duration, frameRate), minimumView = Math.min(duration, Math.max(0.05, minimum * 6));
  const [view, setView] = useState<TimelineView>({ start: 0, span: duration || 1 });
  const [follow, setFollow] = useState(true);
  const [width, setWidth] = useState(720);
  const [drag, setDrag] = useState<{ start: number; end: number; time: number; handle: Handle; snap?: number } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [boundaryTime, setBoundaryTime] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null), waveCanvas = useRef<HTMLCanvasElement>(null);
  const active = useRef<{ handle: Handle; rect: DOMRect; grab: number; range: { start: number; end: number } } | null>(null);
  const latestPointer = useRef<{ x: number; bypass: boolean } | null>(null), animation = useRef<number | null>(null);
  const playheadTime = useRef(currentTime);
  const visible = fitView(view.start, view.span, duration || 1, minimumView);
  const viewEnd = visible.start + visible.span;
  const shownStart = drag?.start ?? trimStart, shownEnd = drag?.end ?? trimEnd;
  useEffect(() => { playheadTime.current = currentTime; }, [currentTime]);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!follow || !playing) return;
    const timer = window.setInterval(() => {
      const time = playheadTime.current;
      setView((previous) => {
        const value = fitView(previous.start, previous.span, duration, minimumView);
        return time < value.start || time > value.start + value.span * 0.88 ? fitView(time - value.span * 0.25, value.span, duration, minimumView) : previous;
      });
    }, 120);
    return () => clearInterval(timer);
  }, [follow, playing, duration, minimumView]);
  useEffect(() => {
    if (!drag || active.current?.handle === "playhead") return;
    const timer = setTimeout(() => setBoundaryTime(active.current?.handle === "end" ? Math.max(drag.start, drag.end - 0.000001) : drag.start), 120);
    return () => clearTimeout(timer);
  }, [drag]);
  const slots = useMemo(() => {
    if (duration <= 0) return [];
    const count = Math.max(2, Math.min(18, Math.ceil(width / 108)));
    const step = visible.span / count;
    return Array.from({ length: count }, (_, index) => ({ time: Number(Math.min(duration - 0.000001, visible.start + (index + 0.5) * step).toFixed(6)), left: index / count * 100, width: 100 / count }));
  }, [width, visible.start, visible.span, duration]);
  const requestedTimes = useMemo(() => {
    if (!slots.length) return [];
    const ordered = [...slots].sort((a, b) => Math.abs(a.time - (visible.start + visible.span / 2)) - Math.abs(b.time - (visible.start + visible.span / 2))).map((slot) => slot.time);
    return [...new Set([...(boundaryTime === null ? [] : [Number(boundaryTime.toFixed(6))]), ...ordered, Number(trimStart.toFixed(6)), Number(Math.max(trimStart, trimEnd - 0.000001).toFixed(6))])];
  }, [slots, visible.start, visible.span, boundaryTime, trimStart, trimEnd]);
  const analysis = useTimelineAnalysis(file, duration, requestedTimes);
  useEffect(() => {
    const canvas = waveCanvas.current, data = analysis.waveform.data;
    if (!canvas) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.round(52 * scale);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(scale, scale); context.clearRect(0, 0, width, 52);
    context.strokeStyle = "#5E566D"; context.beginPath(); context.moveTo(0, 26); context.lineTo(width, 26); context.stroke();
    if (!data || !data.maximum) return;
    context.fillStyle = "#C5B1FA";
    for (let pixel = 0; pixel < width; pixel += 2) {
      const from = visible.start + pixel / width * visible.span, to = visible.start + (pixel + 2) / width * visible.span;
      const peak = peakAtPixel(data.levels, data.binSeconds, from, to);
      const height = Math.max(1, Math.min(24, peak / data.maximum * 24));
      context.fillRect(pixel, 26 - height, 1.5, height * 2);
    }
  }, [analysis.waveform.data, width, visible.start, visible.span]);
  const percent = (time: number) => (time - visible.start) / visible.span * 100;
  const inside = (time: number) => time >= visible.start && time <= viewEnd;
  const zoom = (factor: number) => {
    const anchor = inside(currentTime) ? currentTime : visible.start + visible.span / 2;
    setView(zoomView(visible, factor, anchor, duration, minimumView));
  };
  const applyPointer = useCallback((x: number, bypass: boolean) => {
    const gesture = active.current;
    if (!gesture) return;
    const raw = visible.start + Math.max(0, Math.min(1, (x - gesture.grab - gesture.rect.left) / gesture.rect.width)) * visible.span;
    const snap = snapToScenes && gesture.handle !== "playhead" ? snapInView(raw, [0, duration, ...sceneMarkers], visible.span, gesture.rect.width, bypass) : { time: raw };
    const value = gesture.handle === "start"
      ? { start: Math.max(0, Math.min(snap.time, gesture.range.end - minimum)), end: gesture.range.end }
      : gesture.handle === "end" ? { start: gesture.range.start, end: Math.min(duration, Math.max(snap.time, gesture.range.start + minimum)) } : gesture.range;
    gesture.range = value;
    const time = gesture.handle === "start" ? value.start : gesture.handle === "end" ? Math.max(value.start, value.end - 0.000001) : raw;
    setDrag({ ...value, time, handle: gesture.handle, snap: Math.abs((gesture.handle === "end" ? value.end : time) - snap.time) < 0.000001 ? snap.target : undefined });
    onScrub?.(time);
    return value;
  }, [visible.start, visible.span, duration, minimum, sceneMarkers, snapToScenes, onScrub]);
  const startGesture = (handle: Handle, event: React.PointerEvent<HTMLElement>) => {
    if (disabled || !track.current) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
    const rect = track.current.getBoundingClientRect();
    let chosen = handle;
    if (handle !== "playhead" && (trimEnd - trimStart) / visible.span * rect.width < 44 && inside(trimStart) && inside(trimEnd)) {
      chosen = event.clientX < rect.left + ((trimStart + trimEnd) / 2 - visible.start) / visible.span * rect.width ? "start" : "end";
    }
    const boundary = chosen === "start" ? trimStart : chosen === "end" ? trimEnd : currentTime;
    active.current = { handle: chosen, rect, grab: handle === "playhead" ? 0 : event.clientX - (rect.left + (boundary - visible.start) / visible.span * rect.width), range: { start: trimStart, end: trimEnd } };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (chosen === "playhead") applyPointer(event.clientX, true);
  };
  const moveGesture = (event: React.PointerEvent<HTMLElement>) => {
    if (!active.current) return;
    latestPointer.current = { x: event.clientX, bypass: event.shiftKey };
    if (animation.current !== null) return;
    animation.current = requestAnimationFrame(() => {
      animation.current = null;
      if (latestPointer.current) applyPointer(latestPointer.current.x, latestPointer.current.bypass);
    });
  };
  const endGesture = (event: React.PointerEvent<HTMLElement>, cancelled = false) => {
    if (!active.current) return;
    event.stopPropagation();
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null; latestPointer.current = null;
    const handle = active.current.handle;
    const value = cancelled ? null : applyPointer(event.clientX, event.shiftKey);
    if (value && handle !== "playhead") { onChange(value.start, value.end); setFeedback("Trim committed: " + formatTime(value.start) + " to " + formatTime(value.end)); }
    if (cancelled) setFeedback("Drag cancelled; the saved selection is unchanged.");
    active.current = null; setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => () => { if (animation.current !== null) cancelAnimationFrame(animation.current); }, []);
  const keyboardHandle = (handle: "start" | "end", event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 1 : frameRate ? 1 / frameRate : 0.1;
    let time = handle === "start" ? trimStart : trimEnd;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") time -= step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") time += step;
    else if (event.key === "Home") time = handle === "start" ? 0 : trimStart + minimum;
    else if (event.key === "End") time = handle === "start" ? trimEnd - minimum : duration;
    else return;
    event.preventDefault();
    onChange(handle === "start" ? Math.max(0, Math.min(time, trimEnd - minimum)) : trimStart, handle === "end" ? Math.min(duration, Math.max(time, trimStart + minimum)) : trimEnd);
  };
  const boundary = boundaryTime === null ? undefined : analysis.thumbnails.get(Number(boundaryTime.toFixed(6)));
  return <section aria-label="Clip trim controls" className="min-w-0 select-none">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-sm font-semibold text-ink">Trim clip</h2><p className="mt-1 text-xs text-ink-muted">Drag a boundary or the playhead. Shift bypasses snapping.</p></div>
      <span className="font-mono text-sm text-ink">{formatTime(shownEnd - shownStart)} selected</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => zoom(2)} disabled={disabled || visible.span <= minimumView} aria-label="Zoom in timeline" className="timeline-tool">Zoom +</button>
      <button type="button" onClick={() => zoom(0.5)} disabled={disabled || visible.span >= duration} aria-label="Zoom out timeline" className="timeline-tool">Zoom −</button>
      <button type="button" disabled={disabled} onClick={() => setView({ start: 0, span: duration })} className="timeline-tool">Fit source</button>
      <button type="button" disabled={disabled} onClick={() => { setFollow(false); setView(fitView(trimStart - (trimEnd - trimStart) * 0.12, (trimEnd - trimStart) * 1.24, duration, minimumView)); }} className="timeline-tool">Fit selection</button>
      <label className="ml-auto flex items-center gap-2 text-xs text-ink-muted"><input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />Follow playhead</label>
    </div>
    <div className="mt-3 px-5">
      <div className="relative h-6 text-[11px] font-mono text-ink-muted" aria-hidden="true">{[0, 0.25, 0.5, 0.75, 1].map((tick, index) => <span key={tick} className="absolute top-0" style={{ left: tick * 100 + "%", transform: index === 0 ? "none" : index === 4 ? "translateX(-100%)" : "translateX(-50%)" }}>{formatTime(visible.start + tick * visible.span, 2)}</span>)}</div>
      <div ref={track} aria-label="Video timeline" className="relative h-28 touch-pan-y rounded-lg border border-line-strong bg-[#111217]"
        onPointerDown={(event) => { if (event.pointerType === "mouse") startGesture("playhead", event); }}
        onPointerMove={moveGesture} onPointerUp={(event) => endGesture(event)} onPointerCancel={(event) => endGesture(event, true)}
        onClick={(event) => { if (!disabled && event.target === event.currentTarget) onScrub?.(visible.start + (event.clientX - event.currentTarget.getBoundingClientRect().left) / width * visible.span); }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[58px] overflow-hidden rounded-t-lg" aria-label="Source footage thumbnails">
          {slots.map((slot) => { const frame = analysis.thumbnails.get(slot.time); return <span key={slot.time} className="absolute top-0 flex h-full items-center justify-center border-r border-black/30 bg-[#171921]" style={{ left: slot.left + "%", width: slot.width + "%" }}>{frame && <Image src={frame.url} width={160} height={90} unoptimized alt={"Source frame at " + formatTime(frame.frameTime)} className="h-full w-full object-contain" />}</span>; })}
        </div>
        <canvas ref={waveCanvas} className="pointer-events-none absolute bottom-0 h-[52px] w-full" aria-label="Decoded source audio peak waveform" />
        <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-lg bg-black/65" style={{ width: Math.max(0, Math.min(100, percent(shownStart))) + "%" }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-lg bg-black/65" style={{ width: Math.max(0, Math.min(100, 100 - percent(shownEnd))) + "%" }} />
        <div className="pointer-events-none absolute inset-y-0 border-y border-accent/70" style={{ left: Math.max(0, percent(shownStart)) + "%", width: Math.max(0, Math.min(100, percent(shownEnd)) - Math.max(0, percent(shownStart))) + "%" }} />
        {sceneMarkers.filter(inside).map((time, index) => <span key={time + "-" + index} className="pointer-events-none absolute inset-y-0 z-[2] w-px bg-marker/70" style={{ left: percent(time) + "%" }} />)}
        {editorialMarkers.filter(marker=>inside(marker.time)).map(marker=><button key={marker.id} type="button" disabled={disabled} aria-label={"Timeline marker "+marker.name+" at "+formatTime(marker.time)} title={marker.name+" · "+formatTime(marker.time)+(marker.note?" · "+marker.note:"")} onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onScrub?.(marker.time);}} className="absolute bottom-0 z-[3] h-14 w-11 -translate-x-1/2" style={{left:percent(marker.time)+"%",color:{lavender:"#C5B1FA",gold:"#F4CA77",green:"#82C5A0",rose:"#FDA4AF"}[marker.color]}}>
          <span className="pointer-events-none absolute bottom-0 left-1/2 h-14 w-px bg-current"/><span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-sm">◆</span>
        </button>)}
        {drag?.snap !== undefined && <span className="pointer-events-none absolute inset-y-0 z-[3] w-0.5 bg-white" style={{ left: percent(drag.snap) + "%" }} />}
        {(["start", "end"] as const).map((handle) => {
          const time = handle === "start" ? shownStart : shownEnd;
          if (!inside(time)) return null;
          return <button key={handle} type="button" role="slider" aria-label={handle === "start" ? "Clip in point" : "Clip out point"} aria-valuemin={handle === "start" ? 0 : trimStart + minimum} aria-valuemax={handle === "end" ? duration : trimEnd - minimum} aria-valuenow={time} aria-valuetext={formatTime(time)}
            disabled={disabled} onPointerDown={(event) => startGesture(handle, event)} onPointerMove={moveGesture} onPointerUp={(event) => endGesture(event)} onPointerCancel={(event) => endGesture(event, true)} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => keyboardHandle(handle, event)}
            className="absolute inset-y-0 z-[5] w-11 -translate-x-1/2 touch-none cursor-ew-resize hover:bg-white/5" style={{ left: percent(time) + "%" }}>
            <span className="absolute inset-y-0 left-1/2 w-0.5 bg-accent" /><span className="absolute left-1/2 top-1/2 -translate-x-1/2 rounded bg-accent px-1 py-2 text-[10px] text-paper">{handle === "start" ? "[" : "]"}</span>
          </button>;
        })}
        {inside(drag && drag.handle === "playhead" ? drag.time : currentTime) && <button type="button" role="slider" aria-label="Timeline playhead" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={currentTime} aria-valuetext={formatTime(currentTime)}
          disabled={disabled} className="absolute -top-6 z-[6] h-6 w-11 -translate-x-1/2 touch-none" style={{ left: percent(drag?.time ?? currentTime) + "%" }}
          onPointerDown={(event) => startGesture("playhead", event)} onPointerMove={moveGesture} onPointerUp={(event) => endGesture(event)} onPointerCancel={(event) => endGesture(event, true)} onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); onScrub?.(Math.max(0, Math.min(duration, currentTime + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 1 : frameRate ? 1 / frameRate : 0.1)))); } }}>
          <span className="pointer-events-none absolute left-1/2 top-6 h-28 w-px bg-marker" /><span className="absolute left-1/2 top-1 -translate-x-1/2 text-marker">▼</span>
        </button>}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
      <span>{analysis.waveform.message}{analysis.waveform.status === "working" ? " " + analysis.waveform.progress + "%" : ""}</span>
      {analysis.waveform.status === "working" && <button type="button" className="timeline-tool" onClick={analysis.cancelWaveform}>Cancel waveform</button>}
      {["failed", "cancelled"].includes(analysis.waveform.status) && <button type="button" className="timeline-tool" onClick={analysis.retryWaveform}>Retry waveform</button>}
      {analysis.thumbnailMessage && <span>{analysis.thumbnailMessage}</span>}
    </div>
    <label className={"mt-3 text-xs text-ink-muted " + (visible.span >= duration ? "hidden" : "block")}>Navigate recording · {formatTime(visible.start, 2)} — {formatTime(viewEnd, 2)}
      <span className="relative mt-1 block h-3 rounded bg-[#0C0D11]" aria-hidden="true"><span className="absolute inset-y-0 bg-accent/25" style={{ left: trimStart / Math.max(duration, 0.000001) * 100 + "%", width: (trimEnd - trimStart) / Math.max(duration, 0.000001) * 100 + "%" }} /><span className="absolute inset-y-0 rounded border border-ink-muted" style={{ left: visible.start / Math.max(duration, 0.000001) * 100 + "%", width: visible.span / Math.max(duration, 0.000001) * 100 + "%" }} /></span>
      <input type="range" aria-label="Timeline visible start" min={0} max={Math.max(0, duration - visible.span)} step="any" value={visible.start} disabled={disabled || visible.span >= duration} onChange={(event) => { setFollow(false); setView({ ...visible, start: Number(event.target.value) }); }} className="mt-1 min-h-8 w-full accent-accent" />
    </label>
    <div className="mt-2 grid grid-cols-2 gap-3">
      <label className="min-w-0 text-xs text-ink-muted">In point<TimeField value={trimStart} label="Clip in time" disabled={disabled} validate={(start) => validateRange(start, trimEnd, duration, frameRate)} onCommit={(start) => onChange(start, trimEnd)} /></label>
      <label className="min-w-0 text-xs text-ink-muted">Out point<TimeField value={trimEnd} label="Clip out time" disabled={disabled} validate={(end) => validateRange(trimStart, end, duration, frameRate)} onCommit={(end) => onChange(trimStart, end)} /></label>
    </div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
      <span>Playhead {formatTime(currentTime)}</span>
      {!inside(trimStart) && <button type="button" className="timeline-tool" onClick={() => { setFollow(false); setView(fitView(trimStart - visible.span / 4, visible.span, duration, minimumView)); }}>Show in point</button>}
      {!inside(trimEnd) && <button type="button" className="timeline-tool" onClick={() => { setFollow(false); setView(fitView(trimEnd - visible.span * 0.75, visible.span, duration, minimumView)); }}>Show out point</button>}
    </div>
    {drag && <p className="mt-2 text-xs text-ink">{drag.snap !== undefined ? "Snap to " + formatTime(drag.snap) + " · " : ""}In {formatTime(drag.start)} · Out {formatTime(drag.end)} · {formatTime(drag.end - drag.start)} selected</p>}
    {boundary && <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted"><Image src={boundary.url} width={88} height={50} unoptimized alt={"Boundary source frame at " + formatTime(boundary.frameTime)} className="h-12 w-20 rounded bg-black object-contain" /><span>Source frame {formatTime(boundary.frameTime)}</span></div>}
    {feedback && <p className="mt-2 text-xs text-ink-muted" role="status">{feedback}</p>}
  </section>;
}
