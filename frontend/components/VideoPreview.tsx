"use client";

import { forwardRef } from "react";

interface VideoPreviewProps {
  src: string;
  captionsUrl?: string;
  onLoadedMetadata?: (duration: number) => void;
  onTimeUpdate?: (time: number) => void;
  onPlay?: () => void;
}

const VideoPreview = forwardRef<HTMLVideoElement, VideoPreviewProps>(
  ({ src, captionsUrl, onLoadedMetadata, onTimeUpdate, onPlay }, ref) => {
    return (
      <video
        ref={ref}
        src={src}
        controls
        className="aspect-video w-full rounded-xl border border-[#32333D] bg-[#0B0C10] shadow-[0_12px_36px_rgba(0,0,0,0.28)]"
        onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget.duration)}
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
        onPlay={onPlay}
      >
        {captionsUrl && <track kind="captions" srcLang="en" src={captionsUrl} default />}
      </video>
    );
  }
);

VideoPreview.displayName = "VideoPreview";

export default VideoPreview;
