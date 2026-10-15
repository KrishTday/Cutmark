"use client";
import {pauseOtherPreviews} from "@/lib/playback";
import {useEffect,useState} from "react";
import TimeField from "./TimeField";
import {formatTime,validateRange} from "@/lib/timing";
import type {ClipDefinition,ClipOutput} from "@/lib/clip-tools";
export default function ClipQueue({file,clips,outputs,revision,duration,disabled,onChange,onAdd,onRun,onCancel}:{file:File;clips:ClipDefinition[];outputs:ClipOutput[];revision:number;duration:number;disabled:boolean;onChange:(clips:ClipDefinition[],action:string)=>void;onAdd:()=>void;onRun:()=>void;onCancel:()=>void}){
 const [images,setImages]=useState<Record<number,string>>({});
 const times=clips.map(clip=>clip.range.start).join(",");
 useEffect(()=>{
   if(!times)return;
   const urls:string[]=[];let active=true;
   const worker=new Worker(new URL("../lib/timeline-analysis.worker.ts",import.meta.url),{type:"module"});
   worker.onmessage=({data})=>{if(active&&data.type==="thumbnail"){const url=URL.createObjectURL(data.blob);urls.push(url);setImages(previous=>({...previous,[data.time]:url}));}};
   worker.postMessage({kind:"thumbnails",file,times:times?[...new Set(times.split(",").map(Number))]:[]});
   return()=>{active=false;worker.terminate();urls.forEach(url=>URL.revokeObjectURL(url));};
 },[file,times]);
 const update=(id:string,values:Partial<ClipDefinition>,action="Change clip definition")=>onChange(clips.map(c=>c.id===id?{...c,...values}:c),action);
 return <details className="mt-3 rounded-lg border border-line p-3 text-xs text-ink-muted"><summary className="cursor-pointer py-2">Named clips and export queue · {clips.length}</summary>
 <p className="mt-2">Add the selected range as a named deliverable. Each clip captures its framing and export settings. Captions and audio changes are captured when the queue starts. Jobs run one at a time; a failed job leaves other results available. Downloads remain here while this project is open; clip definitions save with the project.</p>
 <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={disabled||clips.length>=20} onClick={onAdd} className="timeline-tool">Add selected range as clip</button><button type="button" disabled={disabled||!clips.some(c=>c.selected)} onClick={onRun} className="timeline-tool">Export selected clips</button>{outputs.some(o=>o.status==="working")&&<button type="button" onClick={onCancel} className="timeline-tool">Cancel current clip</button>}</div>
 <ul className="mt-3 space-y-3">{clips.map((clip,index)=>{const output=outputs.find(o=>o.id===clip.id);return <li key={clip.id} className="rounded border border-line p-2">
 {/* These are actual locally decoded thumbnail URLs. */}
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {images[clip.range.start]&&<img src={images[clip.range.start]} alt={"Source frame for "+clip.name} className="mb-2 h-16 w-auto rounded"/>}
 <div className="flex flex-wrap items-center gap-2"><input aria-label={"Queue clip "+(index+1)} type="checkbox" checked={clip.selected} disabled={disabled} onChange={e=>update(clip.id,{selected:e.target.checked})}/><label className="flex-1">Clip name<input aria-label={"Clip "+(index+1)+" name"} value={clip.name} maxLength={100} disabled={disabled} onChange={e=>update(clip.id,{name:e.target.value})} className="mt-1 min-h-10 w-full rounded bg-well px-2"/></label><button type="button" disabled={disabled} onClick={()=>onChange(clips.filter(c=>c.id!==clip.id),"Remove named clip")} className="timeline-tool">Remove clip</button></div>
 <div className="mt-2 flex gap-2">{(["start","end"] as const).map(point=><label key={point}>{point==="start"?"In":"Out"}<TimeField label={"Clip "+(index+1)+" "+point} value={clip.range[point]} disabled={disabled} validate={value=>validateRange(point==="start"?value:clip.range.start,point==="end"?value:clip.range.end,duration)} onCommit={value=>update(clip.id,{range:{...clip.range,[point]:value}})}/></label>)}</div>
 <p className="mt-2">{formatTime(clip.range.end-clip.range.start)} · {clip.framing.ratio} · {clip.preferences.resolution} resolution · {clip.preferences.quality} · {clip.preferences.audio==="keep"?"keep audio":"no audio"}</p>
 <label className="mt-2 block">Clip quality<select aria-label={"Clip "+(index+1)+" quality"} value={clip.preferences.quality} disabled={disabled} onChange={e=>update(clip.id,{preferences:{...clip.preferences,quality:e.target.value as ClipDefinition["preferences"]["quality"]}})} className="ml-2 min-h-10 rounded bg-well p-2">{["balanced","smaller","high"].map(q=><option key={q}>{q}</option>)}</select></label>
 {output&&<p role="status" className="mt-2">{output.status} · revision {output.revision} · {output.message}</p>}{output?.url&&<div className="mt-2 flex flex-wrap gap-2"><span>{output.exportRevision===revision?"Latest clip output":"Earlier clip output"} · revision {output.exportRevision}</span><a download={output.fileName} href={output.url} className="timeline-tool">Download {clip.name} MP4</a>{output.captions&&<a download={output.fileName?.replace(/\.mp4$/,".vtt")} href={"data:text/vtt;charset=utf-8,"+encodeURIComponent(output.captions)} className="timeline-tool">Clip subtitles</a>}<details className="w-full"><summary className="cursor-pointer py-2">Review clip output</summary><video onPlay={event=>pauseOtherPreviews(event.currentTarget)} src={output.url} controls preload="metadata" className="max-h-64 w-full"/></details></div>}
 </li>})}</ul></details>;
}
