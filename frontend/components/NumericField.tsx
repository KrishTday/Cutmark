"use client";
import {useRef,useState} from "react";
export default function NumericField({value,label,min,max,disabled,integer=false,onCommit}:{value:number;label:string;min:number;max:number;disabled?:boolean;integer?:boolean;onCommit:(value:number)=>void}){
 const [draft,setDraft]=useState({value,text:String(value),error:""}),cancelRef=useRef(false);
 if(draft.value!==value)setDraft({value,text:String(value),error:""});
 const text=draft.value===value?draft.text:String(value),error=draft.value===value?draft.error:"";
 const commit=()=>{const parsed=Number(text.trim());if(!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text.trim())||!Number.isFinite(parsed)||parsed<min||parsed>max||(integer&&!Number.isInteger(parsed))){setDraft({value,text,error:"Enter "+(integer?"a whole number":"a number")+" from "+min+" to "+max+"."});return;}onCommit(parsed);setDraft({value:parsed,text:String(parsed),error:""});};
 return <span className="mt-1 block min-w-0"><input aria-label={label} aria-invalid={Boolean(error)} type="text" inputMode={min<0?"text":integer?"numeric":"decimal"} value={text} disabled={disabled} onChange={event=>setDraft({value,text:event.target.value,error:""})} onBlur={()=>{if(cancelRef.current){cancelRef.current=false;return;}commit();}} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();if(event.key==="Escape"){cancelRef.current=true;setDraft({value,text:String(value),error:""});event.currentTarget.blur();}}} className="min-h-10 w-full min-w-0 rounded border border-line bg-well px-2 text-ink"/>{error&&<span role="alert" className="mt-1 block text-rose-300">{error}</span>}</span>;
}
