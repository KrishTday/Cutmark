"use client";
import {useEffect,useRef,useState} from "react";
import type {SavedProjectSummary} from "@/lib/project-history";
import {mediaUsage,modelCacheInfo,removeEnglishModel} from "@/lib/storage-tools";
interface Props {projects:SavedProjectSummary[];disabled:boolean;onWorking:(value:boolean)=>void;onCacheChange:()=>void;operationRef:{current:AbortController|null}}
export default function StoragePanel({projects,disabled,onWorking,onCacheChange,operationRef}:Props){
 const [estimate,setEstimate]=useState<StorageEstimate|null>(null),[model,setModel]=useState<Awaited<ReturnType<typeof modelCacheInfo>>|null>(null),[persistent,setPersistent]=useState<boolean|null>(null),[message,setMessage]=useState(""),[error,setError]=useState(""),[removing,setRemoving]=useState(false),[checking,setChecking]=useState(false);
 const active=useRef(true),generation=useRef(0),controllerRef=operationRef;
 useEffect(()=>{const guard=generation,aborter=controllerRef;active.current=true;return()=>{active.current=false;guard.current++;aborter.current?.abort();};},[controllerRef]);
 const inspect=async()=>{
  const ticket=++generation.current;setChecking(true);setError("");
  try{const values=await Promise.all([navigator.storage?.estimate?.()??null,modelCacheInfo(),navigator.storage?.persisted?.()??null]);if(active.current&&generation.current===ticket){setEstimate(values[0]);setModel(values[1]);setPersistent(values[2]);}}
  catch(error){if(active.current&&generation.current===ticket)setError(error instanceof Error?error.message:"Storage information is unavailable.");}
  finally{if(active.current&&generation.current===ticket)setChecking(false);}
 };
 const remove=async()=>{
  const job=new AbortController();controllerRef.current=job;setRemoving(true);onWorking(true);setError("");setMessage("Removing cached English model files…");
  try{const count=await removeEnglishModel(job.signal);if(active.current)setMessage(count+" English model files removed. Next transcription downloads missing files again.");}
  catch(error){if(active.current){if(job.signal.aborted)setMessage("Model cleanup cancelled. Removed files download again when needed.");else setError(error instanceof Error?error.message:"Model cleanup failed.");}}
  finally{if(active.current){setRemoving(false);controllerRef.current=null;onWorking(false);onCacheChange();await inspect();}}
 };
 const retain=async()=>{
  setError("");setChecking(true);
  try{if(!navigator.storage?.persist)throw new Error("This browser does not support a retention request.");const granted=await navigator.storage.persist();if(active.current){setPersistent(granted);setMessage(granted?"The browser granted persistent storage. Downloaded backups still protect against clearing browser data.":"The browser did not grant persistent storage. Keep downloaded project backups.");}}
  catch(error){if(active.current)setError(error instanceof Error?error.message:"Storage retention could not be requested.");}
  finally{if(active.current)setChecking(false);}
 };
 const usage=mediaUsage(projects),mb=(bytes:number)=>(bytes/1024/1024).toFixed(2)+" MB";
 return <details className="mt-3 rounded-lg border border-line p-3 text-xs text-ink-muted" onToggle={event=>{if(event.currentTarget.open)void inspect();}}><summary className="cursor-pointer py-1">Storage and model cache</summary>
 <p className="mt-2">Saved source references: {usage.sources.count} · {mb(usage.sources.bytes)} measured{usage.sources.unmeasured?" · "+usage.sources.unmeasured+" older sources unmeasured":""}. Rendered output references: {usage.outputs.count} · {mb(usage.outputs.bytes)} measured{usage.outputs.unmeasured?" · "+usage.outputs.unmeasured+" older outputs unmeasured":""}.</p>
 <p className="mt-1">Shared files are counted once within each category; legacy export-only files can appear in both. These figures exclude models, overhead and unsaved work.</p>
 {estimate?.usage!==undefined&&estimate.quota!==undefined&&<p className="mt-2">Estimated site usage: {mb(estimate.usage)} of {mb(estimate.quota)}. Includes projects, model files and other browser caches.</p>}
 <p className="mt-2">{model?model.available?"English model cache: "+model.count+" files · "+mb(model.bytes)+" reported sizes"+(model.unmeasured?" · "+model.unmeasured+" file sizes unavailable":""):"Model cache inspection is unavailable.":"Open this section to inspect model files."}</p>
 <p className="mt-2">Removing the English model leaves projects, captions, source media and MP4 downloads intact. The model downloads again on next use. Other models and caches are kept. Preview thumbnails and waveforms are held in memory and released when the source changes.</p>
 <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={disabled||checking||!model?.available||!model.count} onClick={()=>void remove()} className="timeline-tool">Remove cached English model</button><button type="button" disabled={disabled||checking} onClick={()=>void inspect()} className="timeline-tool">Refresh storage information</button>{removing&&<button type="button" onClick={()=>controllerRef.current?.abort()} className="timeline-tool">Cancel model cleanup</button>}</div>
 <p className="mt-3">Ask the browser to reduce automatic eviction of site data. This does not protect against clearing browser data and does not replace downloaded backups.</p>
 <button type="button" disabled={disabled||checking||persistent===true} onClick={()=>void retain()} className="timeline-tool mt-2">Request browser storage retention</button>
 {persistent!==null&&<p className="mt-2">Persistent storage: {persistent?"granted":"not granted"}.</p>}
 {checking&&<p className="mt-2" role="status">Inspecting storage…</p>}{message&&<p className="mt-2" role="status">{message}</p>}{error&&<p className="mt-2 text-rose-300" role="alert">{error}</p>}
 </details>;
}
