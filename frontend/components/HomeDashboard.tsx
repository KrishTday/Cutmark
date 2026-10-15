"use client";
import {useMemo,useState,type ReactNode} from "react";
import type {SavedProjectSummary} from "@/lib/project-history";
import {projectDuration,projectEditedAt,projectExportLabel,recentProjects} from "@/lib/home-projects";
import {formatTime} from "@/lib/timing";
import UploadZone from "./UploadZone";

export type HistoryState="loading"|"ready"|"unavailable";
interface Props {
 projects:SavedProjectSummary[];historyState:HistoryState;message:string;disabled:boolean;openingId:string|null;recovery:ReactNode;
 onFileSelected:(file:File)=>void;onOpen:(project:SavedProjectSummary)=>void;
 onDelete:(project:SavedProjectSummary,trigger:HTMLButtonElement)=>void;onRetry:()=>void;onCancel:()=>void;
}
function FilmIcon(){return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="5" y="9" width="30" height="22" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="m17 15 8 5-8 5V15Z" fill="currentColor"/><path d="M10 9v22M30 9v22" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 3"/></svg>;}
function editedDate(project:SavedProjectSummary){
 const time=projectEditedAt(project);
 return time?new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(time):"Date unavailable";
}
function WorkflowExample(){return <figure className="home-example" aria-labelledby="example-heading">
 <div className="home-panel-heading"><span className="home-eyebrow">From footage to finished</span><span className="home-example-label">Illustrated example</span></div>
 <div className="home-example-body">
  <div className="home-example-caption"><h2 id="example-heading">Keep the story.<br/><span>Lose the interruptions.</span></h2><span className="home-example-time">24s <span aria-hidden="true">→</span> 18s</span></div>
  <div className="home-timeline-label"><span>Source · 24 seconds</span><span>Keep the lavender sections</span></div>
  <div className="home-example-source" aria-hidden="true"><div className="home-take take-a">01</div><div className="home-removed"/><div className="home-take take-b">02</div><div className="home-removed short"/><div className="home-take take-c">03</div></div>
  <div className="home-example-ruler" aria-hidden="true"><span>0:00</span><span>0:06</span><span>0:12</span><span>0:18</span><span>0:24</span></div>
  <div className="home-example-join" aria-hidden="true">↓ <span>Close the gaps</span></div>
  <div className="home-timeline-label"><span>Your edit · 18 seconds</span><span>Three kept sections</span></div>
  <div className="home-example-output" aria-hidden="true"><div className="home-take take-a">01</div><div className="home-take take-b">02</div><div className="home-take take-c">03</div></div>
  <figcaption>Keep 0–6s, 10–18s and 20–24s. Cutmark joins them into an 18-second edit, while your original footage stays intact.</figcaption>
 </div>
 </figure>;}
function ProjectCard({project,featured,disabled,openingId,onOpen,onDelete}:Pick<Props,"disabled"|"openingId"|"onOpen"|"onDelete">&{project:SavedProjectSummary;featured?:boolean}){
 const title=project.title?.trim()||project.fileName||"Untitled project",duration=projectDuration(project),status=projectExportLabel(project);
 return <article className={"home-project"+(featured?" home-project-featured":"")} aria-label={title}>
  <div className="home-project-top"><span className="home-project-art" aria-hidden="true"><FilmIcon/></span><span className={"home-project-status"+(status==="Export up to date"?" is-current":"")}>{status}</span></div>
  <div className="home-project-info"><h3 title={title}>{title}</h3>
  {project.fileName&&project.fileName!==title&&<p className="home-project-source" title={project.fileName}>Source · {project.fileName}</p>}
  <div className="home-project-meta"><span>Edited {editedDate(project)}</span>{duration&&<span>{duration.label} · {formatTime(duration.seconds)}</span>}</div></div>
  <div className="home-project-actions"><button id={(featured?"project-resume-":"project-open-")+project.id} type="button" disabled={disabled} className={featured?"home-primary":"home-secondary"} onClick={()=>onOpen(project)} aria-label={"Open project: "+title}>{openingId===project.id?"Opening project…":featured?"Continue editing":"Open project"}<span aria-hidden="true">↗</span></button>
   <button type="button" disabled={disabled} className="home-project-delete" aria-label={"Delete "+title+" from recent projects"} title={"Delete "+title} onClick={event=>onDelete(project,event.currentTarget)}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 6h11m-9 0 .5 10h8l.5-10M8 6V3.5h4V6M8.5 9v4m3-4v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
  </div>
 </article>;
}
export default function HomeDashboard({projects,historyState,message,disabled,openingId,recovery,onFileSelected,onOpen,onDelete,onRetry,onCancel}:Props){
 const [query,setQuery]=useState("");
 const sorted=useMemo(()=>recentProjects(projects),[projects]),returning=sorted.length>0;
 const filtered=sorted.filter(project=>((project.title??"")+" "+(project.fileName??"")).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const remaining=query.trim()?filtered:sorted.slice(1);
 const projectProps={disabled,openingId,onOpen,onDelete};
 return <div className="home-dashboard" data-returning={returning}>
  <section className="home-intro" aria-labelledby="home-title"><div><p className="home-eyebrow">{returning?"Your editing desk":"A little less footage. A better story."}</p><h1 id="home-title">{returning?"Pick up where you left off.":<>Trim precisely.<br className="home-mobile-break"/> Keep the good parts.</>}</h1><p>{returning?"Your projects live in this browser. Continue an edit or start with new footage.":"Remove sections, correct captions, and make landscape or vertical versions. All in your browser."}</p></div><div className="home-intro-links">{returning&&<><button type="button" disabled={disabled} className="home-secondary" onClick={()=>document.getElementById("choose-video")?.click()}>New project</button><button type="button" className="home-backup-link" onClick={()=>{const panel=document.querySelector<HTMLDetailsElement>(".home-backup details");if(panel){panel.open=true;panel.querySelector("summary")?.focus();panel.scrollIntoView({block:"nearest"});}}}>Open backup</button></>}<a className="home-how-link" href="#how-it-works">How it works <span aria-hidden="true">↓</span></a></div></section>
  <div className="home-start-grid">
   <div className="home-start-new"><UploadZone disabled={disabled} onFileSelected={onFileSelected}/><div className="home-backup">{recovery}</div></div>
   <div className="home-start-context">
    {returning?<section className="home-resume" aria-labelledby="continue-heading"><div className="home-panel-heading"><h2 id="continue-heading" className="home-eyebrow">Continue editing</h2><span className="home-example-label">Last edited project</span></div><ProjectCard project={sorted[0]} featured {...projectProps}/><p className="home-resume-note">Your source and saved decisions reopen together.</p></section>:historyState==="loading"?<section className="home-loading" aria-label="Loading saved projects" aria-busy="true"><p role="status">Checking this browser for saved projects…</p><div/><div/><div/></section>:<WorkflowExample/>}
   </div>
  </div>
  {(message||openingId||historyState==="unavailable")&&<div className="home-notice" role={historyState==="unavailable"?"alert":"status"}><p>{openingId?"Opening saved source and editing decisions…":historyState==="unavailable"?"Saved projects could not be loaded. You can still choose a new video. "+message:message}</p>{openingId?<button type="button" className="home-secondary" onClick={onCancel}>Cancel opening</button>:historyState==="unavailable"?<button type="button" disabled={disabled} className="home-secondary" onClick={onRetry}>Retry saved projects</button>:null}</div>}
  <section className="home-library" aria-labelledby="projects-heading" aria-busy={historyState==="loading"}>
   <div className="home-library-heading"><div><h2 id="projects-heading">{returning?"Your projects":"Room for your next edit."}</h2><p>{returning?"Saved on this browser · newest edits first":"Saved projects will appear here after you start editing."}</p></div>{(sorted.length>=5||query.trim())&&<label className="home-search">Find a project<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Title or source filename"/></label>}</div>
   {historyState==="loading"?<p className="home-empty">Loading your local project list…</p>:returning?<>{remaining.length>0?<div className="home-project-grid">{remaining.map(project=><ProjectCard key={project.id} project={project} {...projectProps}/>)}</div>:query.trim()?<p className="home-empty" role="status">No projects match “{query}”. Try another title or filename.</p>:<p className="home-empty">Your latest project is ready above. Start another edit whenever you need it.</p>}{query.trim()&&<p className="home-search-count" role="status">{filtered.length} matching {filtered.length===1?"project":"projects"}</p>}</>:historyState==="unavailable"?<p className="home-empty">Your existing browser data has not been deleted. Retry when local storage is available.</p>:<p className="home-empty">Choose a video to create your first project. No sign-up or upload step.</p>}
  </section>
  <section id="how-it-works" className="home-workflow" aria-labelledby="workflow-heading"><div className="home-workflow-intro"><p className="home-eyebrow">A focused workflow</p><h2 id="workflow-heading">From first cut<br/>to final version.</h2></div><ol><li><span className="home-step">01</span><h3>Keep what matters.</h3><p>Trim precisely, remove unwanted sections, and join the parts you want.</p></li><li><span className="home-step">02</span><h3>Make it yours.</h3><p>Correct captions, adjust audio, and reframe for landscape, square or vertical.</p></li><li><span className="home-step">03</span><h3>Deliver your edit.</h3><p>Export a reviewed MP4 or several named clips. Save a backup to keep editing later.</p></li></ol></section>
  <details className="home-storage"><summary>Local editing. A few things to know.</summary><div><p>Your source footage is processed on this device and is not uploaded to an application server. No account is required for local editing.</p><p>Projects are saved in this browser; another browser or device will not automatically have them. Browser data can be cleared or evicted. Download a portable project backup to keep an independent copy.</p><p>The app’s files need an initial download. Optional English transcription downloads a speech model on first use; valid cached model files are reused.</p><a href="/privacy/index.html">Read the privacy details <span aria-hidden="true">↗</span></a></div></details>
 </div>;
}
