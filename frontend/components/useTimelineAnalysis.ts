"use client";
import { useEffect, useRef, useState } from "react";
export interface Thumbnail { url: string; frameTime: number }
export interface Waveform { levels: Float32Array[]; binSeconds: number; maximum: number }
type WaveState = { file: File | null; status: "idle" | "working" | "complete" | "absent" | "cancelled" | "failed"; progress: number; message: string; data?: Waveform };
export default function useTimelineAnalysis(file: File | null, duration: number, times: number[]) {
  const cache = useRef(new Map<number, Thumbnail>());
  const waveformWorker = useRef<Worker | null>(null);
  const [thumbnails, setThumbnails] = useState<{ file: File | null; values: Map<number, Thumbnail>; message: string }>({ file: null, values: new Map(), message: "" });
  const [wave, setWave] = useState<WaveState>({ file: null, status: "idle", progress: 0, message: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const entries = cache.current;
    return () => { for (const entry of entries.values()) URL.revokeObjectURL(entry.url); entries.clear(); };
  }, [file]);
  useEffect(() => {
    if (!file || duration <= 0) return;
    let active = true;
    const worker = new Worker(new URL("../lib/timeline-analysis.worker.ts", import.meta.url), { type: "module" });
    waveformWorker.current = worker;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize source-specific analysis with its worker.
    setWave((previous) => ({ file, status: "working", progress: 0, message: "Reading source audio…", data: previous.file === file ? previous.data : undefined }));
    worker.onmessage = ({ data }: MessageEvent<{ type: string; percent?: number; levels?: Float32Array[]; binSeconds?: number; maximum?: number; message?: string }>) => {
      if (!active || waveformWorker.current !== worker) return;
      if (data.type === "progress") setWave((previous) => ({ ...previous, progress: data.percent ?? 0 }));
      else {
        const result: WaveState = data.type === "waveform" ? { file, status: "complete", progress: 100, message: data.maximum ? "Source peaks, scaled for visibility" : "Silent audio — no peaks", data: { levels: data.levels!, binSeconds: data.binSeconds!, maximum: data.maximum! } }
          : { file, status: data.type === "absent" ? "absent" : "failed", progress: 0, message: data.message ?? "No audio track" };
        setWave(result); worker.terminate(); waveformWorker.current = null;
      }
    };
    worker.onerror = () => { if (active && waveformWorker.current === worker) setWave({ file, status: "failed", progress: 0, message: "Waveform worker could not run. Editing remains available." }); worker.terminate(); waveformWorker.current = null; };
    worker.postMessage({ kind: "waveform", file, duration });
    return () => { active = false; worker.terminate(); if (waveformWorker.current === worker) waveformWorker.current = null; };
  }, [file, duration, retry]);
  useEffect(() => {
    if (!file || !times.length) return;
    let active = true;
    const needed = times.filter((time) => !cache.current.has(time));
    setThumbnails({ file, values: new Map(cache.current), message: needed.length ? "Loading visible frames…" : "" });
    if (!needed.length) return;
    const worker = new Worker(new URL("../lib/timeline-analysis.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<{ type: string; time?: number; frameTime?: number; blob?: Blob; message?: string }>) => {
      if (!active) return;
      if (data.type === "thumbnail") {
        const key = data.time!, old = cache.current.get(key);
        if (old) URL.revokeObjectURL(old.url);
        cache.current.set(key, { url: URL.createObjectURL(data.blob!), frameTime: data.frameTime! });
        for (const [time, frame] of cache.current) {
          if (cache.current.size <= 64) break;
          if (!times.includes(time)) { URL.revokeObjectURL(frame.url); cache.current.delete(time); }
        }
        setThumbnails({ file, values: new Map(cache.current), message: "Loading visible frames…" });
      } else { setThumbnails({ file, values: new Map(cache.current), message: data.type === "error" ? data.message ?? "Thumbnail preview unavailable." : "" }); worker.terminate(); }
    };
    worker.onerror = () => { if (active) setThumbnails({ file, values: new Map(cache.current), message: "Timeline frame previews are unavailable in this browser." }); worker.terminate(); };
    worker.postMessage({ kind: "thumbnails", file, times: needed });
    return () => { active = false; worker.terminate(); };
  }, [file, times]);
  return {
    thumbnails: thumbnails.file === file ? thumbnails.values : new Map<number, Thumbnail>(),
    thumbnailMessage: thumbnails.file === file ? thumbnails.message : "",
    waveform: wave.file === file ? wave : { file, status: "idle" as const, progress: 0, message: "" },
    cancelWaveform: () => { waveformWorker.current?.terminate(); waveformWorker.current = null; setWave((previous) => ({ ...previous, status: "cancelled", message: "Waveform cancelled. Editing remains available." })); },
    retryWaveform: () => setRetry((value) => value + 1),
  };
}
