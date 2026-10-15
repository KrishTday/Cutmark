import {validateBackup} from "./portable-project";
import type {EditDecisions} from "./editable-project";
export type PresetSettings=Pick<EditDecisions,"captionStyle"|"captionDelivery"|"captionGuidance"|"exportPreferences"|"framing"|"audioAdjustments">;
export interface ProjectPreset {format:"cutmark-preset";version:1;id:string;name:string;settings:PresetSettings}
export function validatePreset(value:unknown):ProjectPreset{
 if(!value||typeof value!=="object")throw new Error("Invalid preset.");
 const p=value as ProjectPreset;
 if(p.format!=="cutmark-preset"||p.version!==1||typeof p.id!=="string"||!p.id||typeof p.name!=="string"||!p.name.trim()||p.name.length>100||!p.settings||typeof p.settings!=="object"||Object.keys(p.settings).some(key=>!["captionStyle","captionDelivery","captionGuidance","exportPreferences","framing","audioAdjustments"].includes(key)))throw new Error("This preset format is unavailable.");
 const checked=validateBackup({format:"cutmark-project",version:2,title:p.name,createdAt:0,updatedAt:0,source:{fileName:"preset",mime:"video/mp4",bytes:1,fingerprint:"0".repeat(64),algorithm:"sha256-chunks-4m-v1",kind:"original",metadata:{duration:1,width:2,height:2,hasAudio:false,hdr:false,frameRate:30,videoCodec:"avc",audioCodec:null}},decisions:{ranges:[{id:"preset",sourceId:"preset",start:0,end:1}],captions:[],sceneMarkers:[],scenesDetected:false,includeSceneDetection:false,...p.settings}});
 const settings:PresetSettings={};
 for(const key of ["captionStyle","captionDelivery","captionGuidance","exportPreferences","framing","audioAdjustments"] as const){if(checked.decisions[key]!==undefined)Object.assign(settings,{[key]:checked.decisions[key]});}
 return {format:"cutmark-preset",version:1,id:p.id,name:p.name,settings};
}
