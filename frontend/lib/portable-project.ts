import {imageMime,type ImageReference} from "./image-tools";
import {validateAssembly} from "./assembly";
import type {EditDecisions} from "./editable-project";
import type {SavedProject} from "./project-history";
import type {MediaMetadata} from "./media";
import {serializeCaptions} from "./captions";
export interface SourceReference {fileName:string;mime:string;bytes:number;fingerprint:string;algorithm:"sha256-chunks-4m-v1";kind:"original"|"saved-export";metadata:MediaMetadata}
export interface ProjectBackup {format:"cutmark-project";version:1|2|3;title:string;createdAt:number;updatedAt:number;source:SourceReference;decisions:EditDecisions}
const MAX_HEADER=16*1024*1024,CHUNK=4*1024*1024,MAGIC="CMARK001";
const fingerprints=new WeakMap<Blob,string>();
export async function fingerprintSource(blob:Blob,signal?:AbortSignal,onProgress?:(progress:number)=>void):Promise<string>{
 if(!globalThis.crypto?.subtle)throw new Error("Source verification is unavailable here. Open Cutmark in a secure browser context and retry; your open project is preserved.");
 const cached=fingerprints.get(blob);if(cached){signal?.throwIfAborted();onProgress?.(1);return cached;}
 const hashes:string[]=[];
 for(let offset=0;offset<blob.size;offset+=CHUNK){
  signal?.throwIfAborted();const bytes=await blob.slice(offset,offset+CHUNK).arrayBuffer();
  const hash=await crypto.subtle.digest("SHA-256",bytes);signal?.throwIfAborted();
  hashes.push([...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,"0")).join(""));
  onProgress?.(Math.min(1,(offset+CHUNK)/blob.size));
 }
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("cutmark-source-v1:"+blob.size+":"+hashes.join(":")));
 signal?.throwIfAborted();const result=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
 fingerprints.set(blob,result);return result;
}
function validateChild(value:unknown){return validateBackup(JSON.parse(JSON.stringify(value)));}
function fail(path:string):never{throw new Error("Project backup has invalid "+path+". Nothing has changed.");}
function object(value:unknown,path:string):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))fail(path);return value as Record<string,unknown>;}
function number(value:unknown,path:string,min=0,max=Number.MAX_SAFE_INTEGER):number{if(typeof value!=="number"||!Number.isFinite(value)||value<min||value>max)fail(path);return value;}
function text(value:unknown,path:string,max=MAX_HEADER):string{if(typeof value!=="string"||value.length>max)fail(path);return value;}
function choice(value:unknown,values:readonly unknown[],path:string){if(!values.includes(value))fail(path);}
function bool(value:unknown,path:string){if(typeof value!=="boolean")fail(path);}
function array(value:unknown,path:string):unknown[]{if(!Array.isArray(value)||value.length>50000)fail(path);return value;}
function safeTree(value:unknown,depth=0):void{
 if(depth>12)fail("nesting");
 if(typeof value==="number"){number(value,"number",-Number.MAX_SAFE_INTEGER);return;}
 if(typeof value==="string"){text(value,"text");return;}
 if(value===null||typeof value==="boolean")return;
 if(Array.isArray(value)){array(value,"list").forEach(entry=>safeTree(entry,depth+1));return;}
 const record=object(value,"object");
 for(const [key,entry]of Object.entries(record)){if(["__proto__","prototype","constructor"].includes(key))fail("field");safeTree(entry,depth+1);}
}
function settings(value:unknown){const s=object(value,"scene settings");choice(s.mode,["quick","refined"],"scan mode");choice(s.scope,["source","selection"],"scan scope");choice(s.sensitivity,["fewer","balanced","more"],"scan sensitivity");}
export function validateBackup(value:unknown):ProjectBackup{
 safeTree(value);const p=object(value,"document");
 if(p.format!=="cutmark-project"||(p.version!==1&&p.version!==2&&p.version!==3))throw new Error("This project format or version is not supported. Nothing has changed.");
 text(p.title,"title",255);number(p.createdAt,"creation time");number(p.updatedAt,"edit time");
 const source=object(p.source,"source");text(source.fileName,"source filename",255);text(source.mime,"source type",200);number(source.bytes,"source size",1);if(!Number.isInteger(source.bytes))fail("source size");choice(source.algorithm,["sha256-chunks-4m-v1"],"source fingerprint algorithm");if(!/^[a-f0-9]{64}$/.test(text(source.fingerprint,"source fingerprint",64)))fail("source fingerprint");choice(source.kind,["original","saved-export"],"source kind");
 const media=object(source.metadata,"source metadata"),duration=number(media.duration,"source duration",.000001);
 number(media.width,"source width",1);number(media.height,"source height",1);if(!Number.isInteger(media.width)||!Number.isInteger(media.height))fail("source dimensions");bool(media.hasAudio,"audio metadata");bool(media.hdr,"color metadata");
 if(media.frameRate!==null)number(media.frameRate,"frame rate",.000001);
 for(const key of ["videoCodec","audioCodec"])if(media[key]!==null)text(media[key],key,100);
 const decisions=object(p.decisions,"decisions");const allowed=["projectTitle","images","titles","assembly","clips","framing","audioAdjustments","ranges","captions","sceneMarkers","scenesDetected","includeSceneDetection","captionGuidance","captionStyle","captionDelivery","exportPreferences","sceneCuts","sceneAnalysis","sceneSettings","dismissedCuts","editorialMarkers"];
 if(Object.keys(decisions).some(key=>!allowed.includes(key)))throw new Error("This backup contains editing features this version cannot restore. Nothing has changed.");
 if(decisions.projectTitle!==undefined)text(decisions.projectTitle,"project title",255);
 const ranges=array(decisions.ranges,"ranges");if(!ranges.length||ranges.length>100||(p.version===1&&ranges.length!==1))throw new Error("This version restores one source range. Nothing has changed.");
 const ids=new Set<unknown>();const interval=(value:unknown,path:string)=>{const item=object(value,path);const start=number(item.start,path+" start",0,duration),end=number(item.end,path+" end",0,duration);if(start>=end)fail(path+" interval");return item;};
 if(decisions.assembly!==undefined){
  if(p.version!==3)fail("assembly version");
  const a=object(decisions.assembly,"assembly");bool(a.enabled,"assembly mode");
  const sources=array(a.sources,"assembly sources"),kept=array(a.ranges,"assembly ranges");if(sources.length>4||kept.length>100)fail("assembly size");
  for(const value of sources){const item=object(value,"assembly source");text(item.id,"assembly source identifier",200);text(item.assetId,"assembly asset identifier",200);
   if(item.primary!==undefined)bool(item.primary,"primary source binding");
   const ref=object(item.reference,"assembly source reference");if(item.primary===true&&ref.fingerprint!==source.fingerprint)fail("primary source fingerprint");const metadata=object(ref.metadata,"assembly source metadata"),sourceDuration=number(metadata.duration,"assembly source duration",.000001);
   validateChild({...p,version:item.images?3:2,source:ref,decisions:{ranges:[{id:"validation",sourceId:item.id,start:0,end:sourceDuration}],images:item.images,titles:item.titles,captions:item.captions,editorialMarkers:item.markers,sceneMarkers:item.sceneMarkers??[],scenesDetected:false,includeSceneDetection:false}});
  }
  for(const value of kept){const range=object(value,"assembly range");text(range.id,"assembly range identifier",200);text(range.sourceId,"assembly range source",200);number(range.start,"assembly range start");number(range.end,"assembly range end");}
  const error=validateAssembly(a as unknown as import("./assembly").Assembly);if(error)throw new Error(error+" Nothing has changed.");
 }
 const rangeIds=new Set<string>();
 for(const entry of ranges){const range=interval(entry,"selection"),id=text(range.id,"range identifier",200);if(!id||rangeIds.has(id))fail("duplicate range identifier");rangeIds.add(id);text(range.sourceId,"source identifier",200);if(range.sourceId!==object(ranges[0],"selection").sourceId)fail("range source reference");}
 for(const cue of array(decisions.captions,"captions")){
  const c=interval(cue,"caption");const id=number(c.id,"caption identifier",1);if(!Number.isInteger(id)||ids.has(id))fail("duplicate caption identifier");ids.add(id);text(c.text,"caption wording");
  if(c.reviewNote!==undefined)text(c.reviewNote,"review note");if(c.acknowledgedWarnings!==undefined)array(c.acknowledgedWarnings,"caption review").forEach(v=>text(v,"review key"));
 }
 array(decisions.sceneMarkers,"scene times").forEach(v=>number(v,"scene time",0,duration));bool(decisions.scenesDetected,"scene status");bool(decisions.includeSceneDetection,"scene preference");
 if(decisions.captionDelivery!==undefined)choice(decisions.captionDelivery,["sidecar","burned","both"],"caption delivery");
 if(decisions.exportPreferences!==undefined){const e=object(decisions.exportPreferences,"export preferences");choice(e.resolution,["source","1080","720","480"],"resolution");choice(e.quality,["balanced","smaller","high"],"quality");choice(e.audio,["keep","omit"],"audio");for(const key of ["filePrefix","fileSuffix"])if(e[key]!==undefined){if(p.version===1)fail("naming version");text(e[key],"filename naming rule",40);}}
 if(p.version===1&&(decisions.framing!==undefined||decisions.audioAdjustments!==undefined||decisions.clips!==undefined))fail("version-1 editing features");
 if(decisions.images!==undefined){if(p.version!==3)fail("image version");const images=array(decisions.images,"images");if(images.length>5)fail("image count");const used=new Set<string>();for(const value of images){const image=interval(value,"image"),id=text(image.id,"image identifier",200);if(!id||used.has(id))fail("image identifier");used.add(id);text(image.assetId,"image asset identifier",200);number(image.x,"image horizontal position",0,100);number(image.y,"image vertical position",0,100);number(image.size,"image size",5,100);number(image.opacity,"image opacity",0,1);const ref=object(image.reference,"image reference");if(ref.kind!=="image")fail("image kind");text(ref.fileName,"image filename",255);choice(ref.mime,["image/png","image/jpeg","image/webp"],"image type");const bytes=number(ref.bytes,"image bytes",1,2*1024*1024);if(!Number.isInteger(bytes))fail("image bytes");choice(ref.algorithm,["sha256-chunks-4m-v1"],"image fingerprint algorithm");if(!/^[a-f0-9]{64}$/.test(text(ref.fingerprint,"image fingerprint",64)))fail("image fingerprint");const m=object(ref.metadata,"image dimensions"),w=number(m.width,"image width",1,4096),h=number(m.height,"image height",1,4096);if(!Number.isInteger(w)||!Number.isInteger(h)||w*h>8_388_608)fail("image dimensions");}}
 if(decisions.titles!==undefined){if(p.version===1)fail("title version");const titles=array(decisions.titles,"titles");if(titles.length>10)fail("title count");const used=new Set<number>();for(const value of titles){const title=interval(value,"title"),id=number(title.id,"title identifier",1);if(!Number.isInteger(id)||used.has(id))fail("title identifier");used.add(id);text(title.text,"title wording",1000);object(title.style,"title style");validateChild({...p,version:2,decisions:{ranges:[ranges[0]],captions:[],sceneMarkers:[],scenesDetected:false,includeSceneDetection:false,captionStyle:title.style}});}}
 if(decisions.clips!==undefined){const clips=array(decisions.clips,"named clips");if(clips.length>20)fail("clip count");const used=new Set<string>();for(const value of clips){const c=object(value,"clip"),id=text(c.id,"clip identifier",200);if(!id||used.has(id))fail("clip identifier");used.add(id);text(c.name,"clip name",100);bool(c.selected,"clip selection");const range=interval(c.range,"clip range");text(range.id,"clip range identifier",200);if(range.sourceId!==object(ranges[0],"selection").sourceId)fail("clip source reference");
 object(c.preferences,"clip preferences");object(c.framing,"clip framing");validateChild({...p,version:2,decisions:{ranges:[range],captions:[],sceneMarkers:[],scenesDetected:false,includeSceneDetection:false,exportPreferences:c.preferences,framing:c.framing}});
 }}
 if(decisions.framing!==undefined){const f=object(decisions.framing,"framing");choice(f.ratio,["original","16:9","9:16","1:1","4:5","custom"],"aspect ratio");choice(f.fit,["fit","fill"],"framing fit");number(f.customWidth,"custom width",1,100);number(f.customHeight,"custom height",1,100);number(f.x,"horizontal framing",0,100);number(f.y,"vertical framing",0,100);number(f.zoom,"framing scale",1,3);if(![0,90,180,270].includes(Number(f.rotation))||typeof f.rotation!=="number")fail("rotation");bool(f.flipX,"horizontal flip");bool(f.flipY,"vertical flip");if(!/^#[a-f0-9]{6}$/i.test(text(f.background,"background",7)))fail("background");}
 if(decisions.audioAdjustments!==undefined){const a=object(decisions.audioAdjustments,"audio adjustments");number(a.gainDb,"gain",-24,12);bool(a.mute,"mute");number(a.fadeIn,"fade in",0,10);number(a.fadeOut,"fade out",0,10);}
 if(decisions.captionStyle!==undefined){
  const s=object(decisions.captionStyle,"caption style");choice(s.font,["sans","mono"],"font");bool(s.bold,"font weight");bool(s.shadow,"shadow");number(s.size,"font size",1,12);number(s.outline,"outline",0,10);number(s.margin,"edge margin",2,20);number(s.backgroundOpacity,"opacity",0,1);choice(s.background,["none","plate"],"background");choice(s.align,["left","center","right"],"alignment");choice(s.position,["top","middle","bottom"],"placement");
  for(const key of ["color","outlineColor","backgroundColor"])if(!/^#[a-f0-9]{6}$/i.test(text(s[key],key,7)))fail(key);
 }
 if(decisions.captionGuidance!==undefined){const g=object(decisions.captionGuidance,"readability guidance");number(g.lineLength,"line length",10,100);number(g.charactersPerSecond,"reading speed",5,60);}
 if(decisions.sceneSettings!==undefined)settings(decisions.sceneSettings);
 if(decisions.sceneCuts!==undefined){const used=new Set<string>();for(const entry of array(decisions.sceneCuts,"cuts")){const cut=object(entry,"cut"),id=text(cut.id,"cut identifier",200);if(used.has(id))fail("duplicate cut identifier");used.add(id);number(cut.time,"cut time",0,duration);choice(cut.origin,["manual","detected","legacy"],"cut origin");bool(cut.confirmed,"cut review");if(cut.refined!==undefined)bool(cut.refined,"cut refinement");if(cut.score!==undefined)number(cut.score,"cut score",0,1);if(cut.bracket!==undefined)interval(cut.bracket,"cut bracket");}}
 if(decisions.dismissedCuts!==undefined)array(decisions.dismissedCuts,"dismissals").forEach(v=>interval(v,"dismissed bracket"));
 if(decisions.editorialMarkers!==undefined){const used=new Set<string>();for(const entry of array(decisions.editorialMarkers,"markers")){const m=object(entry,"marker"),id=text(m.id,"marker identifier",200);if(used.has(id))fail("duplicate marker identifier");used.add(id);number(m.time,"marker time",0,duration);text(m.name,"marker name");text(m.note,"marker note");choice(m.color,["lavender","gold","green","rose"],"marker color");}}
 if(decisions.sceneAnalysis!==undefined){
  const a=interval(decisions.sceneAnalysis,"scene analysis");text(a.sourceId,"analysis source",200);choice(a.algorithm,["pixel-difference-v1"],"analysis version");settings(a.settings);bool(a.complete,"analysis status");
  for(const key of ["createdAt","samplesChecked","plannedSamples","interval","refinedCount"])number(a[key],key);number(a.coverageEnd,"scan coverage",Number(a.start),Number(a.end));if(a.reason!==undefined)text(a.reason,"scan reason");
 }
 const references=[p.source,...array((decisions.assembly as Record<string,unknown>|undefined)?.sources??[],"assembly sources").map(value=>object(value,"assembly source").reference),...array(decisions.images??[],"images").map(value=>object(value,"image").reference),...array((decisions.assembly as Record<string,unknown>|undefined)?.sources??[],"assembly sources").flatMap(value=>array(object(value,"assembly source").images??[],"source images").map(image=>object(image,"image").reference))];
 const signatures=new Map<string,string>();for(const value of references){const ref=object(value,"asset reference"),metadata=object(ref.metadata,"asset metadata"),signature=JSON.stringify([ref.bytes,ref.kind==="image",metadata.width,metadata.height,metadata.duration,metadata.hasAudio,metadata.videoCodec,metadata.audioCodec,metadata.hdr,metadata.frameRate]);const key=String(ref.fingerprint);if(signatures.has(key)&&signatures.get(key)!==signature)fail("conflicting source fingerprint metadata");signatures.set(key,signature);}
 return JSON.parse(JSON.stringify(p)) as ProjectBackup;
}
export async function createBackup(project:SavedProject,decisions:EditDecisions,metadata:MediaMetadata,source:Blob,signal?:AbortSignal,onProgress?:(progress:number)=>void):Promise<ProjectBackup>{
 const fingerprint=await fingerprintSource(source,signal,onProgress);
 return validateBackup(JSON.parse(JSON.stringify({format:"cutmark-project",version:decisions.assembly||decisions.images?3:decisions.ranges.length>1||decisions.framing||decisions.audioAdjustments||decisions.clips||decisions.titles||decisions.exportPreferences?.filePrefix!==undefined||decisions.exportPreferences?.fileSuffix!==undefined?2:1,title:project.title??project.fileName,createdAt:project.createdAt,updatedAt:Date.now(),source:{fileName:project.fileName,mime:source.type,bytes:source.size,fingerprint,algorithm:"sha256-chunks-4m-v1",kind:project.sourceIsExport?"saved-export":"original",metadata},decisions})));
}
export function additionalReferences(backup:ProjectBackup):(SourceReference|ImageReference)[]{
 const unique=new Map<string,SourceReference|ImageReference>();for(const asset of backup.decisions.assembly?.sources??[])if(asset.reference.fingerprint!==backup.source.fingerprint)unique.set(asset.reference.fingerprint,asset.reference);for(const image of [...(backup.decisions.images??[]),...(backup.decisions.assembly?.sources.flatMap(source=>source.images??[])??[])])unique.set(image.reference.fingerprint,image.reference);return [...unique.values()];
}
export function backupBlob(backup:ProjectBackup,source?:Blob,mediaAssets:Record<string,Blob>={}):Blob{
 const json=new TextEncoder().encode(JSON.stringify(backup,null,2));if(json.length>MAX_HEADER)throw new Error("Project metadata exceeds the 16 MB backup limit. Your open project is preserved.");
 if(!source)return new Blob([json],{type:"application/json"});
 if(source.size!==backup.source.bytes)throw new Error("Source size changed before packaging the backup.");
 const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,json.length,true);
 const additional=additionalReferences(backup).map(reference=>{const blob=mediaAssets[reference.fingerprint];if(!blob||blob.size!==reference.bytes)throw new Error("Relink missing source before creating a source-inclusive bundle: "+reference.fileName);return blob;});
 return new Blob([MAGIC,size,json,source,...additional],{type:"application/octet-stream"});
}
export async function readBackup(file:Blob,signal?:AbortSignal):Promise<{backup:ProjectBackup;source?:Blob;mediaAssets?:Record<string,Blob>}>{
 signal?.throwIfAborted();const prefix=await file.slice(0,12).arrayBuffer();signal?.throwIfAborted();
 let data:Blob=file,source:Blob|undefined;
 if(new TextDecoder().decode(prefix.slice(0,8))===MAGIC){
  if(prefix.byteLength<12)throw new Error("The backup bundle header is incomplete.");
  const length=new DataView(prefix).getUint32(8,true);if(!length||length>MAX_HEADER||file.size<12+length)throw new Error("The backup bundle header is invalid or truncated.");
  data=file.slice(12,12+length);source=file.slice(12+length);
 }
 if(data.size>MAX_HEADER)throw new Error("Project metadata must be 16 MB or smaller.");
 let parsed:unknown;try{parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await data.arrayBuffer()));}catch{throw new Error("This project file is not valid UTF-8 JSON. Nothing has changed.");}
 signal?.throwIfAborted();const backup=validateBackup(parsed);
 if(!source)return {backup};
 const references=additionalReferences(backup),expectedBytes=backup.source.bytes+references.reduce((total,reference)=>total+reference.bytes,0);
 if(source.size!==expectedBytes)throw new Error("The bundled sources are truncated or have unexpected extra data.");
 const primary=new Blob([source.slice(0,backup.source.bytes)],{type:backup.source.mime}),mediaAssets:Record<string,Blob>={[backup.source.fingerprint]:primary};
 let offset=backup.source.bytes;for(const reference of references){mediaAssets[reference.fingerprint]=new Blob([source.slice(offset,offset+reference.bytes)],{type:reference.mime});offset+=reference.bytes;}
 return {backup,source:primary,mediaAssets};
}
export async function verifyRelink(backup:ProjectBackup,source:Blob,metadata:MediaMetadata,signal?:AbortSignal,onProgress?:(progress:number)=>void):Promise<void>{
 const expected=backup.source;
 if(source.size!==expected.bytes||metadata.width!==expected.metadata.width||metadata.height!==expected.metadata.height||metadata.hasAudio!==expected.metadata.hasAudio||metadata.hdr!==expected.metadata.hdr||metadata.videoCodec!==expected.metadata.videoCodec||metadata.audioCodec!==expected.metadata.audioCodec||Math.abs(metadata.duration-expected.metadata.duration)>.001)throw new Error("This video does not match the backup's source size, duration, dimensions or tracks. Choose the matching source; nothing has changed.");
 const fingerprint=await fingerprintSource(source,signal,onProgress);if(fingerprint!==expected.fingerprint)throw new Error("This video's contents do not match the backup, even if its filename is the same. Choose the matching source; nothing has changed.");
}
export function restoredProject(backup:ProjectBackup,source:Blob,mediaAssets:Record<string,Blob>={}):SavedProject{
 const id=crypto.randomUUID(),d=backup.decisions,r=d.ranges[0];
 return {id,images:d.images?.map(image=>({...image,assetId:"image:"+image.reference.fingerprint})),titles:d.titles,assembly:d.assembly?{...d.assembly,sources:d.assembly.sources.map(asset=>({...asset,images:asset.images?.map(image=>({...image,assetId:"image:"+image.reference.fingerprint})),assetId:asset.reference.fingerprint===backup.source.fingerprint?id:"media:"+asset.reference.fingerprint}))}:undefined,mediaAssets:{...mediaAssets,[backup.source.fingerprint]:source},sourceBytes:source.size,title:backup.title,fileName:backup.source.fileName,createdAt:backup.createdAt,updatedAt:Date.now(),schemaVersion:2,revision:0,sourceVideo:source,sourceIsExport:backup.source.kind==="saved-export",sourceDuration:backup.source.metadata.duration,ranges:d.ranges.map(range=>({...range,sourceId:id})),trimStart:r.start,trimEnd:r.end,rangeId:r.id,clips:d.clips?.map(clip=>({...clip,range:{...clip.range,sourceId:id}})),framing:d.framing,audioAdjustments:d.audioAdjustments,captions:d.captions,captionTimebase:"source",markerTimebase:"source",captionsVtt:d.captions.length?serializeCaptions(d.captions):null,sceneMarkers:d.sceneMarkers,duration:d.ranges.reduce((total,range)=>total+range.end-range.start,0),sceneDetectionSucceeded:d.scenesDetected,includeSceneDetection:d.includeSceneDetection,captionGuidance:d.captionGuidance,captionStyle:d.captionStyle,captionDelivery:d.captionDelivery,exportPreferences:d.exportPreferences,sceneCuts:d.sceneCuts,sceneSettings:d.sceneSettings,sceneAnalysis:d.sceneAnalysis?{...d.sceneAnalysis,sourceId:id}:undefined,dismissedCuts:d.dismissedCuts,editorialMarkers:d.editorialMarkers};
}
export function projectFileStem(title:string):string{return title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"-").trim().slice(0,100)||"Cutmark-project";}

export async function verifyImageRelink(reference:ImageReference,blob:Blob,signal?:AbortSignal):Promise<void>{
 if(blob.size!==reference.bytes||blob.size>2*1024*1024)throw new Error("This image does not match the saved asset size.");
 signal?.throwIfAborted();if(await imageMime(blob)!==reference.mime)throw new Error("This image does not match the saved image format.");const bitmap=await createImageBitmap(blob);
 try{if(bitmap.width!==reference.metadata.width||bitmap.height!==reference.metadata.height)throw new Error("This image does not match the saved dimensions.");}finally{bitmap.close();}
 if(await fingerprintSource(blob,signal)!==reference.fingerprint)throw new Error("This image's contents do not match the project. Choose the original image.");
}
