"use client";
import {useRef,useState} from "react";
export default function CommitSlider({label,value,min,max,step=1,onCommit}:{label:string;value:number;min:number;max:number;step?:number;onCommit:(value:number)=>void}){
 const [draft,setDraft]=useState<number|null>(null),dragRef=useRef(false);
 return <input aria-label={label} type="range" min={min} max={max} step={step} value={draft??value} onPointerDown={event=>{dragRef.current=true;event.currentTarget.setPointerCapture(event.pointerId);setDraft(value);}}
 onChange={event=>{const value=Number(event.target.value);if(dragRef.current)setDraft(value);else onCommit(value);}}
 onPointerUp={event=>{if(dragRef.current){dragRef.current=false;onCommit(Number(event.currentTarget.value));setDraft(null);event.currentTarget.releasePointerCapture(event.pointerId);}}}
 onPointerCancel={()=>{dragRef.current=false;setDraft(null);}} className="mt-2 min-h-10 w-full"/>;
}
