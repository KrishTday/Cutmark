"use client";
import {useCallback,useRef,useState,useSyncExternalStore} from "react";

interface UploadZoneProps {onFileSelected:(file:File)=>void;disabled?:boolean}
const ACCEPTED_TYPES=["video/mp4","video/quicktime","video/webm","video/x-matroska"];
const subscribeReady=()=>()=>{};
export default function UploadZone({onFileSelected,disabled=false}:UploadZoneProps){
 const ready=useSyncExternalStore(subscribeReady,()=>true,()=>false);
 const inputRef=useRef<HTMLInputElement>(null);
 const [dragging,setDragging]=useState(false),[error,setError]=useState("");
 const validate=useCallback((file:File|undefined)=>{
  if(!file||disabled||!ready)return;
  const extension=file.name.split(".").pop()?.toLowerCase();
  if(!ACCEPTED_TYPES.includes(file.type)&&!["mp4","mov","webm","mkv"].includes(extension??"")){setError("Choose an MP4, MOV, WebM, or MKV video. This file type is not supported.");return;}
  if(!file.size){setError("This file is empty. Choose a video with footage.");return;}
  setError("");onFileSelected(file);
 },[onFileSelected,disabled,ready]);
 return <div id="new-project" className={"home-import"+(dragging?" is-dragging":"")} onDragOver={event=>{event.preventDefault();if(!disabled)setDragging(true);}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragging(false);}} onDrop={event=>{event.preventDefault();setDragging(false);validate(event.dataTransfer.files[0]);}}>
  <div className="home-panel-heading"><span className="home-eyebrow">New project</span></div>
  <div className="home-import-body">
   <span className="home-import-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 15V4m0 0L8 8m4-4 4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
   <h2>Start with your footage.</h2>
   <p>Choose a video and find the parts worth keeping.</p>
   <button id="choose-video" type="button" disabled={disabled||!ready} onClick={()=>inputRef.current?.click()} className="home-primary">Choose video <span aria-hidden="true">↗</span></button>
   <p className="home-drop-hint">or drop a video here</p>
   <p className="home-formats">MP4 <span>·</span> MOV <span>·</span> WebM <span>·</span> MKV</p>
   <p className="home-compatibility">Playback and export depend on your browser and the video codec.</p>
   {ready&&<input ref={inputRef} aria-label="Source video file" type="file" tabIndex={-1} className="sr-only" disabled={disabled} accept={ACCEPTED_TYPES.join(",")+",.mp4,.mov,.webm,.mkv"} onChange={event=>{validate(event.target.files?.[0]);event.currentTarget.value="";}}/>}
  </div>
  {error&&<p role="alert" className="home-import-error">{error}</p>}
  <p className="home-import-trust"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="4" y="8" width="12" height="9" rx="2" stroke="currentColor"/><path d="M6.5 8V5a3.5 3.5 0 0 1 7 0v3" stroke="currentColor"/></svg>Your footage stays on this device. No account needed.</p>
 </div>;
}
