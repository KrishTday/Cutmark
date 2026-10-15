import { isSubtitleInterval,type CaptionCue } from "./captions";
import { parseTime } from "./timing";
import { decodeSubtitleText } from "./subtitle-text";
export interface SubtitleIssue{block:number;kind:"error"|"warning";message:string}
export interface SubtitleImport {cues:CaptionCue[];issues:SubtitleIssue[]}
export function decodeSubtitleBytes(bytes:ArrayBuffer):string{
  const view=new Uint8Array(bytes);if(view.length>2*1024*1024)throw new Error("Subtitle files must be 2 MB or smaller.");
  const encoding=view[0]===0xff&&view[1]===0xfe?"utf-16le":view[0]===0xfe&&view[1]===0xff?"utf-16be":"utf-8";
  try{const text=new TextDecoder(encoding,{fatal:true}).decode(view);if(text.includes("\0"))throw new Error("NUL");return text.replace(/^\uFEFF/,"");}
  catch{throw new Error("The subtitle encoding could not be read. Save as UTF-8 or UTF-16 with a byte-order mark, then retry.");}
}
export function parseSubtitleImport(text:string,format:"srt"|"vtt"):SubtitleImport{
  const cues:CaptionCue[]=[],issues:SubtitleIssue[]=[];
  const normalized=text.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");
  if(format==="vtt"&&!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(normalized))issues.push({block:0,kind:"warning",message:"The VTT header is missing; review the decoded cues."});
  const blocks=normalized.split(/\n[ \t]*\n/);
  for(let index=0;index<blocks.length;index++){
    const lines=blocks[index].split("\n");if(!lines.some(line=>line.trim()))continue;
    if(/^NOTE(?:[ \t]|$)/.test(lines[0]))continue;
    if(/^WEBVTT(?:[ \t]|$)/.test(lines[0])){
      if(!lines.some(line=>line.includes("-->")))continue;
      issues.push({block:index+1,kind:"warning",message:"A blank line after the VTT header was missing."});lines.shift();
    }
    if(/^(STYLE|REGION)(?:[ \t]|$)/.test(lines[0])){issues.push({block:index+1,kind:"warning",message:"File styling or regions are not imported. Apply a Cutmark caption style after import."});continue;}
    const timing=lines.findIndex(line=>line.includes("-->"));
    if(timing<0){issues.push({block:index+1,kind:"error",message:"No cue timing found; this block cannot be imported."});continue;}
    const match=/^\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}[.,]\d{1,3})(?:[ \t]+(.*))?\s*$/.exec(lines[timing]);
    const start=match?parseTime(match[1].replace(",",".")):null,end=match?parseTime(match[2].replace(",",".")):null;
    if(start===null||end===null||!isSubtitleInterval(start,end)){issues.push({block:index+1,kind:"error",message:"Invalid cue interval; use ordered, finite millisecond timestamps."});continue;}
    if(match![3]?.trim())issues.push({block:index+1,kind:"warning",message:"Cue positioning settings are ignored; imported cues use the chosen project style."});
    let words=lines.slice(timing+1).join("\n").replace(/\n+$/,"");
    const markup=/<\/?(?:b|i|u|c(?:\.[^>]*)?|v(?:\s[^>]*)?|lang(?:\s[^>]*)?|font(?:\s[^>]*)?)>|<\d{2}:\d{2}(?::\d{2})?\.\d{3}>/gi;
    if(markup.test(words)){issues.push({block:index+1,kind:"warning",message:"Inline styling, speaker tags or word timestamps are converted to plain text."});words=words.replace(markup,"");}
    words=decodeSubtitleText(words);
    if(!words.trim()){issues.push({block:index+1,kind:"error",message:"Empty caption text; this block cannot be imported."});continue;}
    cues.push({id:cues.length+1,start,end,text:words});
    if(cues.length>5000)throw new Error("Import supports up to 5,000 cues. Split larger subtitle files before importing.");
  }
  return {cues,issues};
}
