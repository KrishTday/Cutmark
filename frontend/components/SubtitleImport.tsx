"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {decodeSubtitleBytes,parseSubtitleImport,type SubtitleImport as ImportResult} from "@/lib/subtitle-import";
import {formatTime} from "@/lib/timing";
import type {CaptionCue} from "@/lib/captions";
interface Props{cues:CaptionCue[];duration:number;start:number;end:number;disabled:boolean;onChange:(cues:CaptionCue[],group?:string,action?:string)=>void}
export default function SubtitleImport({cues,duration,start,end,disabled,onChange}:Props){
  const [parsed,setParsed]=useState<ImportResult|null>(null),[fileName,setFileName]=useState(""),[error,setError]=useState(""),[reading,setReading]=useState(false);
  const [timebase,setTimebase]=useState<"source"|"selection">("source"),[mode,setMode]=useState<"append"|"replace">("append"),[accept,setAccept]=useState(false);
  const generation=useRef(0);
  useEffect(()=>()=>{generation.current++;},[]);
  const rows=useMemo(()=>parsed?.cues.map(cue=>({...cue,start:cue.start+(timebase==="selection"?start:0),end:cue.end+(timebase==="selection"?start:0)}))??[],[parsed,timebase,start]);
  const invalid=rows.filter(cue=>cue.start<0||cue.end>duration||(timebase==="selection"&&cue.end>end));
  const outside=rows.filter(cue=>cue.start<start||cue.end>end).length;
  const warnings=parsed?.issues.length??0;
  const choose=async(file:File)=>{
    const ticket=++generation.current;setReading(true);setParsed(null);setError("");setAccept(false);setFileName(file.name);
    try{if(file.size>2*1024*1024)throw new Error("Subtitle files must be 2 MB or smaller.");const text=decodeSubtitleBytes(await file.arrayBuffer()),result=parseSubtitleImport(text,file.name.toLowerCase().endsWith(".vtt")||text.startsWith("WEBVTT")?"vtt":"srt");if(generation.current===ticket)setParsed(result);}
    catch(error){if(generation.current===ticket)setError(error instanceof Error?error.message:"Subtitle file could not be read.");}
    finally{if(generation.current===ticket)setReading(false);}
  };
  const apply=()=>{
    if(!rows.length||invalid.length||((warnings>0)&&!accept))return;
    const first=mode==="append"?Math.max(0,...cues.map(cue=>cue.id))+1:1;
    const imported=rows.map((cue,index)=>({...cue,id:first+index}));
    onChange(mode==="append"?[...cues,...imported]:imported,undefined,mode==="append"?"Import subtitle cues":"Replace captions from file");
    setParsed(null);setError("");setFileName("");
  };
  return <details className="mb-4 rounded-lg border border-line p-3 text-xs text-ink-muted"><summary className="cursor-pointer py-1">Import SRT or VTT</summary>
    <p className="mt-2">Review words and timings before appending or replacing captions. UTF-8 and BOM-marked UTF-16 are supported; limits are 2 MB and 5,000 cues.</p>
    <label className="mt-3 block">Choose subtitle file<input type="file" aria-label="Subtitle file" accept=".srt,.vtt,text/vtt,text/plain,application/x-subrip" disabled={disabled||reading} onChange={event=>{const file=event.target.files?.[0];if(file)void choose(file);event.target.value="";}} className="mt-2 block w-full text-xs"/></label>
    {reading&&<p className="mt-2" role="status">Reading subtitles…</p>}
    {error&&<p className="mt-2 text-rose-300" role="alert">{error}</p>}
    {parsed&&<div className="mt-3 space-y-3">
      <p>{fileName} · {rows.length} valid cues · {parsed.issues.filter(issue=>issue.kind==="error").length} unreadable blocks</p>
      <label className="flex flex-wrap items-center gap-2">File timestamps<select aria-label="Subtitle timestamp basis" value={timebase} disabled={disabled} onChange={event=>setTimebase(event.target.value as "source"|"selection")} className="min-h-10 rounded border border-line bg-well px-2 text-ink"><option value="source">Original source time</option><option value="selection">Relative to selection start</option></select></label>
      <label className="flex flex-wrap items-center gap-2">Apply as<select aria-label="Subtitle import action" value={mode} disabled={disabled} onChange={event=>setMode(event.target.value as "append"|"replace")} className="min-h-10 rounded border border-line bg-well px-2 text-ink"><option value="append">Append cues</option><option value="replace">Replace all captions</option></select></label>
      {invalid.length>0&&<p role="alert" className="text-rose-300">{invalid.length} imported cues exceed the chosen time basis or source. Correct the file or time basis; nothing has changed.</p>}
      {!invalid.length&&outside>0&&<p className="text-amber-200">{outside} cues extend outside the selection and remain in source time. Selected subtitle delivery clips intersections.</p>}
      <ul className="max-h-32 space-y-1 overflow-auto">{parsed.issues.map((issue,index)=><li key={index} className={issue.kind==="error"?"text-rose-300":"text-amber-200"}>Block {issue.block}: {issue.message}</li>)}</ul>
      {warnings>0&&<label className="flex items-start gap-2"><input type="checkbox" aria-label="Accept subtitle import warnings" checked={accept} disabled={disabled} onChange={event=>setAccept(event.target.checked)}/>I reviewed formatting changes and will import only the valid cues; unreadable blocks are skipped.</label>}
      <ol aria-label="Subtitle import preview" className="max-h-48 space-y-2 overflow-auto">{rows.map(cue=><li key={cue.id} className="rounded border border-line p-2"><p className="font-mono">{formatTime(cue.start)} — {formatTime(cue.end)}</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink">{cue.text}</p></li>)}</ol>
      <p>{mode==="replace"?"Applying replaces all existing captions. Undo restores them.":"Existing corrections remain; imported cues receive new identifiers. Overlaps are flagged for review."}</p>
      <button type="button" disabled={disabled||!rows.length||invalid.length>0||(warnings>0&&!accept)} onClick={apply} className="timeline-tool">{mode==="replace"?"Replace captions from file":"Append imported captions"}</button>
      <button type="button" onClick={()=>{setParsed(null);setFileName("");setError("");}} className="timeline-tool ml-2">Discard import</button>
    </div>}
  </details>;
}
