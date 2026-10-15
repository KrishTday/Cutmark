"use client";
import {useEffect,useRef,useState,type RefObject} from "react";
export default function AudioMeter({videoRef}:{videoRef:RefObject<HTMLVideoElement|null>}){
 const graphRef=useRef<{context:AudioContext;analyser:AnalyserNode;source:MediaElementAudioSourceNode;video:HTMLVideoElement}|null>(null),frameRef=useRef(0),pendingRef=useRef(false),activeRef=useRef(false),mountedRef=useRef(true);
 const [enabled,setEnabled]=useState(false),[peak,setPeak]=useState(0),[message,setMessage]=useState("");
 useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;activeRef.current=false;cancelAnimationFrame(frameRef.current);const graph=graphRef.current;graph?.source.disconnect();void graph?.context.close();};},[]);
 const toggle=async()=>{
  if(activeRef.current){activeRef.current=false;cancelAnimationFrame(frameRef.current);setEnabled(false);return;}
  if(pendingRef.current)return;const video=videoRef.current;if(!video)return;pendingRef.current=true;
  try{
   if(!graphRef.current||graphRef.current.video!==video){if(graphRef.current)await graphRef.current.context.close();const context=new AudioContext(),source=context.createMediaElementSource(video),analyser=context.createAnalyser();analyser.fftSize=2048;source.connect(analyser);analyser.connect(context.destination);graphRef.current={context,source,analyser,video};}
   await graphRef.current.context.resume();if(!mountedRef.current)return;
   activeRef.current=true;setEnabled(true);setMessage("");const samples=new Float32Array(2048);let last=0;
   const measure=(now:number)=>{if(!activeRef.current)return;const graph=graphRef.current;if(graph&&now-last>=100){graph.analyser.getFloatTimeDomainData(samples);let maximum=0;for(const sample of samples)maximum=Math.max(maximum,Math.abs(sample));setPeak(maximum);last=now;}frameRef.current=requestAnimationFrame(measure);};frameRef.current=requestAnimationFrame(measure);
  }catch(error){if(mountedRef.current)setMessage(error instanceof Error?error.message:"The listening meter is unavailable.");}finally{pendingRef.current=false;}
 };
 return <details className="mt-2 rounded border border-line p-2 text-xs text-ink-muted"><summary className="cursor-pointer py-2">Listening level meter</summary><p>This measures the primary source preview. It is a sample-peak listening meter, not a true-peak or loudness-standard measurement. Preview volume affects listening; exported gain is adjusted separately.</p><button type="button" onClick={()=>void toggle()} className="timeline-tool mt-2">{enabled?"Stop listening meter":"Enable listening meter"}</button>{enabled&&<div className="mt-2"><meter aria-label="Listening sample peak" min="0" max="1" value={Math.min(1,peak)} className="h-4 w-full"/><p>{peak>0?(20*Math.log10(peak)).toFixed(1)+" dBFS":"Silent / paused"}{peak>=1?" · Signal at or above clipping ceiling":""}</p></div>}{message&&<p role="status" className="mt-2">{message}</p>}</details>;
}
