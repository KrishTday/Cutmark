import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.CUTMARK_PLAYWRIGHT_PATH||"playwright");
const root=process.env.CUTMARK_ARTIFACTS,dir=path.join(root,"join-precision");fs.mkdirSync(dir,{recursive:true});const fixture=path.join(dir,"vfr-counter.mp4");
execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","nullsrc=s=64x64:r=10:d=2","-vf","geq=lum='16+N*10':cb=128:cr=128,select='eq(n,0)+eq(n,2)+eq(n,3)+eq(n,6)+gte(n,9)'","-fps_mode","vfr","-c:v","libx264","-crf","0","-pix_fmt","yuv420p",fixture]);
const browser=await chromium.launch({channel:"msedge",headless:true}),page=await browser.newPage({viewport:{width:1366,height:900},acceptDownloads:true}),errors=[];page.on("pageerror",e=>errors.push(e.message));const url=process.env.CUTMARK_TEST_URL||"http://127.0.0.1:4174";
async function field(label,value){const e=page.getByLabel(label,{exact:true});await e.fill(value);await e.press("Tab");}
async function exported(name){await page.getByRole("button",{name:/Export (video|latest changes)/}).click();await page.getByRole("button",{name:"Export video",exact:true}).waitFor({timeout:120000});const bytes=await page.getByRole("link",{name:"MP4",exact:true}).evaluate(async e=>Array.from(new Uint8Array(await(await fetch(e.href)).arrayBuffer()))),file=path.join(dir,name);fs.writeFileSync(file,Buffer.from(bytes));return file;}
function gray(file,time){return execFileSync("ffmpeg",["-v","error","-ss",String(time),"-i",file,"-frames:v","1","-vf","scale=1:1","-pix_fmt","rgb24","-f","rawvideo","-"])[0];}
function inspect(file){return JSON.parse(execFileSync("ffprobe",["-v","error","-select_streams","v:0","-show_frames","-show_streams","-show_format","-of","json",file],{encoding:"utf8",maxBuffer:16*1024*1024}));}
try{
 await page.goto(url);await page.getByLabel("Source video file",{exact:true}).setInputFiles(fixture);await page.getByRole("button",{name:"Export video",exact:true}).waitFor();await field("Clip in time","0.25");await field("Clip out time","0.65");
 await page.getByText("Export and storage details",{exact:true}).click();await page.getByText("Project name and backups",{exact:true}).click();const pending=page.waitForEvent("download");await page.getByRole("button",{name:"Download project file",exact:true}).click();const download=await pending,light=path.join(dir,"source.json");await download.saveAs(light);const manifest=JSON.parse(fs.readFileSync(light,"utf8"));
 manifest.version=2;manifest.decisions.ranges=Array.from({length:100},(_,i)=>({...manifest.decisions.ranges[0],id:"range-"+i,start:.25,end:.65}));const many=path.join(dir,"100-ranges.json");fs.writeFileSync(many,JSON.stringify(manifest));
 await page.getByText("Open project backup",{exact:true}).click();await page.getByLabel("Project backup file",{exact:true}).setInputFiles(many);await page.getByLabel("Relink source video",{exact:true}).setInputFiles(fixture);await page.getByRole("button",{name:"Restore verified project",exact:true}).click();await page.getByRole("button",{name:"Export video",exact:true}).waitFor();
 for(const compatible of [false,true]){
  const details=page.getByText("Export and storage details",{exact:true});if(!(await details.evaluate(e=>e.parentElement.open)))await details.click();await page.getByLabel("Use compatible processor for the next export",{exact:true}).setChecked(compatible);
  const file=await exported(compatible?"compatible.mp4":"native.mp4"),metadata=inspect(file);assert.ok(Math.abs(Number(metadata.format.duration)-40)<.002,metadata.format.duration);assert.equal(metadata.frames.length,300,"three retained frame intervals per range");
  for(const join of [0,1,50,99]){const f=metadata.frames[join*3];assert.ok(Math.abs(Number(f.best_effort_timestamp_time)-join*.4)<.00001,"no accumulated drift at "+join);}
  assert.ok(Math.abs(gray(file,0)-gray(fixture,.2))<6,"the containing frame at the in point is retained");assert.ok(Math.abs(gray(file,Number(metadata.frames[2].best_effort_timestamp_time))-gray(fixture,.6))<6,"the last included frame is retained");
 }
 const pulse=path.join(dir,"vfr-pulses.mp4");execFileSync("ffmpeg",["-v","error","-y","-i",fixture,"-f","lavfi","-i","aevalsrc='if(between(t,0.3,0.4),0.2*sin(2*PI*440*t),0)':s=44100:d=2","-map","0:v","-map","1:a","-c:v","copy","-c:a","aac",pulse]);
 await page.getByRole("button",{name:"New video",exact:true}).click();await page.getByLabel("Source video file",{exact:true}).setInputFiles(pulse);await page.getByRole("button",{name:"Export video",exact:true}).waitFor();await field("Clip in time","0.25");await field("Clip out time","0.65");
 await page.getByText("Export and storage details",{exact:true}).click();await page.getByText("Project name and backups",{exact:true}).click();const pendingAudio=page.waitForEvent("download");await page.getByRole("button",{name:"Download project file",exact:true}).click();const audioDownload=await pendingAudio,audioLight=path.join(dir,"audio-source.json");await audioDownload.saveAs(audioLight);const audioManifest=JSON.parse(fs.readFileSync(audioLight,"utf8"));audioManifest.version=2;audioManifest.decisions.ranges=Array.from({length:100},(_,i)=>({...audioManifest.decisions.ranges[0],id:"pulse-range-"+i,start:.25,end:.65}));const audioMany=path.join(dir,"100-audio-ranges.json");fs.writeFileSync(audioMany,JSON.stringify(audioManifest));
 await page.getByText("Open project backup",{exact:true}).click();await page.getByLabel("Project backup file",{exact:true}).setInputFiles(audioMany);await page.getByLabel("Relink source video",{exact:true}).setInputFiles(pulse);await page.getByRole("button",{name:"Restore verified project",exact:true}).click();await page.getByRole("button",{name:"Export video",exact:true}).waitFor();
 for(const compatible of [false,true]){
  const details=page.getByText("Export and storage details",{exact:true});if(!(await details.evaluate(e=>e.parentElement.open)))await details.click();await page.getByLabel("Use compatible processor for the next export",{exact:true}).setChecked(compatible);
  const file=await exported(compatible?"compatible-pulses.mp4":"native-pulses.mp4"),metadata=inspect(file);assert.ok(Math.abs(Number(metadata.streams[0].duration)-40)<.002);
  const pcm=execFileSync("ffmpeg",["-v","error","-i",file,"-vn","-ac","1","-ar","48000","-f","f32le","-"],{maxBuffer:16*1024*1024});
  const rms=(time,length)=>{let sum=0,n=0;for(let frame=Math.round(time*48000);frame<Math.round((time+length)*48000)&&frame*4+4<=pcm.length;frame++){sum+=pcm.readFloatLE(frame*4)**2;n++;}return Math.sqrt(sum/n);};
  for(const index of [0,1,50,99]){assert.ok(rms(index*.4+.01,.02)<.005,"silence before pulse at join "+index);assert.ok(rms(index*.4+.08,.04)>.05,"pulse remains aligned at join "+index);assert.ok(rms(index*.4+.23,.03)<.005,"silence after pulse at join "+index);}
 }
 console.log("PASS continuous 44.1-to-48kHz audio: known pulses remain aligned after 100 joins in both processing paths");
 assert.deepEqual(errors,[]);console.log("PASS 100 off-grid VFR ranges: exact 40s, 300 intended frames, correct first/last pixels and no cumulative join drift in both processing paths");
}finally{await browser.close();}
