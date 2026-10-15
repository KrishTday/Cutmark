"use client";
import NumericField from "./NumericField";
import {useEffect,useMemo,useRef,useState} from "react";
import {silenceSuggestions} from "@/lib/sequence-edits";
import {formatTime} from "@/lib/timing";
export default function CleanupPanel({file,duration,gainDb,disabled,onReview,onApply}:{file:File;duration:number;gainDb:number;disabled:boolean;onReview:(start:number,end:number)=>void;onApply:(ranges:{start:number;end:number}[])=>void}){
 const [data,setData]=useState<{peaks:Float32Array;binSeconds:number;maximum:number}|null>(null),[message,setMessage]=useState(""),[working,setWorking]=useState(false);
 const [threshold,setThreshold]=useState(-40),[minimum,setMinimum]=useState(.8),[padding,setPadding]=useState(.2),[selected,setSelected]=useState<number[]>([]);
 const workerRef=useRef<Worker|null>(null);
 useEffect(()=>()=>workerRef.current?.terminate(),[]);
 const suggestions=useMemo(()=>data?silenceSuggestions(data.peaks,data.binSeconds,threshold,minimum,padding,duration):[],[data,threshold,minimum,padding,duration]);
 const cancel=()=>{workerRef.current?.terminate();workerRef.current=null;setWorking(false);setMessage("Analysis cancelled; source and edits are preserved.");};
 const analyze=()=>{
   workerRef.current?.terminate();const worker=new Worker(new URL("../lib/timeline-analysis.worker.ts",import.meta.url),{type:"module"});workerRef.current=worker;setWorking(true);setMessage("Decoding source samples…");
   const finish=()=>{worker.terminate();if(workerRef.current===worker){workerRef.current=null;setWorking(false);}};
   worker.onmessage=({data:response})=>{
    if(workerRef.current!==worker)return;
    if(response.type==="progress")setMessage("Decoding samples… about "+response.percent+"%");
    if(response.type==="waveform"){setData({peaks:response.levels[0],binSeconds:response.binSeconds,maximum:response.maximum});setSelected([]);setMessage("Sample analysis ready. Suggestions are approximate peak-bin intervals, not speech recognition.");finish();}
    if(response.type==="absent"||response.type==="error"){setMessage(response.type==="absent"?"This source has no audio track.":response.message);finish();}
   };
   worker.onerror=()=>{setMessage("Audio analysis could not run. Source and edits remain available.");finish();};
   worker.postMessage({kind:"waveform",file,duration});
 };
 return <details className="mt-3 rounded-lg border border-line p-3 text-xs text-ink-muted"><summary className="cursor-pointer py-2">Audio levels and pause suggestions</summary>
 <p className="mt-2">Analyze the primary source and review low-amplitude intervals before removing anything. Quiet words, breaths and deliberate pauses may be flagged. Padding keeps material on both sides. Level feedback uses decoded sample peaks; it is not a true-peak or loudness-standard measurement.</p>
 <div className="mt-3 flex gap-2"><button type="button" disabled={disabled||working} onClick={analyze} className="timeline-tool">Analyze audio levels</button>{working&&<button type="button" onClick={cancel} className="timeline-tool">Cancel audio analysis</button>}</div>
 {message&&<p role="status" className="mt-2">{message}</p>}
 {data&&<p className="mt-2">Decoded source sample peak: {data.maximum? (20*Math.log10(data.maximum)).toFixed(1)+" dBFS":"silent"}. After {gainDb} dB gain: {data.maximum?(20*Math.log10(data.maximum)+gainDb).toFixed(1)+" dBFS":"silent"}.{data.maximum*10**(gainDb/20)>1&&<span className="text-amber-200"> Signal may clip; reduce exported gain.</span>}</p>}
 <div className="mt-3 grid grid-cols-2 gap-3">{([{key:"threshold",label:"Silence threshold dBFS",value:threshold,min:-60,max:-10,step:1,set:setThreshold},{key:"minimum",label:"Minimum pause seconds",value:minimum,min:.2,max:10,step:.1,set:setMinimum},{key:"padding",label:"Pause speech padding seconds",value:padding,min:0,max:2,step:.05,set:setPadding}]).map(field=><label key={field.key}>{field.label}<NumericField label={field.label} value={field.value} min={field.min} max={field.max} disabled={disabled||working} onCommit={value=>{field.set(value);setSelected([]);}}/></label>)}</div>
 {data&&<p className="mt-2">{suggestions.length} candidates · sample bins about {Math.round(data.binSeconds*1000)} ms</p>}
 <ul className="mt-2 max-h-64 space-y-2 overflow-auto">{suggestions.slice(0,200).map((range,index)=><li key={index} className="flex flex-wrap items-center gap-2"><label className="flex min-h-10 items-center gap-2"><input aria-label={"Remove pause "+(index+1)} type="checkbox" checked={selected.includes(index)} disabled={disabled||working} onChange={e=>setSelected(previous=>e.target.checked?[...previous,index]:previous.filter(i=>i!==index))}/>{formatTime(range.start)} – {formatTime(range.end)}</label><button type="button" disabled={disabled||working} onClick={()=>onReview(Math.max(0,range.start-.5),Math.min(duration,range.end+.5))} className="timeline-tool">Review pause {index+1}</button></li>)}</ul>
 {suggestions.length>200&&<p>Showing the first 200 candidates; adjust the threshold or minimum pause to narrow the list.</p>}
 <button type="button" disabled={disabled||working||!selected.length} onClick={()=>{onApply(selected.map(index=>suggestions[index]));setSelected([]);}} className="timeline-tool mt-3">Remove reviewed pauses</button></details>;
}
