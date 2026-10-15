"use client";
import {useEffect,useRef,useState} from "react";
import {readBackup,verifyRelink,additionalReferences,verifyImageRelink,type ProjectBackup,type SourceReference} from "@/lib/portable-project";
import type {ImageReference} from "@/lib/image-tools";
import {probeMedia} from "@/lib/media";
interface Props {disabled:boolean;onRestore:(backup:ProjectBackup,source:Blob,mediaAssets?:Record<string,Blob>)=>Promise<void>;onCancelRestore:()=>void}
export default function ProjectRecovery({disabled,onRestore,onCancelRestore}:Props){
 const [pending,setPending]=useState<{backup:ProjectBackup;source?:Blob;mediaAssets?:Record<string,Blob>}|null>(null),[verified,setVerified]=useState(false),[working,setWorking]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const restoring=useRef<number|null>(null);
 const controller=useRef<AbortController|null>(null),ticket=useRef(0);
 useEffect(()=>()=>{ticket.current++;controller.current?.abort();},[]);
 const discard=()=>{if(restoring.current!==null){onCancelRestore();restoring.current=null;}ticket.current++;controller.current?.abort();setPending(null);setVerified(false);setWorking(false);setError("");setMessage("");};
 const check=async(backup:ProjectBackup,source:Blob,signal:AbortSignal,id:number,mediaAssets:Record<string,Blob>={})=>{
  const metadata=await probeMedia(source,signal);
  await verifyRelink(backup,source,metadata,signal,progress=>{if(ticket.current===id)setMessage("Verifying source contents… "+Math.round(progress*100)+"%");});
  const missing:(SourceReference|ImageReference)[]=[];
  for(const reference of additionalReferences(backup)){const blob=mediaAssets[reference.fingerprint];if(!blob){missing.push(reference);continue;}if(reference.kind==="image")await verifyImageRelink(reference,blob,signal);else{const extraMetadata=await probeMedia(blob,signal);await verifyRelink({...backup,source:reference},blob,extraMetadata,signal);}}
  if(ticket.current===id){setPending({backup,source,mediaAssets});setVerified(!missing.length);setMessage(missing.length?"Primary source matches. Relink "+missing.length+" additional source(s) before restoring.":"All source contents and metadata match. Ready to restore as a separate project.");}
 };
 const read=async(file:File)=>{
  controller.current?.abort();const operation=new AbortController(),id=++ticket.current;controller.current=operation;setWorking(true);setError("");setMessage("Reading project backup…");setPending(null);setVerified(false);
  try{const result=await readBackup(file,operation.signal);if(ticket.current!==id)return;setPending(result);if(result.source)await check(result.backup,result.source,operation.signal,id,result.mediaAssets);else setMessage("Choose the matching source video. The filename may differ; contents must match.");}
  catch(error){if(ticket.current===id){setError(error instanceof Error?error.message:"Backup could not be read.");setMessage("");}}
  finally{if(restoring.current===id)restoring.current=null;if(ticket.current===id)setWorking(false);}
 };
 const relink=async(file:File)=>{
  if(!pending)return;controller.current?.abort();const operation=new AbortController(),id=++ticket.current;controller.current=operation;setWorking(true);setVerified(false);setError("");setMessage("Checking selected source…");
  try{await check(pending.backup,file,operation.signal,id,pending.mediaAssets);}catch(error){if(ticket.current===id){setError(error instanceof Error?error.message:"Source could not be verified.");setMessage("");}}
  finally{if(restoring.current===id)restoring.current=null;if(ticket.current===id)setWorking(false);}
 };
 const relinkAdditional=async(reference:SourceReference|ImageReference,file:File)=>{
  if(!pending)return;controller.current?.abort();const operation=new AbortController(),id=++ticket.current;controller.current=operation;setWorking(true);setVerified(false);setError("");setMessage("Checking additional source…");
  try{if(reference.kind==="image")await verifyImageRelink(reference,file,operation.signal);else{const metadata=await probeMedia(file,operation.signal);await verifyRelink({...pending.backup,source:reference},file,metadata,operation.signal);}const mediaAssets={...pending.mediaAssets,[reference.fingerprint]:file};if(pending.source)await check(pending.backup,pending.source,operation.signal,id,mediaAssets);else if(ticket.current===id){setPending({...pending,mediaAssets});setMessage("Additional source verified. Choose the primary source to continue.");}}
  catch(error){if(ticket.current===id){setError(error instanceof Error?error.message:"Additional source could not be verified.");setMessage("");}}
  finally{if(ticket.current===id)setWorking(false);}
 };
 const restore=async()=>{
  if(!pending?.source||!verified)return;const id=++ticket.current;restoring.current=id;setWorking(true);setError("");setMessage("Saving recovered project…");
  try{await onRestore(pending.backup,pending.source,pending.mediaAssets);if(ticket.current===id){setPending(null);setVerified(false);setMessage("Recovered project saved and opened.");}}
  catch(error){if(ticket.current===id){setError(error instanceof Error?error.message:"Recovery could not finish. The open project is preserved.");setMessage("");}}
  finally{if(restoring.current===id)restoring.current=null;if(ticket.current===id)setWorking(false);}
 };
 return <details className="mt-3 rounded-lg border border-line p-3 text-xs text-ink-muted"><summary className="cursor-pointer py-1">Open project backup</summary>
 <p className="mt-2">Restore a .cutmark.json project with its matching source, or a .cutmark bundle containing the source. Recovery creates a separate project and preserves the one currently open.</p>
 <label className="mt-3 block">Project file<input aria-label="Project backup file" type="file" accept=".json,.cutmark" disabled={disabled||working} className="mt-2 block w-full" onChange={event=>{const file=event.target.files?.[0];if(file)void read(file);event.target.value="";}}/></label>
 {pending&&<div className="mt-3 space-y-2"><p className="text-ink">{pending.backup.title} · {pending.backup.decisions.captions.length} captions · {pending.backup.decisions.editorialMarkers?.length??0} editorial markers</p><p>Source: {pending.backup.source.fileName} · {(pending.backup.source.bytes/1024/1024).toFixed(2)} MB · {pending.backup.source.metadata.width} × {pending.backup.source.metadata.height}</p>
 <p>{pending.backup.source.kind==="saved-export"?"This legacy backup contains a saved export as its source; the original video cannot be recovered.":"Source contents must be verified before recovery."} Previous rendered MP4 files and session undo history are not included.</p>
 {!verified&&<label className="block">Relink source video<input aria-label="Relink source video" type="file" accept="video/*,.mp4,.mov,.webm,.mkv" disabled={disabled||working} className="mt-2 block w-full" onChange={event=>{const file=event.target.files?.[0];if(file)void relink(file);event.target.value="";}}/></label>}
 {additionalReferences(pending.backup).map(reference=><div key={reference.fingerprint}><p>{reference.fileName} · {(reference.bytes/1024/1024).toFixed(2)} MB · {pending.mediaAssets?.[reference.fingerprint]?"media selected":"missing source"}</p>{!verified&&<label className="block">Relink additional source<input aria-label={"Relink additional source "+reference.fileName} type="file" accept={reference.kind==="image"?"image/png,image/jpeg,image/webp":"video/*,.mp4,.mov,.webm,.mkv"} disabled={disabled||working} className="mt-2 w-full" onChange={event=>{const file=event.target.files?.[0];if(file)void relinkAdditional(reference,file);event.target.value="";}}/></label>}</div>)}
 <button type="button" disabled={disabled||working||!verified} onClick={()=>void restore()} className="timeline-tool">Restore verified project</button></div>}
 {message&&<p className="mt-2" role="status">{message}</p>}{error&&<p className="mt-2 text-rose-300" role="alert">{error}</p>}
 {(pending||working||error)&&<button type="button" onClick={discard} className="timeline-tool mt-2">{working?"Cancel backup import":"Discard backup import"}</button>}
 </details>;
}
