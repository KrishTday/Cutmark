import {drawCaptions,type CaptionStyle} from "./caption-renderer";
import type {CaptionCue} from "./captions";
export interface TitleCue extends CaptionCue {style:CaptionStyle}
export function drawTitles(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,titles:TitleCue[],time:number,width:number,height:number){for(const title of titles)drawCaptions(ctx,[title],time,width,height,title.style);}
