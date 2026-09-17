"use client";

import { forwardRef } from "react";

interface VideoPreviewProps {
  src: string;
  captionsUrl?: string;
  onLoadedMetadata?: (duration: number) => void;
  onTimeUpdate?: (time: number) => void;
}

const VideoPreview = forwardRef<HTMLVideoElement, VideoPreviewProps>(
  ({ src, captionsUrl, onLoadedMetadata, onTimeUpdate }, ref) => {
    return (
      <video
        ref={ref}
        src={src}
        controls
        className="aspect-video w-full border border-line bg-black"
        onLoadedMetadata={(e) => onLoadedMetadata?.(e.currentTarget.duration)}
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
      >
        {captionsUrl && <track kind="captions" srcLang="en" src={captionsUrl} default />}
      </video>
    );
  }
);

VideoPreview.displayName = "VideoPreview";

export default VideoPreview;
