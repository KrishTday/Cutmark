import {DEFAULT_FRAMING,DEFAULT_AUDIO,framingSize,framingActive,audioActive,type Framing,type AudioAdjustments} from "./adjustments";
export interface ExportPreferences {
  filePrefix?:string;fileSuffix?:string;
  resolution:"source"|"1080"|"720"|"480"; quality:"balanced"|"smaller"|"high"; audio:"keep"|"omit";
}
export const DEFAULT_EXPORT_PREFERENCES:ExportPreferences={resolution:"source",quality:"balanced",audio:"keep"};
export const EXPORT_PRESETS:Record<string,ExportPreferences>={
 source:DEFAULT_EXPORT_PREFERENCES,smaller:{resolution:"720",quality:"smaller",audio:"keep"},high:{resolution:"source",quality:"high",audio:"keep"},
};
export interface OutputSpec {width:number;height:number;audio:boolean;quality:ExportPreferences["quality"];bitrate:number;quantizer:number;crf:number;audioBitrate:number;resize:boolean;reencode:boolean;framing?:Framing;audioAdjustments?:AudioAdjustments;sourceWidth?:number;sourceHeight?:number}
export function outputSpec(width:number,height:number,hasAudio:boolean,preferences:ExportPreferences=DEFAULT_EXPORT_PREFERENCES,framing:Framing=DEFAULT_FRAMING,audioAdjustments:AudioAdjustments=DEFAULT_AUDIO):OutputSpec {
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw new Error("Source dimensions cannot produce this MP4 configuration.");
 const limit={source:Infinity,"1080":1920,"720":1280,"480":854}[preferences.resolution];
 const dimensions=framingSize(width,height,framing,limit),targetWidth=dimensions.width,targetHeight=dimensions.height;
 const policy={balanced:{factor:4,min:500000,max:20000000,quantizer:22,crf:23,audioBitrate:128000},smaller:{factor:1.4,min:150000,max:8000000,quantizer:30,crf:29,audioBitrate:96000},high:{factor:8,min:1000000,max:40000000,quantizer:14,crf:18,audioBitrate:192000}}[preferences.quality];
 const resize=targetWidth!==width||targetHeight!==height;
 return {width:targetWidth,height:targetHeight,audio:hasAudio&&preferences.audio==="keep",quality:preferences.quality,bitrate:Math.round(Math.max(policy.min,Math.min(policy.max,targetWidth*targetHeight*policy.factor))),quantizer:policy.quantizer,crf:policy.crf,audioBitrate:policy.audioBitrate,resize,framing:framingActive(framing)?framing:undefined,audioAdjustments:audioActive(audioAdjustments)?audioAdjustments:undefined,sourceWidth:width,sourceHeight:height,reencode:framingActive(framing)||(hasAudio&&audioActive(audioAdjustments))||resize||preferences.quality!=="balanced"||(hasAudio&&preferences.audio==="omit")};
}

export function outputFileName(stem:string,preferences:ExportPreferences):string{
 const part=(value:string,max:number)=>value.replace(/[<>:"/\\|?*\u0000-\u001f]/g,"-").trim().slice(0,max).replace(/[\uD800-\uDBFF]$/u,"");
 const base=part(stem,100)||"Cutmark-project",prefix=part(preferences.filePrefix??"",40),suffix=part(preferences.fileSuffix??"cutmark",40);
 const name=[prefix,base,suffix].filter(Boolean).join("-");return (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name)?"_":"")+name+".mp4";
}
