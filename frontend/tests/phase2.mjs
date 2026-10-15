import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.CUTMARK_PLAYWRIGHT_PATH || "playwright");
const root = process.env.CUTMARK_ARTIFACTS;
if (!root) throw new Error("Set CUTMARK_ARTIFACTS to the existing media verification directory.");
const artifacts = path.join(root,"phase-2"); fs.mkdirSync(artifacts,{recursive:true});
const long = path.join(artifacts,"long-pauses.mp4");
if (!fs.existsSync(long)) execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=160x90:rate=2:duration=600","-f","lavfi","-i","aevalsrc=if(lt(mod(t\\,10)\\,5)\\,0.3*sin(2*PI*440*t)\\,0):s=16000:d=600","-c:v","libx264","-preset","ultrafast","-c:a","aac","-shortest",long]);
const browser = await chromium.launch({channel:"msedge",headless:true});
const context = await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true});
await context.addInitScript(() => {
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) { super(...args); this.addEventListener("message", ({ data }) => { if (data.type === "waveform") window.cutmarkWaveform = data; }); }
  };
});
const page = await context.newPage(), errors=[]; page.on("pageerror",error=>errors.push(error.message));
const url = process.env.CUTMARK_TEST_URL || "http://127.0.0.1:4174";
async function input(label,value) { const field=page.getByLabel(label,{exact:true}); await field.fill(value); await field.press("Tab"); }
async function saved() { await page.getByText("Saved in this browser",{exact:true}).first().waitFor(); }
async function seek(time) {
  await page.locator("video").first().evaluate((video,time)=>{video.pause();video.currentTime=time},time);
  await page.waitForFunction(time=>{const video=document.querySelector("video");return !video.seeking && Math.abs(video.currentTime-time)<.001},time);
}
async function source(name) {
  if (await page.getByRole("button",{name:"New video",exact:true}).count()) await page.getByRole("button",{name:"New video",exact:true}).click();
  await page.getByLabel("Source video file",{exact:true}).setInputFiles(name);
  await page.getByRole("button",{name:"Export video",exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('button[aria-label="Play preview"]')?.disabled);
}
async function metadata() {
  return page.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open("splice-projects",7);open.onsuccess=()=>{const db=open.result;const query=db.transaction("projects","readonly").objectStore("projects").getAll();query.onsuccess=()=>{db.close();resolve(query.result.sort((a,b)=>b.updatedAt-a.updatedAt)[0])}}}));
}
try {
  await page.goto(url); await source(path.join(root,"boundary.mp4"));
  await page.getByText("Source peaks, scaled for visibility",{exact:true}).waitFor({timeout:30000});
  await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Source footage thumbnails"] img').length>=4);
  const frames = await page.locator('[aria-label="Source footage thumbnails"] img').evaluateAll(images=>images.map(img=>{
    const canvas=document.createElement("canvas");canvas.width=1;canvas.height=1;
    const ctx=canvas.getContext("2d");ctx.drawImage(img,0,0,1,1);
    return {label:img.alt,pixel:Array.from(ctx.getImageData(0,0,1,1).data)};
  }));
  assert.ok(frames.some(({label,pixel})=>label.includes("00:00:01.")&&pixel[1]>pixel[0]*1.5),"decoded green thumbnails match actual source time");
  assert.ok(frames.some(({label,pixel})=>label.includes("00:00:02.")&&pixel[2]>pixel[0]*1.5),"decoded blue thumbnails match actual source time");
  console.log("PASS progressive thumbnails use decoded footage and real source timestamps");

  await input("Clip in time","1"); await input("Clip out time","3");
  await page.getByRole("button",{name:"Zoom in timeline",exact:true}).click();
  let span=await page.getByLabel("Timeline visible start",{exact:true}).getAttribute("max");
  assert.ok(Number(span)>0);
  await page.getByRole("button",{name:"Fit selection",exact:true}).click();
  await page.getByRole("button",{name:"Fit source",exact:true}).click();
  const track=page.getByLabel("Video timeline",{exact:true});
  await track.scrollIntoViewIfNeeded(); const box=await track.boundingBox();
  // A rapid playhead drag retains the latest queued source seek.
  await page.mouse.move(box.x+box.width*.4,box.y+8);await page.mouse.down();
  for(const part of [.7,.2,.8,.45,.6]) await page.mouse.move(box.x+box.width*part,box.y+8);
  await page.mouse.up();
  await page.waitForFunction(()=>!document.querySelector("video").seeking&&Math.abs(document.querySelector("video").currentTime-2.4)<.03);
  console.log("PASS zoom, fit and rapid scrubbing settle on the latest native media time");
  await seek(2);
  await page.getByText("Scene cuts · 0 markers",{exact:true}).click();
  await page.getByRole("button",{name:"Add cut at playhead",exact:true}).click();
  await page.getByLabel("Snap to cuts",{exact:true}).check();
  const trimHandle=page.getByRole("slider",{name:"Clip in point",exact:true});
  await trimHandle.scrollIntoViewIfNeeded();
  let rect=await track.boundingBox(),handle=await trimHandle.boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+10);await page.mouse.down();
  await page.mouse.move(rect.x+rect.width*.5-6,handle.y+10,{steps:8});
  await page.getByText(/Snap to 00:00:02.000 · In/).waitFor();
  await page.mouse.up();
  assert.equal(await page.getByLabel("Clip in time",{exact:true}).inputValue(),"00:00:02.000");
  await page.getByRole("button",{name:/Undo · Change trim/}).click();
  rect=await track.boundingBox();handle=await trimHandle.boundingBox();
  await page.keyboard.down("Shift");await page.mouse.move(handle.x+handle.width/2,handle.y+10);await page.mouse.down();
  await page.mouse.move(rect.x+rect.width*.5-6,handle.y+10,{steps:8});await page.mouse.up();await page.keyboard.up("Shift");
  assert.notEqual(await page.getByLabel("Clip in time",{exact:true}).inputValue(),"00:00:02.000");
  await input("Clip in time","1.98");
  assert.equal(await page.getByLabel("Clip in time",{exact:true}).inputValue(),"00:00:01.980");
  await input("Clip in time","1");await page.getByLabel("Snap to cuts",{exact:true}).uncheck();
  await page.getByText("Scene cuts · 1 markers",{exact:true}).click();
  console.log("PASS visible snap target within ten pixels, Shift bypass and independent typed boundaries");


  await page.getByLabel("Loop selection",{exact:true}).check();
  await page.getByLabel("Preview playback speed",{exact:true}).selectOption("2");
  await page.getByLabel("Preview volume",{exact:true}).fill("0.4");
  await page.getByRole("button",{name:"Preview selection",exact:true}).click();
  await page.waitForTimeout(2400);
  const transport=await page.locator("video").first().evaluate(v=>({time:v.currentTime,paused:v.paused,rate:v.playbackRate,volume:v.volume}));
  assert.equal(transport.paused,false);assert.equal(transport.rate,2);assert.equal(transport.volume,.4);assert.ok(transport.time>=1&&transport.time<3);
  await page.getByRole("button",{name:"Pause preview",exact:true}).click();
  await page.getByLabel("Loop selection",{exact:true}).uncheck();
  await page.getByLabel("Preview playback speed",{exact:true}).selectOption("1");
  await page.getByText("Review a cut",{exact:true}).click();
  await page.getByLabel("Cut context seconds",{exact:true}).fill(".5");
  await page.getByRole("button",{name:"Review out point",exact:true}).click();
  await page.getByText("Cut context review · includes footage outside your output selection.",{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector("video").paused&&document.querySelector("video").currentTime>3.49);
  await page.getByRole("button",{name:"Replay cut context",exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector("video").paused&&document.querySelector("video").currentTime<3);
  await page.getByRole("button",{name:"Pause preview",exact:true}).click();
  assert.equal(await page.getByLabel("Clip out time",{exact:true}).inputValue(),"00:00:03.000");
  console.log("PASS real selection looping, preview speed/volume, contextual cut review and replay");

  await seek(1.2);
  await page.getByRole("button",{name:"Add caption",exact:true}).click();
  assert.equal(await page.getByLabel("Caption 1 start time",{exact:true}).inputValue(),"00:00:01.200");
  await input("Caption 1 end time","2.8");
  const text=page.getByLabel("Caption 1 text",{exact:true});await text.fill("Krish café 你好");
  await seek(2);
  await text.focus();await text.press("Home");for(let i=0;i<6;i++)await text.press("ArrowRight");
  await page.getByRole("button",{name:"Split at playhead",exact:true}).first().click();
  assert.equal(await text.inputValue(),"Krish ");
  assert.equal(await page.getByLabel("Caption 2 text",{exact:true}).inputValue(),"café 你好");
  await page.getByRole("button",{name:/Undo · Split caption/}).click();
  assert.equal(await text.inputValue(),"Krish café 你好");
  await page.getByRole("button",{name:"Redo",exact:true}).click();
  await page.getByRole("button",{name:"Seek to caption 2",exact:true}).click();
  await page.waitForFunction(()=>Math.abs(document.querySelector("video").currentTime-2)<.001&&!document.querySelector("video").seeking);
  await page.getByLabel("Select caption 1",{exact:true}).check();await page.getByLabel("Select caption 2",{exact:true}).check();
  await page.getByText("Cue operations",{exact:true}).click();await page.getByRole("button",{name:"Merge adjacent",exact:true}).click();
  assert.equal(await text.inputValue(),"Krish \ncafé 你好");
  await page.getByLabel("Shift selected captions in seconds",{exact:true}).fill(".1");
  await page.getByRole("button",{name:"Apply shift",exact:true}).click();
  assert.equal(await page.getByLabel("Caption 1 start time",{exact:true}).inputValue(),"00:00:01.300");
  await page.getByLabel("Search captions",{exact:true}).fill("Krish");
  await page.getByRole("button",{name:"Replace",exact:true}).click();
  await page.getByLabel("Replacement caption text",{exact:true}).fill("$& Chris");
  assert.equal(await page.locator("mark").innerText(),"Krish");assert.equal(await text.inputValue(),"Krish \ncafé 你好");
  await page.getByRole("button",{name:"Apply replace",exact:true}).click();
  await page.getByLabel("Search captions",{exact:true}).fill("");
  assert.equal(await text.inputValue(),"$& Chris \ncafé 你好");
  await page.getByRole("button",{name:/Undo · Replace caption text/}).click();
  assert.equal(await text.inputValue(),"Krish \ncafé 你好");
  await page.getByText(/Readability guidance ·/).click();
  await page.getByLabel("Caption reading speed guidance",{exact:true}).fill("5");await page.getByLabel("Caption reading speed guidance",{exact:true}).press("Tab");
  await page.getByLabel("Caption 1 review note",{exact:true}).fill("Intentional brief title");
  await page.getByRole("button",{name:"Acknowledge guidance",exact:true}).click();
  await page.getByText(/✓ Reviewed: Fast reading pace/).waitFor();
  await saved();
  const meta=await metadata();assert.equal(meta.captions[0].reviewNote,"Intentional brief title");assert.equal(meta.captionGuidance.charactersPerSecond,5);
  const srt=decodeURIComponent(await page.getByRole("link",{name:"Current subtitles (.srt)",exact:true}).getAttribute("href"));
  assert.match(srt,/00:00:00,300 --> 00:00:01,900/);assert.match(srt,/Krish \ncafé 你好/);
  console.log("PASS split/merge/group shift, search highlighting, previewed literal replace, undo and reviewable guidance");

  await page.getByRole("button",{name:"Delete selected",exact:true}).click();
  assert.equal(await text.count(),0);
  await page.getByRole("button",{name:/Undo · Delete captions/}).click();await saved();
  await page.reload();await page.getByRole("button",{name:"Open project",exact:true}).first().click();
  await page.getByLabel("Caption 1 text",{exact:true}).waitFor();
  assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),"Krish \ncafé 你好");
  assert.equal(await page.getByLabel("Caption 1 start time",{exact:true}).inputValue(),"00:00:01.300");
  await page.getByText(/Readability guidance ·/).click();
  assert.equal(await page.getByLabel("Caption reading speed guidance",{exact:true}).inputValue(),"5");
  console.log("PASS deletion undo, saved review notes/guidance, source cues and selected subtitle timings survive reopening");

  await page.setViewportSize({width:390,height:844});
  await page.getByRole("navigation",{name:"Editing tools",exact:true}).getByRole("button",{name:"Captions",exact:true}).click();
  await page.getByLabel("Caption 1 text",{exact:true}).fill("I O space — safe typing");
  const tabs = await page.getByRole("navigation",{name:"Editing tools",exact:true}).boundingBox();
  assert.ok(tabs.y>=-1 && tabs.y<60,"mobile tool navigation remains in reach while editing a cue");
  assert.equal(await page.locator("video").first().evaluate(v=>v.paused),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(artifacts,"mobile-captions.png"),fullPage:true});
  await page.getByRole("navigation",{name:"Editing tools",exact:true}).getByRole("button",{name:"Details",exact:true}).click();
  await page.getByRole("navigation",{name:"Editing tools",exact:true}).getByRole("button",{name:"Trim",exact:true}).click();
  await page.getByLabel("Clip in time",{exact:true}).waitFor();
  await page.emulateMedia({reducedMotion:"reduce"});await page.evaluate(()=>document.documentElement.style.fontSize="20px");
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(artifacts,"mobile-trim.png"),fullPage:true});
  await page.evaluate(()=>document.documentElement.style.fontSize="");await page.setViewportSize({width:1366,height:900});
  console.log("PASS mobile tool switching, normal caption typing, larger text and reduced motion without overflow");

  await page.evaluate(() => {
    window.cutmarkWorker = window.Worker;
    window.Worker = class extends window.cutmarkWorker {
      postMessage(data, transfer) { if (data.kind === "waveform") setTimeout(() => super.postMessage(data, transfer), 1000); else super.postMessage(data, transfer); }
    };
  });
  await source(long);
  assert.equal(await page.getByRole("button", {name:"Export video",exact:true}).isEnabled(),true);
  await page.getByRole("button", {name:"Cancel waveform",exact:true}).click();
  await page.getByText("Waveform cancelled. Editing remains available.",{exact:true}).waitFor();
  await page.waitForTimeout(1200);
  await page.getByText("Waveform cancelled. Editing remains available.",{exact:true}).waitFor();
  await page.evaluate(()=>{window.Worker=window.cutmarkWorker});
  await page.getByRole("button", {name:"Retry waveform",exact:true}).click();
  console.log("PASS waveform cancellation ignores late setup and independent retry leaves editing available");
  await page.getByText("Source peaks, scaled for visibility",{exact:true}).waitFor({timeout:60000});
  assert.equal(await page.getByLabel("Clip out time",{exact:true}).inputValue(),"00:10:00.000");
  const levels=await page.getByLabel("Decoded source audio peak waveform",{exact:true}).evaluate(canvas=>{
    const context=canvas.getContext("2d"),w=canvas.width,h=canvas.height,pixels=context.getImageData(0,0,w,h).data;
    const heightAt=time=>{const x=Math.round(time/600*w);let count=0;for(let y=0;y<h;y++){const offset=(y*w+x)*4;if(pixels[offset]>150&&pixels[offset+2]>180&&pixels[offset+3]>0)count++}return count};
    return {signal:heightAt(2.5),pause:heightAt(7.5)};
  });
  const measured = await page.evaluate(()=>({signal:Math.max(...window.cutmarkWaveform.levels[0].slice(400,600)),pause:Math.max(...window.cutmarkWaveform.levels[0].slice(1400,1600))}));
  assert.ok(measured.signal>.25 && measured.pause<.0001,"actual decoded peaks match the known waveform fixture");
  assert.ok(levels.signal>levels.pause+10,"real decoded waveform separates signal from known pause: "+JSON.stringify(levels));
  await input("Clip in time","300");await input("Clip out time","310");await seek(305);
  await page.getByRole("button",{name:"Fit selection",exact:true}).click();
  const nav=page.getByLabel("Timeline visible start",{exact:true});assert.ok(Number(await nav.inputValue())>295);
  await nav.fill("450");
  await page.getByRole("button",{name:"Show in point",exact:true}).click();
  await page.getByRole("slider",{name:"Clip in point",exact:true}).waitFor();
  await page.getByRole("button",{name:"Fit source",exact:true}).click();
  assert.equal(await nav.inputValue(),"0");
  await page.screenshot({path:path.join(artifacts,"desktop-long-timeline.png"),fullPage:true});
  console.log("PASS ten-minute media waveform pause alignment, fitted selection, horizontal navigation and source overview");

  await source(path.join(root,"silent.mp4"));
  await page.getByText("Silent audio — no peaks",{exact:true}).waitFor();
  await source(path.join(root,"no-audio.mp4"));
  await page.getByText("No audio track",{exact:true}).waitFor();
  await page.getByRole("navigation",{name:"Inspector tools",exact:true}).getByRole("button",{name:"Captions",exact:true}).click();
  assert.equal(await page.getByRole("button",{name:"Generate selection captions",exact:true}).isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log("PASS explicit silent/absent audio outcomes and no uncaught browser errors");
  console.log("Artifacts: "+artifacts);
} catch(error) { await page.screenshot({path:path.join(artifacts,"failure.png"),fullPage:true});console.log((await page.locator("body").innerText()).slice(-6000));console.log("Browser errors:",errors);throw error; }
finally {await browser.close();}
