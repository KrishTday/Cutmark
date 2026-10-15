import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.CUTMARK_PLAYWRIGHT_PATH||"playwright");
const root=process.env.CUTMARK_ARTIFACTS;if(!root)throw new Error("Set CUTMARK_ARTIFACTS to the media verification directory.");
const artifacts=path.join(root,"scene-tools");fs.mkdirSync(artifacts,{recursive:true});
const browser=await chromium.launch({channel:"msedge",headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.on("console",message=>{if(/same key|Encountered two children/.test(message.text()))errors.push(message.text())});
const url=process.env.CUTMARK_TEST_URL||"http://127.0.0.1:4174";
async function saved(){await page.getByText("Saved in this browser",{exact:true}).first().waitFor();}
async function input(label,value){const field=page.getByLabel(label,{exact:true});await field.fill(value);await field.press("Tab");}
async function meta(){return page.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open("splice-projects",7);open.onsuccess=()=>{const db=open.result,request=db.transaction("projects","readonly").objectStore("projects").getAll();request.onsuccess=()=>{db.close();resolve(request.result.sort((a,b)=>b.updatedAt-a.updatedAt)[0]);}}}));}
async function seek(time){await page.locator("video").first().evaluate((video,time)=>{video.pause();video.currentTime=time},time);await page.waitForFunction(time=>{const v=document.querySelector("video");return !v.seeking&&Math.abs(v.currentTime-time)<.001},time);}
async function scan(replace=false){
  const checkbox=page.getByLabel("Replace reviewed and manual cuts in the scan area",{exact:true});if(replace)await checkbox.check();else await checkbox.uncheck();
  if(await page.getByRole("button",{name:"Rescan cuts",exact:true}).count()){page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Rescan cuts",exact:true}).click();}
  else await page.getByRole("button",{name:"Detect cuts",exact:true}).click();
  await page.getByRole("status").filter({hasText:/candidates found;.*cuts retained/}).waitFor({timeout:60000});await saved();
}
try{
  await page.goto(url);await page.getByLabel("Source video file",{exact:true}).setInputFiles(path.join(root,"boundary.mp4"));
  await page.getByRole("button",{name:"Export video",exact:true}).waitFor();await saved();
  await page.getByText("Scene cuts · 0 markers",{exact:true}).click();
  await scan();let record=await meta();
  assert.equal(record.sceneAnalysis.complete,true);assert.equal(record.sceneAnalysis.samplesChecked,17);
  assert.equal(record.sceneCuts.length,3);assert.ok(record.sceneCuts.every(cut=>!cut.refined&&!cut.confirmed));
  console.log("PASS source quick scan finds real hard-cut candidates and records coverage/settings");
  await page.getByLabel("Scene analysis mode",{exact:true}).selectOption("refined");await scan();
  record=await meta();
  assert.deepEqual(record.sceneCuts.map(cut=>Number(cut.time.toFixed(6))),[1,2,3]);
  assert.equal(record.sceneAnalysis.refinedCount,3);
  await page.getByRole("button",{name:"Review scene cut 1",exact:true}).click();
  await page.getByAltText("Before candidate, decoded frame 00:00:00.967",{exact:true}).waitFor({timeout:30000});
  await page.getByAltText("At candidate, decoded frame 00:00:01.000",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Confirm scene cut 1",exact:true}).click();
  await input("Scene cut 2 time","2.1");
  await page.getByRole("button",{name:"Remove cut at 00:00:03.000",exact:true}).click();
  await saved();record=await meta();assert.deepEqual(record.sceneMarkers,[1,2.1]);assert.equal(record.dismissedCuts.length,2);
  console.log("PASS candidate refinement matches actual transition frame timestamps; confirm/move/dismiss are saved");

  await seek(1.5);await page.getByText("Editorial markers · 0",{exact:true}).click();
  await page.getByLabel("New editorial marker name",{exact:true}).fill("Opening hook");
  await page.getByRole("button",{name:"Add marker at playhead",exact:true}).click();
  await page.getByLabel("Marker Opening hook note",{exact:true}).fill("Use this quote — café 你好");
  await page.getByLabel("Marker Opening hook color",{exact:true}).selectOption("gold");
  await page.getByLabel("Search editorial markers",{exact:true}).fill("café");
  await page.getByRole("button",{name:"Seek to marker Opening hook",exact:true}).waitFor();
  await page.getByLabel("Search editorial markers",{exact:true}).fill("absent");
  await page.getByText("No markers match your search.",{exact:true}).waitFor();
  await page.getByLabel("Search editorial markers",{exact:true}).fill("");
  await input("Marker Opening hook time","1.6");
  await page.getByRole("button",{name:/Undo · Move editorial marker/}).click();
  await page.getByRole("button",{name:"Timeline marker Opening hook at 00:00:01.500",exact:true}).click();
  await page.waitForFunction(()=>Math.abs(document.querySelector("video").currentTime-1.5)<.001&&!document.querySelector("video").seeking);
  await scan();record=await meta();
  assert.deepEqual(record.sceneMarkers,[1,2.1]);assert.equal(record.editorialMarkers[0].note,"Use this quote — café 你好");
  assert.equal(record.editorialMarkers[0].color,"gold");assert.equal(record.editorialMarkers[0].time,1.5);
  console.log("PASS marker search, color, time undo and timeline seeking; rescans preserve moved/confirmed/dismissed cuts and editorial notes");

  await input("Clip in time","1.5");await input("Clip out time","3.5");
  await page.getByLabel("Scene scan area",{exact:true}).selectOption("selection");
  await page.getByLabel("Scene sensitivity",{exact:true}).selectOption("more");
  await scan(true);record=await meta();assert.equal(record.sceneAnalysis.start,1.5);assert.equal(record.sceneAnalysis.end,3.5);
  assert.deepEqual(record.sceneMarkers.map(time=>Number(time.toFixed(6))),[1,2,3]);
  assert.equal(record.editorialMarkers[0].name,"Opening hook");
  await seek(2.3);await page.getByRole("button",{name:"Select scene at playhead",exact:true}).click();
  assert.equal(await page.getByLabel("Clip in time",{exact:true}).inputValue(),"00:00:02.000");
  assert.equal(await page.getByLabel("Clip out time",{exact:true}).inputValue(),"00:00:03.000");
  await page.getByText("Scan completed with earlier area or settings.",{exact:true}).waitFor();
  await page.getByRole("button",{name:/Undo · Select scene/}).click();await saved();
  console.log("PASS explicit replacement is scoped, preserves outside cuts/notes and source scene selection is half-open");

  await page.route("**/_next/static/chunks/*.js",async route=>{await new Promise(resolve=>setTimeout(resolve,1000));await route.continue()});
  page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Rescan cuts",exact:true}).click();
  await page.getByRole("button",{name:"Cancel",exact:true}).click();await page.waitForTimeout(1300);await page.unroute("**/_next/static/chunks/*.js");
  assert.deepEqual((await meta()).sceneMarkers,[1,2,3]);
  await page.reload();await page.getByRole("button",{name:"Open project",exact:true}).first().click();
  await page.getByText("Scene cuts · 3 markers",{exact:true}).click();
  await page.getByText("Scan matches the current area and settings.",{exact:true}).waitFor();
  await page.getByText("Editorial markers · 1",{exact:true}).click();
  assert.equal(await page.getByLabel("Marker Opening hook note",{exact:true}).inputValue(),"Use this quote — café 你好");
  await page.screenshot({path:path.join(artifacts,"scene-review.png"),fullPage:true});
  console.log("PASS scene cancellation and reopening retain cuts, analysis configuration and marker notes");

  await page.getByLabel("Scene scan area",{exact:true}).selectOption("source");
  await page.getByLabel("Scene analysis mode",{exact:true}).selectOption("quick");
  page.once("worker",worker=>{
    void worker.evaluate(()=>{
      const now=performance.now.bind(performance),post=self.postMessage.bind(self);let elapsed=0;
      Object.defineProperty(performance,"now",{value:()=>now()+elapsed});
      self.postMessage=(value,...args)=>{
        if(value.type==="progress" && /Sampling source frames: (?:6[0-9]|[7-9][0-9])%/.test(value.message??""))elapsed=180000;
        post(value,...args);
      };
    }).catch(error=>errors.push(error.message));
  });
  await scan();record=await meta();
  assert.equal(record.sceneAnalysis.complete,false);
  assert.ok(record.sceneAnalysis.coverageEnd<record.sceneAnalysis.end);
  assert.ok(record.sceneMarkers.includes(3),"unchecked cuts outside partial coverage are retained");
  await page.getByText("Partial scan; unvisited footage has not been checked.",{exact:true}).waitFor();
  const beforeFailure = record.sceneMarkers;
  console.log("PASS interrupted sample walk records partial coverage and preserves unvisited cuts");
  // Worker failure must not replace a successful analysis or the editable marker list.
  await page.route("**/_next/static/chunks/*.js",route=>route.abort());
  page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Rescan cuts",exact:true}).click();
  await page.locator("summary").filter({hasText:/^Scene cuts ·/}).click();
  await page.getByRole("alert").filter({hasText:/Scene analysis could not start/}).waitFor({timeout:30000});
  await page.unroute("**/_next/static/chunks/*.js");
  assert.deepEqual((await meta()).sceneMarkers,beforeFailure);
  await page.locator("summary").filter({hasText:/^Scene cuts ·/}).click();
  await scan();
  console.log("PASS scene worker failure leaves previous analysis/notes intact and retry succeeds");

  const mixed=path.join(artifacts,"dissolve-motion-flash.mp4");
  if(!fs.existsSync(mixed))execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y",
    "-f","lavfi","-i","color=c=red:s=160x90:r=30:d=3",
    "-f","lavfi","-i","color=c=blue:s=160x90:r=30:d=3",
    "-f","lavfi","-i","testsrc2=size=160x90:rate=30:duration=3",
    "-f","lavfi","-i","color=c=blue:s=160x90:r=30:d=3",
    "-filter_complex","[0:v][1:v]xfade=transition=fade:duration=1:offset=2[fade];[fade][2:v][3:v]concat=n=3:v=1:a=0,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,8.5,8.54)'[out]",
    "-map","[out]","-c:v","libx264","-pix_fmt","yuv420p",mixed]);
  await page.getByRole("button",{name:"New video",exact:true}).click();
  await page.getByLabel("Source video file",{exact:true}).setInputFiles(mixed);await page.getByRole("button",{name:"Export video",exact:true}).waitFor();
  await page.getByText("Scene cuts · 0 markers",{exact:true}).click();
  await page.getByLabel("Scene analysis mode",{exact:true}).selectOption("refined");
  await scan();record=await meta();
  assert.ok(record.sceneCuts.some(cut=>Math.abs(cut.time-5)<.05),"hard cut from dissolve section into moving footage is found");
  assert.ok(record.sceneCuts.every(cut=>!cut.confirmed),"motion and flash candidates always require review");
  assert.ok(record.sceneCuts.every(cut=>!cut.refined||Math.abs(cut.time*30-Math.round(cut.time*30))<.001),"refinement uses source frame timestamps");
  await page.screenshot({path:path.join(artifacts,"mixed-candidates.png"),fullPage:true});
  console.log("PASS dissolve/moving-footage/flash fixture completes; candidates remain reviewable and refined timestamps are source frames");

  await page.getByRole("button",{name:"New video",exact:true}).click();
  const long=path.join(root,"phase-2","long-pauses.mp4");if(!fs.existsSync(long))throw new Error("Run tests/phase2.mjs to create the ten-minute fixture.");
  await page.getByLabel("Source video file",{exact:true}).setInputFiles(long);await page.getByRole("button",{name:"Export video",exact:true}).waitFor();await saved();
  const project=await meta();
  await page.evaluate(id=>new Promise(resolve=>{
    const open=indexedDB.open("splice-projects",7);open.onsuccess=()=>{const db=open.result,tx=db.transaction("projects","readwrite"),store=tx.objectStore("projects"),get=store.get(id);
      get.onsuccess=()=>store.put({...get.result,revision:(get.result.revision??0)+1,captions:Array.from({length:180},(_,index)=>({id:index+1,start:index*2,end:index*2+1.8,text:"Reviewed source cue "+(index+1)}))});
      tx.oncomplete=()=>{db.close();resolve()};
    };
  }),project.id);
  await page.reload();await page.getByRole("button",{name:"Open project",exact:true}).first().click();await page.getByLabel("Caption 1 text",{exact:true}).waitFor();
  const transcript=page.getByLabel("Caption transcript editor",{exact:true}),list=transcript.locator('div.max-h-\\[62dvh\\]');
  const scrollBefore=await page.evaluate(()=>scrollY);
  await seek(100);await page.getByLabel("Caption cue 51",{exact:true}).getByText("Cue 51 · Active",{exact:true}).waitFor();
  assert.ok(await list.evaluate(element=>element.scrollTop)>0);
  assert.equal(await page.evaluate(()=>scrollY),scrollBefore,"automatic following does not move the whole page");
  await list.hover();await page.mouse.wheel(0,-250);await page.getByRole("button",{name:"Resume cue follow",exact:true}).waitFor();
  const manual=await list.evaluate(element=>element.scrollTop);await seek(120);
  await page.getByText("Cue 61 · Active",{exact:true}).waitFor();assert.equal(await list.evaluate(element=>element.scrollTop),manual,"manual browsing pauses following");
  await page.getByRole("button",{name:"Resume cue follow",exact:true}).click();
  assert.notEqual(await list.evaluate(element=>element.scrollTop),manual);
  await page.getByLabel("Search captions",{exact:true}).fill("source cue 21");
  await page.getByRole("button",{name:"Seek to caption 21",exact:true}).click();await page.waitForFunction(()=>Math.abs(document.querySelector("video").currentTime-40)<.001&&!document.querySelector("video").seeking);
  await page.screenshot({path:path.join(artifacts,"transcript-follow.png"),fullPage:true});
  console.log("PASS 180-cue source transcript active highlighting, container-only follow, manual pause/resume and search seeking");
  assert.deepEqual(errors,[]);
  console.log("Artifacts: "+artifacts);
}catch(error){await page.screenshot({path:path.join(artifacts,"failure.png"),fullPage:true});console.log((await page.locator("body").innerText()).slice(-8000));console.log("Browser errors",errors);throw error;}
finally{await browser.close();}
