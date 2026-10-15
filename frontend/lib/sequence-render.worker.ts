import {ALL_FORMATS,Input,BlobSource,Output,BufferTarget,Mp4OutputFormat,VideoSampleSink,AudioSampleSink,VideoSampleSource,AudioSampleSource,VideoSample,AudioSample,Quality} from "mediabunny";
import type {SourceRange} from "./timing";
import type {OutputSpec} from "./output-spec";
import {sequenceDuration} from "./timing";
import {drawFramed,DEFAULT_FRAMING,DEFAULT_AUDIO} from "./adjustments";
import {drawCaptions,loadCaptionFont,type CaptionStyle} from "./caption-renderer";
import type {CaptionCue} from "./captions";
import {drawTitles,type TitleCue} from "./title-tools";
import {loadImageLayers,drawImageLayers,closeImageLayers,type RenderImage,type LoadedImage} from "./image-tools";
type Request={sources:{id:string;file:Blob}[];ranges:SourceRange[];spec:OutputSpec;captions?:{cues:CaptionCue[];style:CaptionStyle};titles?:TitleCue[];images?:RenderImage[]};
const scope=self as unknown as {onmessage:((event:MessageEvent<Request>)=>void)|null;postMessage:(message:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{
 const inputs=new Map<string,Input>();let output:Output|null=null,images:LoadedImage[]=[];
 try{
  for(const source of data.sources)inputs.set(source.id,new Input({source:new BlobSource(source.file),formats:ALL_FORMATS}));
  const tracks=new Map<string,{video:NonNullable<Awaited<ReturnType<Input["getPrimaryVideoTrack"]>>>;audio:Awaited<ReturnType<Input["getPrimaryAudioTrack"]>>}>();
  for(const [id,input]of inputs){const video=await input.getPrimaryVideoTrack(),audio=data.spec.audio?await input.getPrimaryAudioTrack():null;if(!video||!await video.canDecode())throw new Error("A sequence source needs compatible video preparation.");if(audio&&!await audio.canDecode())throw new Error("A sequence source needs compatible audio preparation.");tracks.set(id,{video,audio});}
  if(data.captions)await loadCaptionFont(data.captions.style.font);for(const title of data.titles??[])await loadCaptionFont(title.style.font);images=await loadImageLayers(data.images??[]);
  const target=new BufferTarget(),duration=sequenceDuration(data.ranges),spec=data.spec;
  output=new Output({format:new Mp4OutputFormat({fastStart:"in-memory"}),target});
  const videoSource=new VideoSampleSource({codec:"avc",quality:new Quality({quantizer:spec.quantizer,bitrate:spec.bitrate}),hardwareAcceleration:"no-preference"}),audioSource=spec.audio?new AudioSampleSource({codec:"aac",quality:new Quality({bitrate:spec.audioBitrate})}):null;
  output.addVideoTrack(videoSource);if(audioSource)output.addAudioTrack(audioSource);await output.start();
  let videoProgress=0,audioProgress=audioSource?0:duration,lastPercent=-1;
  const report=()=>{const percent=Math.min(99,Math.floor(Math.min(videoProgress,audioProgress)/duration*100));if(percent>lastPercent){lastPercent=percent;scope.postMessage({type:"progress",percent});}};
  const video=async()=>{
   const canvas=new OffscreenCanvas(spec.width,spec.height),ctx=canvas.getContext("2d",{willReadFrequently:true})!,layer=new OffscreenCanvas(spec.width,spec.height),layerCtx=layer.getContext("2d")!;
   let offset=0;
   for(const range of data.ranges){const track=tracks.get(range.sourceId);if(!track)throw new Error("A sequence range has no matching source.");let frames=0;
    for await(const sample of new VideoSampleSink(track.video).samples(range.start,range.end)){
     try{
      const start=Math.max(range.start,sample.timestamp),end=Math.min(range.end,sample.timestamp+sample.duration);if(end<=start)continue;
      const timestamp=offset+start-range.start,length=end-start;
      if(!spec.framing&&!spec.resize&&!data.captions&&!data.titles?.length&&!data.images?.length&&data.sources.length===1&&sample.displayWidth===spec.width&&sample.displayHeight===spec.height){
        sample.setTimestamp(timestamp);sample.setDuration(length);await videoSource.add(sample);frames++;videoProgress=timestamp+length;report();continue;
      }
      drawFramed(ctx,(context,x,y,w,h)=>sample.draw(context,x,y,w,h),sample.displayWidth,sample.displayHeight,spec.width,spec.height,spec.framing??DEFAULT_FRAMING);
      layerCtx.clearRect(0,0,spec.width,spec.height);drawImageLayers(layerCtx,images,timestamp,spec.width,spec.height);drawTitles(layerCtx,data.titles??[],timestamp,spec.width,spec.height);if(data.captions)drawCaptions(layerCtx,data.captions.cues,timestamp,spec.width,spec.height,data.captions.style);ctx.drawImage(layer,0,0);
      const rendered=new VideoSample(ctx.getImageData(0,0,spec.width,spec.height).data,{format:"RGBA",codedWidth:spec.width,codedHeight:spec.height,timestamp,duration:length});
      try{await videoSource.add(rendered);}finally{rendered.close();}
      frames++;videoProgress=timestamp+length;report();
     }finally{sample.close();}
    }
    if(!frames)throw new Error("A kept range contains no readable video frame.");offset+=range.end-range.start;
   }
   videoSource.close();videoProgress=duration;report();
  };
  const audio=async()=>{
   if(!audioSource)return;
   const rate=48000,block=1024,adjustments=spec.audioAdjustments??DEFAULT_AUDIO,gain=adjustments.mute?0:10**(adjustments.gainDb/20);
   let buffer=new Float32Array(block*2),count=0,chunkStart=0,frameIndex=0;
   const flush=async()=>{if(!count)return;const packed=new Float32Array(count*2);packed.set(buffer.subarray(0,count));packed.set(buffer.subarray(block,block+count),count);const sample=new AudioSample({data:packed,format:"f32-planar",numberOfChannels:2,sampleRate:rate,timestamp:chunkStart/rate});try{await audioSource.add(sample);}finally{sample.close();}count=0;buffer=new Float32Array(block*2);audioProgress=frameIndex/rate;report();};
   const add=(left:number,right:number)=>{if(!count)chunkStart=frameIndex;const time=frameIndex/rate,fadeIn=Math.min(duration,adjustments.fadeIn),fadeOut=Math.min(duration,adjustments.fadeOut),envelope=gain*(fadeIn?Math.min(1,time/fadeIn):1)*(fadeOut?Math.max(0,Math.min(1,(duration-time)/fadeOut)):1);buffer[count]=left*envelope;buffer[block+count]=right*envelope;count++;frameIndex++;if(count===block)return flush();};
   let offset=0;
   for(const range of data.ranges){
    const endIndex=Math.round((offset+range.end-range.start)*rate),track=tracks.get(range.sourceId)?.audio;
    if(track)for await(const sample of new AudioSampleSink(track).samples(range.start,range.end)){
     try{
      if(sample.numberOfChannels>2)throw new Error("Multichannel audio needs compatible stereo preparation.");if(sample.numberOfFrames>1_048_576)throw new Error("An audio packet exceeds the supported working size.");
      const planes=Array.from({length:sample.numberOfChannels},(_,channel)=>{const plane=new Float32Array(sample.numberOfFrames);sample.copyTo(plane,{format:"f32-planar",planeIndex:channel});return plane;});
      const from=Math.min(endIndex,Math.max(frameIndex,Math.ceil((offset+sample.timestamp-range.start)*rate-1e-7))),to=Math.min(endIndex,Math.ceil((offset+sample.timestamp+sample.duration-range.start)*rate-1e-7));
      while(frameIndex<from){const pending=add(0,0);if(pending)await pending;}
      while(frameIndex<to){const position=Math.max(0,(range.start+frameIndex/rate-offset-sample.timestamp)*sample.sampleRate),lo=Math.min(sample.numberOfFrames-1,Math.floor(position)),hi=Math.min(sample.numberOfFrames-1,lo+1),fraction=Math.min(1,Math.max(0,position-lo));const read=(plane:Float32Array)=>plane[lo]+(plane[hi]-plane[lo])*fraction;const mono=sample.numberOfChannels===1;const pending=add(read(planes[0]),read(planes[mono?0:1]));if(pending)await pending;}
     }finally{sample.close();}
    }
    while(frameIndex<endIndex){const pending=add(0,0);if(pending)await pending;}offset+=range.end-range.start;
   }
   await flush();audioSource.close();audioProgress=duration;report();
  };
  await Promise.all([video(),audio()]);await output.finalize();if(!target.buffer?.byteLength)throw new Error("The sequence renderer returned no MP4.");
  scope.postMessage({type:"complete",buffer:target.buffer},[target.buffer]);
 }catch(error){try{await output?.cancel();}catch{}scope.postMessage({type:"error",message:error instanceof Error?error.message:"Sequence rendering failed."});}
 finally{closeImageLayers(images);for(const input of inputs.values())input.dispose();}
};
