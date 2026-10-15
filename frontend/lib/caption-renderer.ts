import type { CaptionCue } from "./captions";
export type CaptionDelivery = "sidecar" | "burned" | "both";
export interface CaptionStyle {
  font:"sans"|"mono"; bold:boolean; size:number; color:string; outline:number; outlineColor:string;
  shadow:boolean; background:"none"|"plate"; backgroundColor:string; backgroundOpacity:number;
  align:"left"|"center"|"right"; position:"top"|"middle"|"bottom"; margin:number;
}
export const DEFAULT_CAPTION_STYLE:CaptionStyle={font:"sans",bold:false,size:5,color:"#ffffff",outline:3,outlineColor:"#000000",shadow:true,background:"none",backgroundColor:"#000000",backgroundOpacity:.75,align:"center",position:"bottom",margin:7};
export const CAPTION_PRESETS:Record<string,CaptionStyle>={
  clean:DEFAULT_CAPTION_STYLE,
  social:{...DEFAULT_CAPTION_STYLE,bold:true,size:7,outline:5,shadow:false,margin:10},
  contrast:{...DEFAULT_CAPTION_STYLE,size:6,background:"plate",backgroundOpacity:.85,outline:0,shadow:false},
};
const families={sans:"Cutmark Geist",mono:"Cutmark Mono"};
const loaded=new Map<string,Promise<void>>();
export function loadCaptionFont(font:CaptionStyle["font"]):Promise<void>{
  const existing=loaded.get(font);if(existing)return existing;
  const job=(async()=>{
    const scope=globalThis as unknown as {fonts?:FontFaceSet;document?:Document};
    const set=scope.document?.fonts??scope.fonts;
    if(!set || typeof FontFace==="undefined")throw new Error("This browser cannot load fonts for styled captions. Use subtitle files or native caption preview.");
    const face=new FontFace(families[font],'url("/fonts/'+(font==="mono"?"geist-mono-latin":"geist-latin")+'.woff2")',{weight:"100 900"});
    await face.load();set.add(face);
  })().catch(error=>{loaded.delete(font);throw new Error("The caption font could not load. Retry with the local font files available, or choose subtitle-file delivery. "+(error instanceof Error?error.message:""))});
  loaded.set(font,job);return job;
}
type Context=CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D;
function graphemes(text:string):string[]{return typeof Intl.Segmenter==="function"?[...new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(text)].map(part=>part.segment):[...text];}
export function wrapCaption(text:string,width:number,measure:(text:string)=>number):string[]{
  const lines:string[]=[];
  for(const paragraph of text.replace(/\r\n?/g,"\n").split("\n")){
    let line="";
    for(const token of paragraph.match(/\s+|\S+/gu)??[]){
      if(/^\s+$/u.test(token)){line+=token;continue;}
      if(line.trim() && measure(line+token)>width){lines.push(line.trimEnd());line="";}
      if(measure(token)<=width){line+=token;continue;}
      for(const glyph of graphemes(token)){
        if(line && measure(line+glyph)>width){lines.push(line.trimEnd());line="";}
        if(measure(glyph)>width)throw new Error("A caption glyph is wider than the safe frame area. Reduce the text size or edge margin.");
        line+=glyph;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
export function captionLayout(context:Context,text:string,width:number,height:number,style:CaptionStyle){
  const fontSize=Math.min(width,height)*style.size/100, lineHeight=fontSize*1.25;
  const border=fontSize*style.outline/100, pad=style.background==="plate"?fontSize*.3:border+fontSize*.15;
  const marginX=width*style.margin/100,marginY=height*style.margin/100;
  context.font=(style.bold?"700 ":"400 ")+fontSize+'px "'+families[style.font]+'", sans-serif';
  const lines=wrapCaption(text,width-marginX*2-pad*2,value=>context.measureText(value).width);
  const boxHeight=lines.length*lineHeight+pad*2;
  if(boxHeight>height-marginY*2)throw new Error("This caption does not fit inside the frame. Split the cue, reduce text size, or reduce the edge margin.");
  const textWidth=Math.max(0,...lines.map(line=>context.measureText(line).width));
  const boxWidth=textWidth+pad*2;
  const x=style.align==="left"?marginX:style.align==="right"?width-marginX-boxWidth:(width-boxWidth)/2;
  const y=style.position==="top"?marginY:style.position==="middle"?(height-boxHeight)/2:height-marginY-boxHeight;
  return {lines,fontSize,lineHeight,border,pad,x,y,boxWidth,boxHeight};
}
export function drawCaptions(context:Context,cues:CaptionCue[],time:number,width:number,height:number,style:CaptionStyle):void {
  const text=cues.filter(cue=>time>=cue.start&&time<cue.end&&cue.text.trim()).sort((a,b)=>a.start-b.start).map(cue=>cue.text).join("\n");
  if(!text)return;
  context.save();
  try{
    const layout=captionLayout(context,text,width,height,style);
    if(style.background==="plate"){context.globalAlpha=style.backgroundOpacity;context.fillStyle=style.backgroundColor;context.fillRect(layout.x,layout.y,layout.boxWidth,layout.boxHeight);context.globalAlpha=1;}
    context.textBaseline="middle";context.textAlign=style.align;context.fillStyle=style.color;context.strokeStyle=style.outlineColor;context.lineWidth=layout.border*2;context.lineJoin="round";
    const anchor=style.align==="left"?layout.x+layout.pad:style.align==="right"?layout.x+layout.boxWidth-layout.pad:layout.x+layout.boxWidth/2;
    for(let index=0;index<layout.lines.length;index++){
      const y=layout.y+layout.pad+layout.lineHeight*(index+.5);
      if(style.shadow){context.shadowColor="#000000";context.shadowBlur=layout.fontSize*.12;context.shadowOffsetY=layout.fontSize*.06;}
      if(layout.border>0)context.strokeText(layout.lines[index],anchor,y);
      context.fillText(layout.lines[index],anchor,y);
    }
  }finally{context.restore();}
}
