"use client";
import { useState } from "react";
import TimeField from "./TimeField";
import { formatTime } from "@/lib/timing";
import type { EditorialMarker } from "@/lib/scene-tools";
interface Props { markers:EditorialMarker[]; duration:number; disabled:boolean; getPlayhead:()=>number; onSeek:(time:number)=>void; onChange:(markers:EditorialMarker[],action:string,group?:string)=>void }
export default function MarkerPanel({markers,duration,disabled,getPlayhead,onSeek,onChange}:Props) {
  const [search,setSearch]=useState(""),[name,setName]=useState("Hook"),[message,setMessage]=useState("");
  const change=(id:string,update:Partial<EditorialMarker>,action:string,group?:string)=>onChange(markers.map(marker=>marker.id===id?{...marker,...update}:marker),action,group);
  const add=()=>{
    const time=getPlayhead();
    if(!name.trim()){setMessage("Give the marker a name.");return;}
    if(time<0||time>=duration){setMessage("Place the playhead within the source to add a marker.");return;}
    onChange([...markers,{id:crypto.randomUUID(),time,name:name.trim(),note:"",color:"lavender"}],"Add editorial marker");setMessage("");
  };
  const visible=markers.filter(marker=>(marker.name+" "+marker.note).toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a,b)=>a.time-b.time);
  return <details className="mt-3 border-t border-line pt-3 text-xs text-ink-muted"><summary className="cursor-pointer py-2">Editorial markers · {markers.length}</summary>
    <p className="mt-2">Name a hook, quote, pickup, problem or chapter. These source notes stay separate from detected cuts and survive rescans.</p>
    <div className="mt-3 flex flex-wrap gap-2"><label className="min-w-0 flex-1">New marker name<input aria-label="New editorial marker name" value={name} disabled={disabled} onChange={event=>setName(event.target.value)} className="mt-1 min-h-10 w-full rounded border border-line bg-well px-2 text-sm text-ink"/></label><button type="button" disabled={disabled||duration<=0} onClick={add} className="timeline-tool self-end">Add marker at playhead</button></div>
    <label className="mt-3 block">Find markers<input type="search" aria-label="Search editorial markers" placeholder="Name or note…" value={search} onChange={event=>setSearch(event.target.value)} className="mt-1 min-h-10 w-full rounded border border-line bg-well px-2 text-sm text-ink"/></label>
    {message && <p role="alert" className="mt-2 text-rose-300">{message}</p>}
    <ul className="mt-3 max-h-80 space-y-2 overflow-auto">{visible.map(marker=><li key={marker.id} className="rounded border border-line p-3" aria-label={"Editorial marker "+marker.name}>
      <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={disabled} onClick={()=>onSeek(marker.time)} className="timeline-tool" aria-label={"Seek to marker "+marker.name}>{formatTime(marker.time)}</button><label>Color<select aria-label={"Marker "+marker.name+" color"} value={marker.color} disabled={disabled} onChange={event=>change(marker.id,{color:event.target.value as EditorialMarker["color"]},"Change marker color")} className="ml-2 min-h-10 rounded border border-line bg-well px-2 text-ink">{["lavender","gold","green","rose"].map(color=><option key={color} value={color}>{color}</option>)}</select></label></div>
      <label className="mt-2 block">Name<input aria-label={"Marker "+marker.name+" name"} value={marker.name} disabled={disabled} onChange={event=>change(marker.id,{name:event.target.value},"Rename marker","marker-name-"+marker.id)} className="mt-1 min-h-10 w-full rounded border border-line bg-well px-2 text-sm text-ink"/></label>
      <label className="mt-2 block">Time<TimeField value={marker.time} label={"Marker "+marker.name+" time"} disabled={disabled} validate={time=>time<0||time>=duration?"Place the marker within the source.":null} onCommit={time=>change(marker.id,{time},"Move editorial marker")}/></label>
      <label className="mt-2 block">Note<textarea aria-label={"Marker "+marker.name+" note"} value={marker.note} disabled={disabled} onChange={event=>change(marker.id,{note:event.target.value},"Edit marker note","marker-note-"+marker.id)} rows={2} className="mt-1 min-h-16 w-full rounded border border-line bg-well px-2 py-2 text-sm text-ink"/></label>
      <button type="button" disabled={disabled} onClick={()=>onChange(markers.filter(other=>other.id!==marker.id),"Remove editorial marker")} aria-label={"Remove marker "+marker.name} className="timeline-tool mt-2">Remove</button>
    </li>)}</ul>
    {!visible.length && <p className="mt-2">{markers.length?"No markers match your search.":"No editorial markers yet."}</p>}
  </details>;
}
