import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.CUTMARK_PLAYWRIGHT_PATH||"playwright");
const root=process.env.CUTMARK_ARTIFACTS,dir=path.join(root,"sequences");fs.mkdirSync(dir,{recursive:true});
const fixture=path.join(root,"boundary.mp4");
const ff=(args)=>execFileSync("ffmpeg",["-v","error",...args],{maxBuffer:32*1024*1024});
const browser=await chromium.launch({channel:"msedge",headless:true}),page=await browser.newPage({viewport:{width:1366,height:900},acceptDownloads:true});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
const url=process.env.CUTMARK_TEST_URL||"http://127.0.0.1:4174";
async function fill(label,text){const field=page.getByLabel(label,{exact:true});await field.fill(text);await field.press("Tab");}
async function exported(name){await page.getByRole("button",{name:/Export (video|latest changes)/}).click();await page.getByRole("button",{name:"Export video",exact:true}).waitFor({timeout:120000});const bytes=await page.getByRole("link",{name:"MP4",exact:true}).evaluate(async e=>Array.from(new Uint8Array(await(await fetch(e.href)).arrayBuffer())));const file=path.join(dir,name);fs.writeFileSync(file,Buffer.from(bytes));return file;}
function probe(file){return JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",file],{encoding:"utf8"}));}
function color(file,time){return [...ff(["-ss",String(time),"-i",file,"-vf","scale=1:1","-frames:v","1","-pix_fmt","rgb24","-f","rawvideo","-"])];}
function rms(file,start,duration){const bytes=ff(["-ss",String(start),"-i",file,"-t",String(duration),"-vn","-ac","1","-ar","48000","-f","f32le","-"]);let sum=0;for(let i=0;i<bytes.length;i+=4)sum+=bytes.readFloatLE(i)**2;return Math.sqrt(sum/(bytes.length/4));}
try{
 await page.goto(url);await page.getByLabel("Source video file",{exact:true}).setInputFiles(fixture);await page.getByRole("button",{name:"Export video",exact:true}).waitFor();
 await fill("Clip in time","0");await fill("Clip out time","1");
 await page.locator("summary").filter({hasText:/^Kept ranges/}).click();await page.getByRole("button",{name:"Add kept range",exact:true}).click();
 await fill("Range 2 end","4");await fill("Range 2 start","3");await page.getByLabel("Move range 2 earlier",{exact:true}).click();
 await page.getByRole("button",{name:"Add caption",exact:true}).click();await fill("Caption 1 start time","0.2");await fill("Caption 1 end time","3.8");await page.getByLabel("Caption 1 text",{exact:true}).fill("Across the joins café");
 const out=await exported("reordered.mp4"),p=probe(out);
 assert.ok(Math.abs(Number(p.format.duration)-2)<.1,JSON.stringify(p.format));
 const first=color(out,.2),last=color(out,1.2);assert.ok(first[0]>150&&first[1]>150&&first[2]<60,"yellow first "+first);assert.ok(last[0]>150&&last[1]<60&&last[2]<60,"red second "+last);
 const vtt=decodeURIComponent((await page.getByRole("link",{name:"Current subtitles (.vtt)",exact:true}).getAttribute("href")).split(",")[1]);assert.match(vtt,/00:00:00.000 --> 00:00:00.800/);assert.match(vtt,/00:00:01.200 --> 00:00:02.000/);
 assert.ok(rms(out,.98,.04)>.04,"audio remains audible through the join");
 await page.getByRole("button",{name:"Render sequence preview",exact:true}).click();await page.getByLabel("Rendered sequence preview",{exact:true}).waitFor({timeout:120000});
 await page.getByText("Saved in this browser",{exact:true}).first().waitFor();await page.reload();await page.getByRole("button",{name:"Open project",exact:true}).click();await page.getByRole("button",{name:"Export video",exact:true}).waitFor();await page.locator("summary").filter({hasText:/^Kept ranges/}).click();assert.equal(await page.getByLabel("Range 1 start",{exact:true}).inputValue(),"00:00:03.000");assert.equal(await page.getByLabel("Range 2 start",{exact:true}).inputValue(),"00:00:00.000");
 console.log("PASS reordered joins, audio continuity, split captions, rendered preview and reopen");
 await page.locator("summary").filter({hasText:/^Framing and audio/}).click();
 await page.getByLabel("Output aspect ratio",{exact:true}).selectOption("9:16");await page.getByLabel("Fit or fill",{exact:true}).selectOption("fill");
 await page.getByLabel("Exported gain",{exact:true}).fill("-6");await fill("Export fade in","0.4");await fill("Export fade out","0.4");
 const adjusted=await exported("vertical-gain-fades.mp4"),q=probe(adjusted),video=q.streams.find(s=>s.codec_type==="video");
 assert.equal(video.width,180);assert.equal(video.height,320);const ratio=rms(adjusted,.55,.2)/rms(out,.55,.2);assert.ok(ratio>.45&&ratio<.55,"gain "+ratio);assert.ok(rms(adjusted,0,.05)<rms(adjusted,.55,.05)*.2);assert.ok(rms(adjusted,1.95,.03)<rms(adjusted,.55,.05)*.25);
 const originalHref=await page.getByRole("link",{name:"MP4",exact:true}).getAttribute("href");await page.getByRole("button",{name:/^Undo/}).click();assert.equal(await page.getByRole("link",{name:"MP4",exact:true}).getAttribute("href"),originalHref);
 await page.getByText("Export and storage details",{exact:true}).click();await page.getByText("Project name and backups",{exact:true}).click();const download=page.waitForEvent("download");await page.getByRole("button",{name:"Download backup with source",exact:true}).click();const dl=await download,bundle=path.join(dir,"sequence.cutmark");await dl.saveAs(bundle);
 const data=fs.readFileSync(bundle),manifest=JSON.parse(data.subarray(12,12+data.readUInt32LE(8)).toString("utf8"));assert.equal(manifest.version,2);assert.equal(manifest.decisions.ranges.length,2);assert.equal(manifest.decisions.framing.ratio,"9:16");assert.equal(manifest.decisions.audioAdjustments.gainDb,-6);
 console.log("PASS vertical dimensions, actual -6dB gain/fades, prior output safety and v2 source bundle");
 await page.locator("summary").filter({hasText:/^Named clips and export queue/}).click();
 await page.getByRole("button",{name:"Add selected range as clip",exact:true}).click();
 await page.getByRole("button",{name:"Edit range 2",exact:true}).click();
 await page.getByRole("button",{name:"Add selected range as clip",exact:true}).click();
 await page.getByLabel("Clip 2 quality",{exact:true}).selectOption("smaller");
 await page.getByRole("button",{name:"Export selected clips",exact:true}).click();
 await page.getByRole("button",{name:"Export selected clips",exact:true}).waitFor({state:"visible"});await page.getByRole("link",{name:"Download Clip 2 MP4",exact:true}).waitFor({timeout:120000});
 for(const name of ["Clip 1","Clip 2"]){const link=page.getByRole("link",{name:"Download "+name+" MP4",exact:true}),bytes=await link.evaluate(async e=>Array.from(new Uint8Array(await(await fetch(e.href)).arrayBuffer()))),file=path.join(dir,name+".mp4");fs.writeFileSync(file,Buffer.from(bytes));assert.ok(Math.abs(Number(probe(file).format.duration)-1)<.1);}
 assert.ok(await page.getByRole("img",{name:/Source frame for Clip 1/}).count());
 const earlierClip=await page.getByRole("link",{name:"Download Clip 1 MP4",exact:true}).getAttribute("href");
 await fill("Clip 1 start","3.9");await page.getByText("Caption style and delivery",{exact:true}).click();await page.getByLabel("Caption delivery",{exact:true}).selectOption("both");
 await page.getByRole("button",{name:"Export selected clips",exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll("button")].find(e=>e.textContent==="Export selected clips")?.disabled,{timeout:120000});
 await page.getByRole("status").filter({hasText:/failed.*No deliverable captions/}).waitFor();assert.equal(await page.getByRole("link",{name:"Download Clip 1 MP4",exact:true}).getAttribute("href"),earlierClip);assert.ok(await page.getByRole("status").filter({hasText:/complete.*Playable output verified/}).count());
 await page.getByLabel("Caption delivery",{exact:true}).selectOption("sidecar");await fill("Clip 1 start","3");
 await page.evaluate(()=>{const Original=window.Worker;window.Worker=class extends Original{timers=new Set();postMessage(data,transfer){if(data&&typeof data==="object"&&("trimStart"in data||"ranges"in data)){const timer=setTimeout(()=>{this.timers.delete(timer);super.postMessage(data,transfer);},400);this.timers.add(timer);}else super.postMessage(data,transfer);}terminate(){for(const timer of this.timers)clearTimeout(timer);this.timers.clear();return super.terminate();}};});
 await page.getByRole("button",{name:"Export selected clips",exact:true}).click();await page.getByRole("button",{name:"Cancel current clip",exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll("button")].find(e=>e.textContent==="Export selected clips")?.disabled,{timeout:120000});assert.ok(await page.getByRole("status").filter({hasText:/cancelled/}).count());assert.ok(await page.getByRole("status").filter({hasText:/complete.*Playable output verified/}).count());assert.equal(await page.getByRole("link",{name:"Download Clip 1 MP4",exact:true}).getAttribute("href"),earlierClip);
 console.log("PASS failed/cancelled clip preserves its earlier download while later jobs continue");
 await page.getByText("Saved in this browser",{exact:true}).first().waitFor();
 await page.getByText("Reusable output presets",{exact:true}).click();await page.getByLabel("New preset name",{exact:true}).fill("Vertical speech");await page.getByRole("button",{name:"Save current output preset",exact:true}).click();await page.getByRole("button",{name:"Reset framing",exact:true}).click();await page.getByRole("button",{name:"Apply Vertical speech",exact:true}).click();assert.equal(await page.getByLabel("Output aspect ratio",{exact:true}).inputValue(),"9:16");
 await page.getByText("Frame capture and edit report",{exact:true}).click();const frameDownload=page.waitForEvent("download");await page.getByRole("button",{name:"Capture composed frame",exact:true}).click();const frame=await frameDownload;await frame.saveAs(path.join(dir,"composed.png"));assert.ok(fs.statSync(path.join(dir,"composed.png")).size>100);
 const report=JSON.parse(decodeURIComponent((await page.getByRole("link",{name:"Download edit report",exact:true}).getAttribute("href")).split(",")[1]));assert.equal(report.ranges.length,2);assert.equal(report.clips.length,2);
 console.log("PASS real two-clip queue, decoded thumbnails, reusable preset, composed frame and edit report");
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.screenshot({path:path.join(dir,"mobile.png"),fullPage:true});assert.deepEqual(errors,[]);
}finally{await browser.close();}
