import {loadImageLayers,drawImageLayers,closeImageLayers,type RenderImage,type LoadedImage} from "./image-tools";
import {drawTitles,type TitleCue} from "./title-tools";
import {drawFramed} from "./adjustments";
import type { OutputSpec } from "./output-spec";
import { drawCaptions, loadCaptionFont, type CaptionStyle } from "./caption-renderer";
import type { CaptionCue } from "./captions";
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";

type ProcessRequest = { file: Blob;imageRender?:RenderImage[];titleRender?:TitleCue[]; trimStart: number; trimEnd: number; captionRender?:{cues:CaptionCue[];style:CaptionStyle}; copyAudio?:boolean; outputSpec?:OutputSpec };
type ProcessResponse =
  | { type: "progress"; percent: number }
  | { type: "complete"; buffer: ArrayBuffer }
  | { type: "error"; message: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ProcessRequest>) => void) | null;
  postMessage: (message: ProcessResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = async ({ data }) => {
  let input: Input | null = null;let images:LoadedImage[]=[];
  try {
    input = new Input({ source: new BlobSource(data.file), formats: ALL_FORMATS });
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error("This file has no video track the browser can process.");
    if (!(await videoTrack.canDecode())) throw new Error("This browser cannot decode the video's format with WebCodecs.");
    const audioTrack = await input.getPrimaryAudioTrack();
    if (audioTrack && data.outputSpec?.audio!==false && !(await audioTrack.canDecode())) throw new Error("This browser cannot decode the video's audio format with WebCodecs.");

    if(data.captionRender)await loadCaptionFont(data.captionRender.style.font);for(const title of data.titleRender??[])await loadCaptionFont(title.style.font);
    images=await loadImageLayers(data.imageRender??[]);
    let canvas:OffscreenCanvas|null=null;
    let captionLayer:OffscreenCanvas|null=null;
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      trim: { start: data.trimStart, end: data.trimEnd },
      // Always encode trims so their boundaries are frame/sample accurate.
      copy: data.copyAudio ? {shiftTolerance:0,boundaryTolerance:.1,boundaryPolicy:"shrink"} : false,
      video: { codec: "avc", width:data.outputSpec?.framing?undefined:data.outputSpec?.width, height:data.outputSpec?.framing?undefined:data.outputSpec?.height, fit:"contain", allowTransformationMetadata:false, processedWidth:data.outputSpec?.width, processedHeight:data.outputSpec?.height, quality:data.outputSpec?new Quality({quantizer:data.outputSpec.quantizer,bitrate:data.outputSpec.bitrate}): data.captionRender?new Quality({quantizer:14,bitrate:Math.max(1_000_000,(await videoTrack.getDisplayWidth())*(await videoTrack.getDisplayHeight())*8)}):new Quality("high"), hardwareAcceleration: data.captionRender?"no-preference":"prefer-hardware", forceTranscode:true,
        process:data.captionRender||data.titleRender?.length||data.imageRender?.length||data.outputSpec?.framing?sample=>{
          if(!canvas){const width=data.outputSpec?.width??sample.displayWidth,height=data.outputSpec?.height??sample.displayHeight;canvas=new OffscreenCanvas(width,height);captionLayer=new OffscreenCanvas(width,height);}
          const context=canvas.getContext("2d",{willReadFrequently:true})!;
          if(data.outputSpec?.framing)drawFramed(context,(ctx,x,y,w,h)=>sample.draw(ctx,x,y,w,h),sample.displayWidth,sample.displayHeight,canvas.width,canvas.height,data.outputSpec.framing);else sample.draw(context,0,0,canvas.width,canvas.height);
          // Conversion has already rebased sample timestamps into output time.
          const captionContext=captionLayer!.getContext("2d")!;
          captionContext.clearRect(0,0,canvas.width,canvas.height);
          drawImageLayers(captionContext,images,sample.timestamp,canvas.width,canvas.height);
          drawTitles(captionContext,data.titleRender??[],sample.timestamp,canvas.width,canvas.height);
          if(data.captionRender)drawCaptions(captionContext,data.captionRender.cues,sample.timestamp,canvas.width,canvas.height,data.captionRender.style);
          context.drawImage(captionLayer!,0,0);
          // Explicit pixels avoid a canvas-to-video conversion that displaced glyphs at 854px width.
          return new VideoFrame(context.getImageData(0,0,canvas.width,canvas.height).data,{format:"RGBA",codedWidth:canvas.width,codedHeight:canvas.height,timestamp:Math.round(sample.timestamp*1_000_000),duration:Math.round(sample.duration*1_000_000)});
        }:undefined },
      audio: { discard:data.outputSpec?.audio===false, codec: "aac", quality: data.outputSpec?new Quality({bitrate:data.outputSpec.audioBitrate}):new Quality("high") },
      showWarnings: false,
    });
    if (!conversion.isValid || !conversion.utilizedTracks.includes(videoTrack) || (audioTrack && data.outputSpec?.audio!==false && !conversion.utilizedTracks.includes(audioTrack))) {
      const reason = conversion.discardedTracks[0]?.reason;
      throw new Error(reason ? `WebCodecs cannot encode this video's tracks (${reason}).` : "WebCodecs cannot encode this video in this browser.");
    }

    let lastPercent = -1;
    conversion.onProgress = (progress) => {
      const percent = Math.min(99, Math.max(0, Math.floor(progress * 100)));
      if (percent === lastPercent) return;
      lastPercent = percent;
      workerScope.postMessage({ type: "progress", percent });
    };
    await conversion.execute();
    if (!target.buffer?.byteLength) throw new Error("WebCodecs completed without producing an MP4 file.");
    workerScope.postMessage({ type: "complete", buffer: target.buffer }, [target.buffer]);
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "WebCodecs could not process this video.",
    });
  } finally { closeImageLayers(images);input?.dispose(); }
};
