import type { SceneAnalysis, SceneCut, SceneSettings } from "./scene-tools";
export function analyzeScenes(file:File,sourceId:string,duration:number,start:number,end:number,settings:SceneSettings,onProgress:(message:string)=>void,signal:AbortSignal):Promise<{cuts:SceneCut[];analysis:SceneAnalysis}> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException("Cancelled","AbortError"));return;}
    const worker=new Worker(new URL("./scene-analysis.worker.ts",import.meta.url),{type:"module"});
    let finished=false;
    const cleanup=()=>{finished=true;worker.terminate();signal.removeEventListener("abort",cancel);clearTimeout(timeout);};
    const cancel=()=>{if(finished)return;cleanup();reject(new DOMException("Cancelled","AbortError"));};
    const timeout=setTimeout(()=>{if(finished)return;cleanup();reject(new Error("Scene decoding stopped responding. Previous cuts are preserved; retry with a shorter scan area."));},150000);
    signal.addEventListener("abort",cancel,{once:true});
    worker.onmessage=({data}:MessageEvent<{type:string;message?:string;cuts:SceneCut[];analysis:SceneAnalysis}>)=>{
      if(finished)return;
      if(data.type==="progress")onProgress(data.message??"Reading scenes…");
      else if(data.type==="complete"){cleanup();resolve({cuts:data.cuts,analysis:data.analysis});}
      else {cleanup();reject(new Error(data.message??"Scene scanning failed."));}
    };
    worker.onerror=()=>{if(finished)return;cleanup();reject(new Error("Scene analysis could not start in this browser. Manual scene cuts remain available."));};
    worker.postMessage({file,sourceId,duration,start,end,settings});
  });
}
