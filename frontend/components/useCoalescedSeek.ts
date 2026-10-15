"use client";
import { useCallback, useEffect, useRef, type RefObject } from "react";
export default function useCoalescedSeek(videoRef: RefObject<HTMLVideoElement | null>, source: string | null, duration: number) {
  const pending = useRef<number | null>(null), frame = useRef<number | null>(null);
  const cancel = useCallback(() => { pending.current = null; if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; }, []);
  const apply = useCallback(() => {
    frame.current = null;
    const video = videoRef.current;
    if (!video || video.seeking || pending.current === null) return;
    const target = pending.current; pending.current = null;
    if (Math.abs(video.currentTime - target) > 0.000001) video.currentTime = target;
  }, [videoRef]);
  useEffect(() => {
    const video = videoRef.current;
    video?.addEventListener("seeked", apply);
    return () => { video?.removeEventListener("seeked", apply); cancel(); };
  }, [videoRef, source, apply, cancel]);
  const seek = useCallback((time: number) => {
    pending.current = Math.max(0, Math.min(duration, time));
    if (frame.current === null) frame.current = requestAnimationFrame(apply);
  }, [duration, apply]);
  return { seek, cancel };
}
