"use client";
import { useMemo, useState } from "react";
import Image from "next/image";
import TimeField from "./TimeField";
import useTimelineAnalysis from "./useTimelineAnalysis";
import { analysisMatches, sceneBetween, type SceneAnalysis, type SceneCut, type SceneSettings } from "@/lib/scene-tools";
import { formatTime } from "@/lib/timing";
interface Props {
  file:File; sourceId:string; duration:number; start:number; end:number; currentTime:number; cuts:SceneCut[]; analysis?:SceneAnalysis; settings:SceneSettings;
  disabled:boolean; message:string; failed:boolean; snap:boolean;
  onSettings:(settings:SceneSettings)=>void; onScan:(replace:boolean)=>void; onCuts:(cuts:SceneCut[],action:string,removed?:SceneCut)=>void;
  onSnap:(value:boolean)=>void; onSeek:(time:number)=>void; onJump:(direction:"previous"|"next")=>void; onRange:(start:number,end:number)=>void;
}
function BoundaryFrames({file,time}:{file:File;time:number}) {
  const times=useMemo(()=>[Number(Math.max(0,time-.000001).toFixed(6)),Number(time.toFixed(6))],[time]);
  const {thumbnails,thumbnailMessage}=useTimelineAnalysis(file,0,times);
  return <div className="mt-3"><div className="flex flex-wrap gap-3">{times.map((requested,index)=>{
    const frame=thumbnails.get(requested);
    return <figure key={index} className="text-xs text-ink-muted">{frame && <Image src={frame.url} width={160} height={90} unoptimized alt={(index?"At":"Before")+" candidate, decoded frame "+formatTime(frame.frameTime)} className="h-20 w-36 rounded bg-black object-contain"/>}<figcaption>{index?"At":"Before"} candidate{frame?" · "+formatTime(frame.frameTime):""}</figcaption></figure>;
  })}</div><p className="mt-1 text-xs text-ink-muted">{thumbnailMessage || "Sampled estimates can show the same frame on both sides. Refine or move the candidate to inspect the transition."}</p></div>;
}
export default function ScenePanel(props:Props) {
  const [replace,setReplace]=useState(false),[reviewId,setReviewId]=useState<string|null>(null);
  const from=props.settings.scope==="source"?0:props.start,to=props.settings.scope==="source"?props.duration:props.end;
  const current=analysisMatches(props.analysis,props.sourceId,from,to,props.settings);
  const reviewed=props.cuts.find(cut=>cut.id===reviewId);
  const patch=(id:string,update:Partial<SceneCut>,action:string)=>props.onCuts(props.cuts.map(cut=>cut.id===id?{...cut,...update}:cut),action,update.time!==undefined?props.cuts.find(cut=>cut.id===id):undefined);
  return <details className="mt-4 border-t border-line pt-3 text-xs text-ink-muted"><summary className="cursor-pointer py-2">Scene cuts · {props.cuts.length} markers</summary>
    <p className="mt-2">Find candidate boundaries, then review them. Motion, flashes and dissolves can affect detection. Export reuses your cuts without scanning again.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <label>Scan area<select aria-label="Scene scan area" value={props.settings.scope} disabled={props.disabled} onChange={event=>props.onSettings({...props.settings,scope:event.target.value as SceneSettings["scope"]})} className="ml-2 min-h-10 rounded border border-line bg-well px-2 text-ink"><option value="source">Full source</option><option value="selection">Selection</option></select></label>
      <label>Analysis<select aria-label="Scene analysis mode" value={props.settings.mode} disabled={props.disabled} onChange={event=>props.onSettings({...props.settings,mode:event.target.value as SceneSettings["mode"]})} className="ml-2 min-h-10 rounded border border-line bg-well px-2 text-ink"><option value="quick">Quick scan</option><option value="refined">Refine candidates</option></select></label>
      <label>Sensitivity<select aria-label="Scene sensitivity" value={props.settings.sensitivity} disabled={props.disabled} onChange={event=>props.onSettings({...props.settings,sensitivity:event.target.value as SceneSettings["sensitivity"]})} className="ml-2 min-h-10 rounded border border-line bg-well px-2 text-ink"><option value="fewer">Fewer cuts</option><option value="balanced">Balanced</option><option value="more">More cuts</option></select></label>
    </div>
    <p className="mt-2">Quick scans sample up to 480 frames. Refinement searches candidate brackets using decoded frame timestamps; it does not check every frame in the source or guarantee every edit is found.</p>
    {props.analysis && <div className="mt-3 rounded border border-line p-3" aria-label="Scene analysis record">
      <p>{current?"Scan matches the current area and settings.":props.analysis.complete?"Scan completed with earlier area or settings.":"Partial scan; unvisited footage has not been checked."}</p>
      <p className="mt-1">Checked {props.analysis.samplesChecked} of {props.analysis.plannedSamples} sample positions · {formatTime(props.analysis.start)} to {formatTime(props.analysis.coverageEnd)} · sample spacing {props.analysis.interval.toFixed(3)} seconds · {props.analysis.refinedCount} refined candidates.</p>
      <p className="mt-1">Last scan: {props.analysis.settings.mode} · {props.analysis.settings.sensitivity} · {new Date(props.analysis.createdAt).toLocaleString()}</p>
      {props.analysis.reason && <p className="mt-1 text-amber-200">{props.analysis.reason}</p>}
    </div>}
    <label className="mt-3 flex min-h-10 items-center gap-2"><input type="checkbox" checked={replace} disabled={props.disabled} onChange={event=>setReplace(event.target.checked)}/>Replace reviewed and manual cuts in the scan area</label>
    <p>{replace?"Replacement also clears dismissed candidates in this area. Cuts outside the area remain.":"Rescans refresh unreviewed candidates and preserve manual, confirmed and dismissed cuts."}</p>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" onClick={()=>props.onScan(replace)} disabled={props.disabled||to<=from} className="timeline-tool">{props.analysis||props.cuts.length?"Rescan cuts":"Detect cuts"}</button>
      <button type="button" onClick={()=>props.onJump("previous")} disabled={!props.cuts.length||props.disabled} className="timeline-tool" aria-label="Jump to previous scene cut">Previous cut</button>
      <button type="button" onClick={()=>props.onJump("next")} disabled={!props.cuts.length||props.disabled} className="timeline-tool" aria-label="Jump to next scene cut">Next cut</button>
      <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={props.snap} onChange={event=>props.onSnap(event.target.checked)} disabled={!props.cuts.length||props.disabled}/>Snap to cuts</label>
      <button type="button" disabled={props.disabled||props.currentTime<=0||props.currentTime>=props.duration||props.cuts.some(cut=>Math.abs(cut.time-props.currentTime)<.000001)} onClick={()=>props.onCuts([...props.cuts,{id:crypto.randomUUID(),time:props.currentTime,origin:"manual" as const,confirmed:true}].sort((a,b)=>a.time-b.time),"Add scene cut")} className="timeline-tool">Add cut at playhead</button>
      <button type="button" disabled={props.disabled} className="timeline-tool" onClick={()=>{const scene=sceneBetween(props.currentTime,props.cuts,props.duration);props.onRange(scene.start,scene.end);}}>Select scene at playhead</button>
    </div>
    {props.message && <p className={"mt-2 "+(props.failed?"text-rose-300":"")} role="status">{props.message}</p>}
    <ul className="mt-3 max-h-72 space-y-2 overflow-auto">{props.cuts.map((cut,index)=><li key={cut.id} className="rounded border border-line p-3">
      <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={props.disabled} onClick={()=>{setReviewId(cut.id);props.onSeek(cut.time);}} className="timeline-tool" aria-label={"Review scene cut "+(index+1)}>{formatTime(cut.time)}</button><span>{cut.origin==="manual"?"Manual cut":cut.origin==="legacy"?"Existing cut":cut.refined?"Refined candidate":"Sampled estimate"} · {cut.confirmed?"Confirmed":"Needs review"}</span></div>
      <label className="mt-2 block">Boundary time<TimeField value={cut.time} label={"Scene cut "+(index+1)+" time"} disabled={props.disabled} validate={time=>!Number.isFinite(time)||time<=0||time>=props.duration?"Place a cut inside the source.":props.cuts.some(other=>other.id!==cut.id&&Math.abs(other.time-time)<.000001)?"A cut already exists at this time.":null} onCommit={time=>patch(cut.id,{time,origin:"manual",confirmed:true,refined:undefined,bracket:undefined},"Move scene cut")}/></label>
      <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={props.disabled||cut.confirmed} onClick={()=>patch(cut.id,{confirmed:true},"Confirm scene cut")} aria-label={"Confirm scene cut "+(index+1)} className="timeline-tool">Confirm</button><button type="button" disabled={props.disabled} onClick={()=>props.onCuts(props.cuts.filter(other=>other.id!==cut.id),"Remove scene cut",cut)} aria-label={"Remove cut at "+formatTime(cut.time)} className="timeline-tool">Remove</button></div>
    </li>)}</ul>
    {reviewed && <BoundaryFrames file={props.file} time={reviewed.time}/>}
  </details>;
}
