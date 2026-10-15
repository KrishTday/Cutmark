import type {ImageOverlay} from "./image-tools";
import type {TitleCue} from "./title-tools";
import type {SourceReference} from "./portable-project";
import {validateRange,type SourceRange} from "./timing";
import type {EditorialMarker} from "./scene-tools";
import type {CaptionCue} from "./captions";
export interface AssemblySource {primary?:boolean;id:string;assetId:string;reference:SourceReference;captions:CaptionCue[];images?:ImageOverlay[];titles?:TitleCue[];markers?:EditorialMarker[];sceneMarkers?:number[]}
export interface Assembly {enabled:boolean;sources:AssemblySource[];ranges:SourceRange[]}
export function assemblyCaptions(assembly:Assembly):CaptionCue[]{
 let offset=0,id=0;const cues:CaptionCue[]=[];
 for(const range of assembly.ranges){
  const source=assembly.sources.find(s=>s.id===range.sourceId);
  for(const cue of source?.captions??[]){const start=Math.max(range.start,cue.start),end=Math.min(range.end,cue.end);if(end>start)cues.push({...cue,id:++id,start:offset+start-range.start,end:offset+end-range.start});}
  offset+=range.end-range.start;
 }
 return cues.sort((a,b)=>a.start-b.start);
}
export function validateAssembly(a:Assembly):string|null{
 if(!a.sources.length||a.sources.length>4)return "Use between one and four assembly sources.";
 if(!a.ranges.length||a.ranges.length>100)return "Keep between one and 100 assembly ranges.";
 const sourceIds=new Set<string>(),rangeIds=new Set<string>();
 for(const source of a.sources){if(!source.id||sourceIds.has(source.id))return "Assembly sources need unique identifiers.";sourceIds.add(source.id);}
 for(const range of a.ranges){const source=a.sources.find(s=>s.id===range.sourceId);if(!source||!range.id||rangeIds.has(range.id))return "A range has a missing source or duplicate identifier.";rangeIds.add(range.id);if(validateRange(range.start,range.end,source.reference.metadata.duration,source.reference.metadata.frameRate))return "An assembly range is outside its source.";}
 return null;
}

export function assemblyMarkers(assembly:Assembly){let offset=0;const markers:{sourceId:string;sourceTime:number;sequenceTime:number;marker:import("./scene-tools").EditorialMarker}[]=[];const cuts:number[]=[];for(const range of assembly.ranges){const source=assembly.sources.find(s=>s.id===range.sourceId);for(const marker of source?.markers??[])if(marker.time>=range.start&&marker.time<range.end)markers.push({sourceId:range.sourceId,sourceTime:marker.time,sequenceTime:offset+marker.time-range.start,marker});for(const time of source?.sceneMarkers??[])if(time>=range.start&&time<range.end)cuts.push(offset+time-range.start);offset+=range.end-range.start;}return {markers,cuts};}

export function assemblyTitles(assembly:Assembly):TitleCue[]{let offset=0,id=0;const titles:TitleCue[]=[];for(const range of assembly.ranges){const source=assembly.sources.find(s=>s.id===range.sourceId);for(const title of source?.titles??[]){const start=Math.max(title.start,range.start),end=Math.min(title.end,range.end);if(end>start)titles.push({...title,id:++id,start:offset+start-range.start,end:offset+end-range.start});}offset+=range.end-range.start;}return titles;}

export function assemblyImages(assembly:Assembly):ImageOverlay[]{let offset=0;const images:ImageOverlay[]=[];for(const range of assembly.ranges){const source=assembly.sources.find(s=>s.id===range.sourceId);for(const image of source?.images??[]){const start=Math.max(image.start,range.start),end=Math.min(image.end,range.end);if(end>start)images.push({...image,start:offset+start-range.start,end:offset+end-range.start});}offset+=range.end-range.start;}return images;}
