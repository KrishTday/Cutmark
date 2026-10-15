export interface Framing {ratio:"original"|"16:9"|"9:16"|"1:1"|"4:5"|"custom";customWidth:number;customHeight:number;fit:"fit"|"fill";x:number;y:number;zoom:number;background:string;rotation:0|90|180|270;flipX:boolean;flipY:boolean}
export interface AudioAdjustments {gainDb:number;mute:boolean;fadeIn:number;fadeOut:number}
export const DEFAULT_FRAMING:Framing={ratio:"original",customWidth:16,customHeight:9,fit:"fit",x:50,y:50,zoom:1,background:"#000000",rotation:0,flipX:false,flipY:false};
export const DEFAULT_AUDIO:AudioAdjustments={gainDb:0,mute:false,fadeIn:0,fadeOut:0};
export function framingActive(f:Framing):boolean{return f.ratio!=="original"||f.fit!=="fit"||f.x!==50||f.y!==50||f.zoom!==1||f.background!=="#000000"||f.rotation!==0||f.flipX||f.flipY;}
export function audioActive(a:AudioAdjustments):boolean{return a.gainDb!==0||a.mute||a.fadeIn!==0||a.fadeOut!==0;}
export function framingSize(width:number,height:number,f:Framing,limit:number):{width:number;height:number}{
 const rotated=f.rotation===90||f.rotation===270,sw=rotated?height:width,sh=rotated?width:height;
 if(f.ratio==="original"){const scale=Math.min(1,limit/Math.max(sw,sh));return {width:scale===1?sw:Math.max(2,Math.round(sw*scale/2)*2),height:scale===1?sh:Math.max(2,Math.round(sh*scale/2)*2)};}
 const ratios={"16:9":16/9,"9:16":9/16,"1:1":1,"4:5":4/5,custom:f.customWidth/f.customHeight};
 const ratio=ratios[f.ratio],edge=Math.min(limit,Math.max(sw,sh));
 return {width:Math.max(2,Math.round((ratio>=1?edge:edge*ratio)/2)*2),height:Math.max(2,Math.round((ratio>=1?edge/ratio:edge)/2)*2)};
}
export function frameGeometry(sw:number,sh:number,width:number,height:number,f:Framing){
 if(f.rotation===90||f.rotation===270)[sw,sh]=[sh,sw];
 const scale=(f.fit==="fill"?Math.max(width/sw,height/sh):Math.min(width/sw,height/sh))*f.zoom;
 const w=Math.max(2,Math.round(sw*scale/2)*2),h=Math.max(2,Math.round(sh*scale/2)*2);
 return {width:w,height:h,x:Math.round((width-w)*f.x/100/2)*2,y:Math.round((height-h)*f.y/100/2)*2};
}
type Context=CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D;
export function drawFramed(ctx:Context,draw:(ctx:Context,x:number,y:number,w:number,h:number)=>void,sw:number,sh:number,width:number,height:number,f:Framing){
 const g=frameGeometry(sw,sh,width,height,f),rotated=f.rotation===90||f.rotation===270;
 ctx.save();ctx.fillStyle=f.background;ctx.fillRect(0,0,width,height);
 ctx.translate(g.x+g.width/2,g.y+g.height/2);ctx.rotate(f.rotation*Math.PI/180);ctx.scale(f.flipX?-1:1,f.flipY?-1:1);
 const w=rotated?g.height:g.width,h=rotated?g.width:g.height;
 draw(ctx,-w/2,-h/2,w,h);ctx.restore();
}
export function framingFilter(sw:number,sh:number,width:number,height:number,f:Framing):string{
 const steps:string[]=[];
 if(f.flipX)steps.push("hflip");if(f.flipY)steps.push("vflip");
 if(f.rotation===90)steps.push("transpose=clock");if(f.rotation===270)steps.push("transpose=cclock");if(f.rotation===180)steps.push("hflip","vflip");
 const g=frameGeometry(sw,sh,width,height,f);
 steps.push("scale="+g.width+":"+g.height,"pad="+Math.max(g.width,width)+":"+Math.max(g.height,height)+":"+Math.max(0,g.x)+":"+Math.max(0,g.y)+":color="+f.background.replace("#","0x"),"crop="+width+":"+height+":"+Math.max(0,-g.x)+":"+Math.max(0,-g.y),"setsar=1");
 return steps.join(",");
}
export function audioFilter(a:AudioAdjustments,duration:number):string{
 const steps=["volume="+(a.mute?0:10**(a.gainDb/20))];
 if(a.fadeIn>0)steps.push("afade=t=in:st=0:d="+Math.min(a.fadeIn,duration));
 if(a.fadeOut>0){const fade=Math.min(a.fadeOut,duration);steps.push("afade=t=out:st="+Math.max(0,duration-fade)+":d="+fade);}
 return steps.join(",");
}
