import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.CUTMARK_PLAYWRIGHT_PATH||"playwright");
const root=process.env.CUTMARK_ARTIFACTS,dir=path.join(root,"assembly");fs.mkdirSync(dir,{recursive:true});
const primary=path.join(root,"boundary.mp4"),secondary=path.join(dir,"portrait-no-audio.mp4");
execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","color=c=purple:s=90x160:r=24:d=1.5","-c:v","libx264","-pix_fmt","yuv420p",secondary]);
const browser=await chromium.launch({channel:"msedge",headless:true}),context=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[];
page.on("pageerror",e=>errors.push(e.message));const url=process.env.CUTMARK_TEST_URL||"http://127.0.0.1:4174";
async function field(page,label,value){const e=page.getByLabel(label,{exact:true});await e.fill(value);await e.press("Tab");}
async function save(page){await page.getByText("Saved in this browser",{exact:true}).first().waitFor({timeout:20000});}
async function exportVideo(page,name){await page.getByRole("button",{name:/Export (video|latest changes)/}).click();await page.getByRole("button",{name:"Export video",exact:true}).waitFor({timeout:120000});const link=page.getByRole("link",{name:"MP4",exact:true});const bytes=await link.evaluate(async e=>Array.from(new Uint8Array(await(await fetch(e.href)).arrayBuffer())));const file=path.join(dir,name);fs.writeFileSync(file,Buffer.from(bytes));return file;}
function probe(file){return JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",file],{encoding:"utf8"}));}
function pixel(file,time){return execFileSync("ffmpeg",["-v","error","-ss",String(time),"-i",file,"-frames:v","1","-vf","crop=2:2:iw/2:ih/2","-pix_fmt","rgb24","-f","rawvideo","-"]);}
function rms(file,time){const a=execFileSync("ffmpeg",["-v","error","-ss",String(time),"-i",file,"-t","0.2","-vn","-ac","1","-ar","48000","-f","f32le","-"]);let sum=0;for(let i=0;i<a.length;i+=4)sum+=a.readFloatLE(i)**2;return Math.sqrt(sum/(a.length/4));}
async function openRecovery(page,file){await page.locator("summary").filter({hasText:/^Open project backup$/}).click();await page.getByLabel("Project backup file",{exact:true}).setInputFiles(file);}
async function fresh(){const c=await browser.newContext({acceptDownloads:true});const p=await c.newPage();p.on("pageerror",e=>errors.push(e.message));await p.goto(url);return p;}
try{
 await page.goto(url);await page.getByLabel("Source video file",{exact:true}).setInputFiles(primary);await page.getByRole("button",{name:"Export video",exact:true}).waitFor();await field(page,"Clip in time","1");await field(page,"Clip out time","2");
 await page.getByRole("button",{name:"Add caption",exact:true}).click();await field(page,"Caption 1 start time","1.2");await field(page,"Caption 1 end time","1.8");await page.getByLabel("Caption 1 text",{exact:true}).fill("Primary café");
 await page.locator("summary").filter({hasText:/^Multiple-source assembly/}).click();await page.getByRole("button",{name:"Add primary selection to assembly",exact:true}).click();await page.getByRole("button",{name:"Add primary selection to assembly",exact:true}).waitFor({state:"visible"});await page.getByText("boundary.mp4 · 320 × 180 · 00:00:04.000 · audio",{exact:true}).waitFor({timeout:20000});
 await page.locator(".workspace-captions").getByLabel("Caption 1 text",{exact:true}).fill("Primary corrected café");
 await page.getByLabel("Assembly source video file",{exact:true}).setInputFiles(secondary);await page.getByLabel("Assembly range 2 start",{exact:true}).waitFor({timeout:20000});
 const panel=page.locator("details").filter({has:page.locator("summary").filter({hasText:/^Multiple-source assembly/})}).last();
 const imports=panel.locator("summary").filter({hasText:/^Import SRT or VTT$/});await imports.nth(1).click();
 const srt=path.join(dir,"second.srt");fs.writeFileSync(srt,"1\n00:00:00,200 --> 00:00:01,000\nSecond 你好\n");
 const subtitleInput=panel.getByLabel("Subtitle file",{exact:true}).nth(1);await subtitleInput.setInputFiles(srt);await panel.getByRole("button",{name:"Append imported captions",exact:true}).last().click();
 const output=await exportVideo(page,"mixed-rates.mp4"),metadata=probe(output),v=metadata.streams.find(s=>s.codec_type==="video");assert.equal(v.width,320);assert.equal(v.height,180);assert.ok(Math.abs(Number(metadata.format.duration)-2.5)<.1);
 const green=pixel(output,.2),purple=pixel(output,1.3);assert.ok(green[1]>green[0]*2&&green[1]>green[2]*2);assert.ok(purple[0]>60&&purple[2]>60&&purple[1]<40);
 assert.ok(rms(output,.3)>.04);assert.ok(rms(output,1.3)<.001,"missing audio becomes silence");
 const vtt=decodeURIComponent((await page.getByRole("link",{name:"Current subtitles (.vtt)",exact:true}).getAttribute("href")).split(",")[1]);assert.match(vtt,/Primary corrected café/);assert.match(vtt,/00:00:00.200 --> 00:00:00.800/);assert.match(vtt,/00:00:01.200 --> 00:00:02.000/);
 await save(page);await page.getByText("Export and storage details",{exact:true}).click();await page.getByText("Project name and backups",{exact:true}).click();
 async function download(name,button){const promise=page.waitForEvent("download");await page.getByRole("button",{name:button,exact:true}).click();const d=await promise,p=path.join(dir,name);await d.saveAs(p);return p;}
 const light=await download("assembly.json","Download project file"),bundle=await download("assembly.cutmark","Download backup with source"),manifest=JSON.parse(fs.readFileSync(light,"utf8"));assert.equal(manifest.version,3);assert.equal(manifest.decisions.assembly.sources.length,2);
 const unique=manifest.decisions.assembly.sources.find(s=>s.reference.fileName===path.basename(secondary));const packed=fs.readFileSync(bundle);assert.equal(packed.length,12+packed.readUInt32LE(8)+fs.statSync(primary).size+fs.statSync(secondary).size);
 await page.reload();await page.getByRole("button",{name:"Open project",exact:true}).click();await page.getByRole("button",{name:"Export video",exact:true}).waitFor();await page.locator("summary").filter({hasText:/^Multiple-source assembly/}).click();assert.equal(await page.getByLabel("Assembly range 2 start",{exact:true}).count(),1);
 await page.evaluate(assetId=>new Promise((resolve,reject)=>{const q=indexedDB.open("splice-projects",7);q.onsuccess=()=>{const db=q.result,tx=db.transaction("assets","readwrite");tx.objectStore("assets").delete(assetId);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}),unique.assetId);await page.reload();await page.getByRole("button",{name:"Open project",exact:true}).click();await page.getByRole("button",{name:"Export video",exact:true}).waitFor();await page.locator("summary").filter({hasText:/^Multiple-source assembly/}).click();await page.getByLabel("Relink assembly source "+path.basename(secondary),{exact:true}).setInputFiles(secondary);await page.getByText("Source matches and is ready to render.",{exact:true}).waitFor();await save(page);
 console.log("PASS mixed dimensions/rates, real picture joins, silent missing track, source captions, v3 bundle and reopened missing-media relinking");
 const recovered=await fresh();await openRecovery(recovered,light);await recovered.getByLabel("Relink source video",{exact:true}).setInputFiles(primary);await recovered.getByLabel("Relink additional source "+path.basename(secondary),{exact:true}).setInputFiles(secondary);await recovered.getByRole("button",{name:"Restore verified project",exact:true}).click();await recovered.getByRole("button",{name:"Export video",exact:true}).waitFor();const recoveredOutput=await exportVideo(recovered,"relinked.mp4");assert.ok(Math.abs(Number(probe(recoveredOutput).format.duration)-2.5)<.1);
 const bundled=await fresh();await openRecovery(bundled,bundle);await bundled.getByRole("button",{name:"Restore verified project",exact:true}).click();await bundled.getByRole("button",{name:"Export video",exact:true}).waitFor();const bundledOutput=await exportVideo(bundled,"bundled.mp4");assert.ok(Math.abs(Number(probe(bundledOutput).format.duration)-2.5)<.1);
 await bundled.setViewportSize({width:390,height:844});await bundled.locator("summary").filter({hasText:/^Multiple-source assembly/}).click();assert.ok(await bundled.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await bundled.screenshot({path:path.join(dir,"mobile.png"),fullPage:true});assert.deepEqual(errors,[]);console.log("PASS fresh-context lightweight all-source relinking, self-contained multi-source restore/export and mobile layout");
}finally{await browser.close();}
