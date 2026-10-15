"use client";
import NumericField from "./NumericField";
import {pauseOtherPreviews} from "@/lib/playback";
import { forwardRef, useEffect, useRef, useState } from "react";
import { drawCaptions,loadCaptionFont,type CaptionStyle } from "@/lib/caption-renderer";
import {loadImageLayers,drawImageLayers,closeImageLayers,type RenderImage,type LoadedImage} from "@/lib/image-tools";
import {drawTitles,type TitleCue} from "@/lib/title-tools";
import {drawFramed,frameGeometry,type Framing} from "@/lib/adjustments";
import type { CaptionCue } from "@/lib/captions";
interface VideoPreviewProps {
  imageRender?:RenderImage[];onImageError?:(message:string)=>void;titles?:TitleCue[];onFraming?:(framing:Framing)=>void;disabled?:boolean;framing?:Framing;src:string;captionsUrl?:string;cues?:CaptionCue[];captionStyle?:CaptionStyle;nativeCaptions?:boolean;outputWidth?:number;outputHeight?:number;onCaptionError?:(message:string)=>void;onError?:()=>void;
  onPause?:()=>void;onRateChange?:(rate:number)=>void;onVolumeChange?:(volume:number)=>void;
  onLoadedMetadata?:(duration:number)=>void;onTimeUpdate?:(time:number)=>void;onPlay?:()=>void;
}
const VideoPreview=forwardRef<HTMLVideoElement,VideoPreviewProps>(
 ({src,imageRender,onImageError,titles,framing,onFraming,disabled,captionsUrl,cues,captionStyle,nativeCaptions=false,outputWidth,outputHeight,onCaptionError,onLoadedMetadata,onTimeUpdate,onPlay,onError,onPause,onRateChange,onVolumeChange},ref)=>{
  const [draft,setDraft]=useState<Framing|null>(null),[guides,setGuides]=useState(false),[guideMargin,setGuideMargin]=useState(10);
  const applied=draft??framing;
  const dragRef=useRef<{x:number;y:number;original:Framing;latest:Framing}|null>(null);
  const element=useRef<HTMLVideoElement|null>(null),overlay=useRef<HTMLCanvasElement>(null);
  const imageLayersRef=useRef<LoadedImage[]>([]);
  const paint=useRef<(time:number)=>void>(()=>{}),displayedTime=useRef(0);
  const composed=Boolean(framing)&&!nativeCaptions;
  const styled=Boolean(captionStyle&&cues?.length&&!nativeCaptions);
  useEffect(()=>{if(nativeCaptions){imageLayersRef.current=[];onImageError?.("");return;}let active=true;let owned:LoadedImage[]=[];if(imageRender?.length)onImageError?.("Loading local image layers…");
    void loadImageLayers(imageRender??[]).then(layers=>{if(!active){closeImageLayers(layers);return;}owned=layers;imageLayersRef.current=layers;paint.current(displayedTime.current);onImageError?.("");}).catch(error=>{if(active)onImageError?.(error instanceof Error?error.message:"Image layers could not load.");});
    return()=>{active=false;closeImageLayers(owned);if(imageLayersRef.current===owned)imageLayersRef.current=[];};
  },[src,imageRender,onImageError,nativeCaptions]);
  useEffect(()=>{
    const video=element.current;if(!video)return;
    displayedTime.current=0;
    if(!video.requestVideoFrameCallback)return;
    let handle:number;
    const frame:VideoFrameRequestCallback=(_now,metadata)=>{
      displayedTime.current=metadata.mediaTime;paint.current(metadata.mediaTime);onTimeUpdate?.(metadata.mediaTime);
      handle=video.requestVideoFrameCallback(frame);
    };
    handle=video.requestVideoFrameCallback(frame);
    return()=>video.cancelVideoFrameCallback(handle);
  },[src,onTimeUpdate]);
  useEffect(()=>{
    const video=element.current,canvas=overlay.current;if(!video||!canvas)return;
    let active=true,fontReady=false,lastError="";
    const clear=()=>canvas.getContext("2d")?.clearRect(0,0,canvas.width,canvas.height);
    clear();if(nativeCaptions){onCaptionError?.("");return;}
    const render=(time:number)=>{
      if(!active||!fontReady||(!styled&&!composed&&!guides&&!titles?.length&&!imageRender?.length)||!video.videoWidth||!video.videoHeight)return;
      try{
        const width=outputWidth??video.videoWidth,height=outputHeight??video.videoHeight;
        if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
        const context=canvas.getContext("2d")!;context.clearRect(0,0,canvas.width,canvas.height);
        const scale=Math.min(video.clientWidth/canvas.width,video.clientHeight/canvas.height);
        canvas.style.width=canvas.width*scale+"px";canvas.style.height=canvas.height*scale+"px";
        canvas.style.left=(video.clientWidth-canvas.width*scale)/2+"px";canvas.style.top=(video.clientHeight-canvas.height*scale)/2+"px";
        if(applied)drawFramed(context,(ctx,x,y,w,h)=>ctx.drawImage(video,x,y,w,h),video.videoWidth,video.videoHeight,canvas.width,canvas.height,applied);
        drawImageLayers(context,imageLayersRef.current,time,canvas.width,canvas.height);
        drawTitles(context,titles??[],time,canvas.width,canvas.height);
        if(styled&&captionStyle&&cues)drawCaptions(context,cues,time,canvas.width,canvas.height,captionStyle);
        if(guides){context.save();context.strokeStyle="#D7C9FF";context.lineWidth=Math.max(1,canvas.width/500);context.setLineDash([canvas.width/70,canvas.width/100]);context.strokeRect(canvas.width*guideMargin/100,canvas.height*guideMargin/100,canvas.width*(1-2*guideMargin/100),canvas.height*(1-2*guideMargin/100));context.restore();}
        if(lastError){lastError="";onCaptionError?.("");}
      }catch(error){clear();const message=error instanceof Error?error.message:"Styled caption preview is unavailable.";if(message!==lastError){lastError=message;onCaptionError?.(message);}}
    };
    const repaint=()=>render(typeof video.requestVideoFrameCallback==="function"?displayedTime.current:video.currentTime);
    const observer=new ResizeObserver(repaint);observer.observe(video);
    if((composed||guides||imageRender?.length)&&!styled&&!titles?.length){fontReady=true;paint.current=render;repaint();}
    if(styled&&captionStyle||titles?.length)void Promise.all([...(styled&&captionStyle?[loadCaptionFont(captionStyle.font)]:[]),...(titles??[]).map(title=>loadCaptionFont(title.style.font))]).then(()=>{if(active){fontReady=true;paint.current=render;onCaptionError?.("");repaint();}}).catch(error=>{if(active)onCaptionError?.(error instanceof Error?error.message:"Caption font could not load. Retry or use native caption preview.");});
    video.addEventListener("loadedmetadata",repaint);
    return()=>{active=false;paint.current=()=>{};observer.disconnect();video.removeEventListener("loadedmetadata",repaint);clear();};
  },[src,cues,titles,imageRender,captionStyle,styled,composed,applied,guides,guideMargin,nativeCaptions,outputWidth,outputHeight,onCaptionError]);
  useEffect(()=>{
    const video=element.current;if(!video)return;
    const show=()=>{for(const track of video.textTracks)track.mode=styled?"hidden":"showing";};
    video.addEventListener("loadeddata",show);show();
    return()=>video.removeEventListener("loadeddata",show);
  },[captionsUrl,styled]);
  return <><div className="source-preview relative aspect-video max-h-[min(30dvh,300px)] w-full overflow-clip rounded-xl border border-[#32333D] bg-[#0B0C10] shadow-[0_12px_36px_rgba(0,0,0,0.28)]">
    <video ref={video=>{element.current=video;if(typeof ref==="function")ref(video);else if(ref)ref.current=video;}} src={src} controls={!composed} playsInline preload="metadata" className="h-full w-full object-contain" style={{opacity:composed?0:1}}
      onLoadedMetadata={event=>onLoadedMetadata?.(event.currentTarget.duration)}
      onTimeUpdate={event=>{if(!event.currentTarget.requestVideoFrameCallback){displayedTime.current=event.currentTarget.currentTime;paint.current(displayedTime.current);}onTimeUpdate?.(event.currentTarget.currentTime);}}
      onPlay={event=>{pauseOtherPreviews(event.currentTarget);onPlay?.();}} onPause={onPause} onEnded={onPause} onRateChange={event=>onRateChange?.(event.currentTarget.playbackRate)} onVolumeChange={event=>onVolumeChange?.(event.currentTarget.muted?0:event.currentTarget.volume)} onError={onError}>
      {captionsUrl&&<track key={captionsUrl} kind="captions" label="Edited captions" srcLang="und" src={captionsUrl} default/>}
    </video>
    <canvas ref={overlay} aria-label={composed?"Composed output preview":"Styled caption preview"} className="absolute" tabIndex={composed?0:undefined} onKeyDown={event=>{const video=element.current;if(!framing||!onFraming||disabled||!video)return;const step=event.shiftKey?5:1;if(event.key.startsWith("Arrow")){event.preventDefault();event.stopPropagation();const width=outputWidth??video.videoWidth,height=outputHeight??video.videoHeight,g=frameGeometry(video.videoWidth,video.videoHeight,width,height,framing),dx=(event.key==="ArrowLeft"?-step:event.key==="ArrowRight"?step:0)*(width-g.width<0?-1:1),dy=(event.key==="ArrowUp"?-step:event.key==="ArrowDown"?step:0)*(height-g.height<0?-1:1);onFraming({...framing,x:Math.max(0,Math.min(100,framing.x+dx)),y:Math.max(0,Math.min(100,framing.y+dy))});}}}
      onPointerDown={event=>{if(!framing||!onFraming||disabled)return;event.currentTarget.setPointerCapture(event.pointerId);dragRef.current={x:event.clientX,y:event.clientY,original:framing,latest:framing};}}
      onPointerMove={event=>{const drag=dragRef.current,video=element.current;if(!drag||!video)return;const width=outputWidth??video.videoWidth,height=outputHeight??video.videoHeight,g=frameGeometry(video.videoWidth,video.videoHeight,width,height,drag.original),scale=event.currentTarget.clientWidth/width;const x=drag.original.x+(width===g.width?0:(event.clientX-drag.x)/scale/(width-g.width)*100),y=drag.original.y+(height===g.height?0:(event.clientY-drag.y)/scale/(height-g.height)*100);drag.latest={...drag.original,x:Math.max(0,Math.min(100,x)),y:Math.max(0,Math.min(100,y))};setDraft(drag.latest);}}
      onPointerUp={event=>{const drag=dragRef.current;dragRef.current=null;if(drag){onFraming?.(drag.latest);setDraft(null);event.currentTarget.releasePointerCapture(event.pointerId);}}}
      onPointerCancel={()=>{dragRef.current=null;setDraft(null);}}
      style={{display:!nativeCaptions&&(styled||composed||guides||titles?.length||imageRender?.length)?"block":"none",pointerEvents:composed&&!disabled?"auto":"none",touchAction:"none"}}/>
  </div>{!nativeCaptions&&<div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted"><label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={guides} onChange={event=>setGuides(event.target.checked)}/>Show safe-area guides (preview only)</label>{guides&&<label>Edge margin %<NumericField label="Guide edge margin" value={guideMargin} min={5} max={30} onCommit={setGuideMargin}/></label>}{composed&&<p>Drag the image to reposition, or focus the composed preview and use arrow keys. Shift moves faster. Guides are approximate and never exported.</p>}</div>}</>;
 });
VideoPreview.displayName="VideoPreview";export default VideoPreview;
