import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { findSceneCandidates, pixelDifference, type SceneAnalysis, type SceneCut, type SceneSample, type SceneSettings } from "./scene-tools";
interface Request { file: File; sourceId: string; duration: number; start: number; end: number; settings: SceneSettings }
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (value: unknown) => void };
scope.onmessage = async ({data}) => {
  const input = new Input({source:new BlobSource(data.file),formats:ALL_FORMATS});
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !await track.canDecode()) throw new Error("This browser cannot decode scene analysis for this video. Manual cuts, markers and editing remain available.");
    const sink = new CanvasSink(track,{width:96,poolSize:1});
    const pixelsAt = async (time:number) => {
      const frame = await sink.getCanvas(time);
      if (!frame) throw new Error("A scene sample could not be decoded. Retry with a shorter scan area.");
      const canvas = frame.canvas as OffscreenCanvas, context = canvas.getContext("2d",{willReadFrequently:true})!;
      return {time:frame.timestamp,pixels:context.getImageData(0,0,canvas.width,canvas.height).data};
    };
    const span = data.end-data.start, plannedSamples = Math.min(480,Math.max(2,Math.ceil(span*4)+1));
    const interval = span/(plannedSamples-1), deadline = performance.now()+(data.settings.mode==="refined"?120000:30000);
    const samples:SceneSample[]=[];
    let previous:Awaited<ReturnType<typeof pixelsAt>>|null=null, samplesChecked=0, coverageEnd=data.start, complete=true, reason:string|undefined;
    for(let index=0;index<plannedSamples;index++) {
      if(performance.now()>=deadline) {complete=false;reason="Scan time limit reached; only the recorded area was checked.";break;}
      const requested=Math.min(data.end-.000001,data.start+index*interval);
      const frame=await pixelsAt(requested);
      if(previous && frame.time>previous.time) samples.push({from:previous.time,time:frame.time,score:pixelDifference(previous.pixels,frame.pixels)});
      previous=frame;samplesChecked++;coverageEnd=Math.min(data.end,Math.max(data.start,frame.time+.000001));
      if(index%10===0) scope.postMessage({type:"progress",message:"Sampling source frames: "+Math.round(samplesChecked/plannedSamples*100)+"%"});
    }
    if(complete)coverageEnd=data.end;
    const candidates=findSceneCandidates(samples,data.settings.sensitivity), cuts:SceneCut[]=[];
    let refinedCount=0;
    for(let index=0;index<candidates.length;index++) {
      const candidate=candidates[index];
      let time=(candidate.from+candidate.time)/2, refined=false;
      if(data.settings.mode==="refined" && performance.now()<deadline) {
        let left=await pixelsAt(candidate.from), right=await pixelsAt(candidate.time);
        for(let step=0;step<16 && right.time-left.time>.000001 && performance.now()<deadline;step++) {
          const middle=await pixelsAt((left.time+right.time)/2);
          if(middle.time<=left.time || middle.time>=right.time) break;
          if(pixelDifference(left.pixels,middle.pixels)>pixelDifference(middle.pixels,right.pixels)) right=middle;
          else left=middle;
        }
        if(performance.now()<deadline) {time=right.time;refined=true;refinedCount++;}
      }
      if(data.settings.mode==="refined" && !refined) reason="Some candidates remain sampled estimates because the refinement time limit was reached.";
      cuts.push({id:crypto.randomUUID(),time,origin:"detected",confirmed:false,score:candidate.score,refined,bracket:{start:candidate.from,end:candidate.time}});
      scope.postMessage({type:"progress",message:"Reviewing candidate "+(index+1)+" of "+candidates.length+(refined?" using decoded frame timestamps":"")});
    }
    const analysis:SceneAnalysis={sourceId:data.sourceId,start:data.start,end:data.end,settings:data.settings,algorithm:"pixel-difference-v1",createdAt:Date.now(),samplesChecked,plannedSamples,interval,coverageEnd,complete,refinedCount,reason};
    scope.postMessage({type:"complete",cuts,analysis});
  } catch(error) {scope.postMessage({type:"error",message:error instanceof Error?error.message:"Scene analysis could not finish. Previous cuts are preserved."});}
  finally {input.dispose();}
};
