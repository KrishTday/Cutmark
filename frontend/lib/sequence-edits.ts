import type {SourceRange} from "./timing";
export function subtractInterval(ranges:SourceRange[],start:number,end:number,newId:()=>string):SourceRange[]{
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new Error("The removal interval is invalid.");
 return ranges.flatMap(range=>{
  if(end<=range.start||start>=range.end)return [range];
  const kept:SourceRange[]=[];
  if(start>range.start)kept.push({...range,end:start});
  if(end<range.end)kept.push({...range,id:kept.length?newId():range.id,start:end});
  return kept;
 });
}
export function silenceSuggestions(peaks:Float32Array,binSeconds:number,thresholdDb:number,minimum:number,padding:number,duration:number):{start:number;end:number}[]{
 const threshold=10**(thresholdDb/20),result:{start:number;end:number}[]=[];
 let beginning:number|null=null;
 for(let index=0;index<=peaks.length;index++){
  if(index<peaks.length&&peaks[index]<=threshold){if(beginning===null)beginning=index*binSeconds;continue;}
  if(beginning!==null){
   const end=Math.min(duration,index*binSeconds);
   if(end-beginning>=minimum&&end-beginning>2*padding)result.push({start:beginning+padding,end:end-padding});
   beginning=null;
  }
 }
 return result;
}
