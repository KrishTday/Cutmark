import type {SavedProjectSummary} from "./project-history";
export function mediaUsage(projects:SavedProjectSummary[]){
 const sources=new Map<string,number|undefined>(),outputs=new Map<string,number|undefined>();
 for(const p of projects){const source=p.sourceAssetId??p.id;if(!sources.has(source)||p.sourceBytes!==undefined)sources.set(source,p.sourceBytes);
  for(const asset of p.assembly?.sources??[])sources.set(asset.assetId,asset.reference.bytes);
  for(const image of [...(p.images??[]),...(p.assembly?.sources.flatMap(source=>source.images??[])??[])])sources.set(image.assetId,image.reference.bytes);
  if(p.exportRevision!==undefined||p.exportId){const output=p.outputAssetId??p.id;if(!outputs.has(output)||p.outputBytes!==undefined)outputs.set(output,p.outputBytes);}
 }
 const sum=(values:Map<string,number|undefined>)=>({bytes:[...values.values()].reduce<number>((sum,value)=>sum+(value??0),0),unmeasured:[...values.values()].filter(value=>value===undefined).length,count:values.size});
 return {sources:sum(sources),outputs:sum(outputs)};
}
export function isEnglishModelUrl(value:string):boolean{
 try{const url=new URL(value);return url.protocol==="https:"&&url.hostname==="huggingface.co"&&url.pathname.startsWith("/onnx-community/whisper-tiny.en/");}catch{return false;}
}
export async function modelCacheInfo():Promise<{count:number;bytes:number;unmeasured:number;available:boolean}>{
 if(typeof caches==="undefined")return {count:0,bytes:0,unmeasured:0,available:false};
 if(!(await caches.keys()).includes("transformers-cache"))return {count:0,bytes:0,unmeasured:0,available:true};
 const cache=await caches.open("transformers-cache"),keys=(await cache.keys()).filter(key=>isEnglishModelUrl(key.url));
 let bytes=0,unmeasured=0;
 for(const key of keys){const response=await cache.match(key),length=response?.headers.get("content-length");const size=length&&/^\d+$/.test(length)?Number(length):NaN;if(Number.isSafeInteger(size)&&size>=0)bytes+=size;else unmeasured++;await response?.body?.cancel();}
 return {count:keys.length,bytes,unmeasured,available:true};
}
export async function removeEnglishModel(signal?:AbortSignal):Promise<number>{
 signal?.throwIfAborted();if(typeof caches==="undefined")throw new Error("Model cache management is unavailable in this browser.");
 if(!(await caches.keys()).includes("transformers-cache"))return 0;
 const cache=await caches.open("transformers-cache"),keys=(await cache.keys()).filter(key=>isEnglishModelUrl(key.url));let removed=0;
 for(const key of keys){signal?.throwIfAborted();if(await cache.delete(key))removed++;}
 signal?.throwIfAborted();return removed;
}
