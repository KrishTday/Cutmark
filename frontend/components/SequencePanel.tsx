"use client";
import TimeField from "./TimeField";
import {useState} from "react";
import {formatTime,validateRange,sequenceDuration,type SourceRange} from "@/lib/timing";
export default function SequencePanel({ranges,selected,duration,frameRate,currentTime,disabled,onSelect,onChange,onPreview}:{ranges:SourceRange[];selected:number;duration:number;frameRate?:number|null;currentTime:number;disabled:boolean;onSelect:(index:number,time?:number)=>void;onChange:(ranges:SourceRange[],action:string)=>void;onPreview:()=>void}){
 const [message,setMessage]=useState("");
 const active=ranges[selected];
 const split=()=>{if(!active)return;const a=validateRange(active.start,currentTime,duration,frameRate),b=validateRange(currentTime,active.end,duration,frameRate);if(a||b){setMessage("Place the playhead inside this range with at least one frame on each side.");return;}onChange(ranges.flatMap((range,index)=>index===selected?[{...range,end:currentTime},{...range,id:crypto.randomUUID(),start:currentTime}]:[range]),"Split kept range");setMessage("");};
 const move=(index:number,to:number)=>{const next=[...ranges];const [range]=next.splice(index,1);next.splice(to,0,range);onChange(next,"Reorder kept ranges");onSelect(to,range.start);};

 return <details className="mt-3 rounded-lg border border-line p-3 text-xs text-ink-muted"><summary className="cursor-pointer py-2">Kept ranges · {ranges.length} · {formatTime(sequenceDuration(ranges))}</summary>
 <p className="mt-2">Ranges play in this order with hard cuts and closed gaps. The timeline edits the selected range. Captions and markers retain source times; repeated ranges repeat their captions. Render a sequence preview to hear and inspect the actual joins.</p>
 <ol className="mt-3 space-y-3">{ranges.map((range,index)=><li key={range.id} className="rounded border border-line p-2">
 <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={disabled} aria-pressed={selected===index} onClick={()=>onSelect(index)} className="timeline-tool">Edit range {index+1}</button><span>{formatTime(range.end-range.start)}</span>
 <button type="button" aria-label={"Move range "+(index+1)+" earlier"} disabled={disabled||index===0} onClick={()=>move(index,index-1)} className="timeline-tool">Earlier</button><button type="button" aria-label={"Move range "+(index+1)+" later"} disabled={disabled||index===ranges.length-1} onClick={()=>move(index,index+1)} className="timeline-tool">Later</button>
 <button type="button" aria-label={"Remove range "+(index+1)} disabled={disabled||ranges.length===1} onClick={()=>{onChange(ranges.filter((_,i)=>i!==index),"Remove kept range");onSelect(Math.max(0,index-1));}} className="timeline-tool">Remove</button></div>
 <div className="mt-2 flex flex-wrap gap-2">{(["start","end"] as const).map(point=><label key={point}>{point==="start"?"In":"Out"}<TimeField value={range[point]} label={"Range "+(index+1)+" "+point} disabled={disabled} validate={value=>validateRange(point==="start"?value:range.start,point==="end"?value:range.end,duration,frameRate)} onCommit={value=>onChange(ranges.map((r,i)=>i===index?{...r,[point]:value}:r),"Change kept range")}/></label>)}</div></li>)}</ol>
 <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={disabled||ranges.length>=100} onClick={()=>{onChange([...ranges,{...active,id:crypto.randomUUID()}],"Add kept range");onSelect(ranges.length,active.start);}} className="timeline-tool">Add kept range</button><button type="button" disabled={disabled||ranges.length>=100} onClick={split} className="timeline-tool">Split range at playhead</button><button type="button" disabled={disabled} onClick={onPreview} className="timeline-tool">Render sequence preview</button></div>
 {message&&<p role="alert" className="mt-2 text-amber-200">{message}</p>}</details>;
}
