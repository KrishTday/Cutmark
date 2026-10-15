import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.CUTMARK_PLAYWRIGHT_PATH||"playwright");
const root=process.env.CUTMARK_ARTIFACTS;if(!root)throw new Error("Set CUTMARK_ARTIFACTS to existing fixtures.");
const dir=path.join(root,"project-backups");fs.mkdirSync(dir,{recursive:true});
const source=path.join(root,"boundary.mp4"),url=process.env.CUTMARK_TEST_URL||"http://127.0.0.1:4174",browser=await chromium.launch({channel:"msedge",headless:true});
const contexts=[],errors=[];async function fresh(){const context=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true});contexts.push(context);const p=await context.newPage();p.on("pageerror",e=>errors.push(e.message));await p.goto(url);return p;}
async function open(p,name){const summary=p.getByText(name,{exact:true});if(!(await summary.evaluate(e=>e.parentElement.open)))await summary.click();}
async function tools(p){await open(p,"Export and storage details");await open(p,"Project name and backups");}
async function input(p,label,value){const f=p.getByLabel(label,{exact:true});await f.fill(value);await f.press("Tab");}
async function saved(p){await p.getByText("Saved in this browser",{exact:true}).first().waitFor();}
async function database(p){return p.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open("splice-projects",7);open.onsuccess=()=>{const db=open.result,t=db.transaction(["projects","assets"]),q=t.objectStore("projects").getAll(),a=t.objectStore("assets").getAllKeys();t.oncomplete=()=>{db.close();resolve({projects:q.result,assets:a.result});};};}));}
async function exportVideo(p){await p.getByRole("button",{name:/Export (video|latest changes)/}).click();await p.getByRole("button",{name:"Export video",exact:true}).waitFor({timeout:120000});await saved(p);return p.getByRole("link",{name:"MP4",exact:true}).getAttribute("href");}
async function download(p,name,file){const event=p.waitForEvent("download");await p.getByRole("button",{name,exact:true}).click();const d=await event;await d.saveAs(file);return d.suggestedFilename();}
async function restoreFile(p,file){await open(p,"Open project backup");await p.getByLabel("Project backup file",{exact:true}).setInputFiles(file);}
try{
 const p=await fresh();await p.getByLabel("Source video file",{exact:true}).setInputFiles(source);await p.getByRole("button",{name:"Export video",exact:true}).waitFor();
 await input(p,"Clip in time","1");await input(p,"Clip out time","3");await p.getByRole("button",{name:"Add caption",exact:true}).click();await p.getByLabel("Caption 1 text",{exact:true}).fill("Krish café 你好\nKeep my correction");await input(p,"Caption 1 start time","1.1");await input(p,"Caption 1 end time","2.9");
 await p.getByText("Caption style and delivery",{exact:true}).click();await p.getByLabel("Caption style preset",{exact:true}).selectOption("contrast");await p.getByLabel("Caption delivery",{exact:true}).selectOption("both");
 await p.locator("video").first().evaluate(v=>{v.currentTime=1.5;});await p.waitForTimeout(150);
 await p.locator("summary").filter({hasText:/^Scene cuts ·/}).click();await p.getByRole("button",{name:"Add cut at playhead",exact:true}).click();
 await p.locator("summary").filter({hasText:/^Editorial markers ·/}).click();await p.getByLabel("New editorial marker name",{exact:true}).fill("Quote 你好");await p.getByRole("button",{name:"Add marker at playhead",exact:true}).click();await p.getByLabel("Marker Quote 你好 note",{exact:true}).fill("Preserve café and pause");await p.getByLabel("Marker Quote 你好 color",{exact:true}).selectOption("gold");
 await tools(p);await p.getByLabel("Project title",{exact:true}).fill("Interview café 你好");await saved(p);
 const before=(await database(p)).projects[0],createdAt=before.createdAt;
 const oldHref=await exportVideo(p),oldName=await p.getByRole("link",{name:"MP4",exact:true}).getAttribute("download");assert.equal(oldName,"Interview café 你好-cutmark.mp4");
 await p.getByLabel("Project title",{exact:true}).fill("Edited interview");assert.equal(await p.getByRole("link",{name:"MP4",exact:true}).getAttribute("href"),oldHref);assert.equal(await p.getByRole("link",{name:"MP4",exact:true}).getAttribute("download"),oldName);await p.getByRole("button",{name:/Undo · Rename project/}).click();assert.equal(await p.getByLabel("Project title",{exact:true}).inputValue(),"Interview café 你好");await saved(p);
 const light=path.join(dir,"interview.cutmark.json"),bundle=path.join(dir,"interview.cutmark");
 assert.match(await download(p,"Download project file",light),/\.cutmark\.json$/);assert.match(await download(p,"Download backup with source",bundle),/\.cutmark$/);
 const manifest=JSON.parse(fs.readFileSync(light,"utf8"));assert.equal(manifest.version,1);assert.equal(manifest.source.fileName,"boundary.mp4");assert.equal(manifest.decisions.captions[0].text,"Krish café 你好\nKeep my correction");assert.equal(manifest.source.kind,"original");assert.equal(manifest.decisions.sceneCuts[0].time,1.5);assert.equal(manifest.decisions.sceneCuts[0].confirmed,true);assert.equal(manifest.decisions.editorialMarkers[0].color,"gold");
 assert.equal((await database(p)).projects[0].createdAt,createdAt);
 console.log("PASS named project, rename undo, original filename/output snapshot, creation time and actual lightweight/bundled downloads");

 await p.getByRole("button",{name:"Duplicate project",exact:true}).click();await p.getByRole("button",{name:/Export (video|latest changes)/}).waitFor();await tools(p);await saved(p);
 let db=await database(p);assert.equal(db.projects.length,2);assert.equal(db.assets.length,2,"duplicate does not copy large media");
 const clone=db.projects.find(q=>q.title.endsWith(" copy")),original=db.projects.find(q=>!q.title.endsWith(" copy"));assert.equal(clone.sourceAssetId,original.sourceAssetId);assert.equal(clone.outputAssetId,original.outputAssetId);
 await open(p,"Manage saved projects");await p.getByRole("button",{name:"Delete saved project Interview café 你好",exact:true}).click();await p.getByRole("dialog").getByRole("button",{name:"Delete project",exact:true}).click();
 await p.reload();await p.getByRole("button",{name:"Open project",exact:true}).first().click();await p.getByRole("button",{name:/Export (video|latest changes)/}).waitFor();assert.equal(await p.getByLabel("Caption 1 text",{exact:true}).inputValue(),"Krish café 你好\nKeep my correction");
 await p.getByLabel("Caption 1 text",{exact:true}).fill("Independent duplicate");await exportVideo(p);db=await database(p);assert.equal(db.projects.length,1);assert.equal(db.assets.length,2,"unreferenced old output is collected while shared source survives");assert.equal(db.projects[0].sourceAssetId,original.sourceAssetId);
 console.log("PASS shared-source/output duplication, parent deletion, clone reopening/independent edits and unused-output cleanup");


 const versionTwo=await fresh();await versionTwo.waitForTimeout(200);
 const oldVideo=Array.from(fs.readFileSync(path.join(root,"caption-delivery","compatible-burned-audio.mp4"))),oldSource=Array.from(fs.readFileSync(source));
 await versionTwo.evaluate(async({oldVideo,oldSource,manifest})=>{
  await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase("splice-projects");request.onsuccess=resolve;request.onerror=()=>reject(request.error);});
  await new Promise((resolve,reject)=>{const request=indexedDB.open("splice-projects",2);request.onupgradeneeded=()=>{request.result.createObjectStore("projects",{keyPath:"id"});request.result.createObjectStore("assets",{keyPath:"id"});};request.onerror=()=>reject(request.error);request.onsuccess=()=>{
   const db=request.result,transaction=db.transaction(["projects","assets"],"readwrite");
   transaction.objectStore("projects").put({id:"version-two",schemaVersion:2,title:"Version 2 project",fileName:"boundary.mp4",createdAt:manifest.createdAt,updatedAt:Date.now(),sourceDuration:4,trimStart:1,trimEnd:3,revision:7,exportRevision:7,exportId:"version-two-output",captions:manifest.decisions.captions,captionsVtt:null,captionTimebase:"source",sceneMarkers:[1.5],markerTimebase:"source",duration:2,exportSettings:{width:320,height:180,audio:true,timing:"source",captions:"sidecar",processor:"automatic"}});
   transaction.objectStore("assets").put({id:"version-two",sourceVideo:new Blob([new Uint8Array(oldSource)],{type:"video/mp4"}),video:new Blob([new Uint8Array(oldVideo)],{type:"video/mp4"})});
   transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>reject(transaction.error);
  };});
 },{oldVideo,oldSource,manifest});
 await versionTwo.reload();await versionTwo.getByRole("button",{name:"Open project",exact:true}).click();await versionTwo.getByRole("button",{name:"Export video",exact:true}).waitFor();await saved(versionTwo);
 assert.equal(await versionTwo.getByLabel("Caption 1 text",{exact:true}).inputValue(),manifest.decisions.captions[0].text);assert.ok(await versionTwo.getByRole("link",{name:"MP4",exact:true}).getAttribute("href"));
 const staleClient=await versionTwo.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open("splice-projects",2);request.onerror=event=>{event.preventDefault();resolve(request.error.name);};request.onsuccess=()=>{request.result.close();resolve("unexpected success");};}));
 assert.equal(staleClient,"VersionError");console.log("PASS version-2 combined-asset migration retains source/output/corrections and rejects stale-version clients");
 const recovered=await fresh();await restoreFile(recovered,light);assert.ok(await recovered.getByRole("button",{name:"Restore verified project",exact:true}).isDisabled());
 const wrongDir=path.join(dir,"wrong");fs.mkdirSync(wrongDir,{recursive:true});const wrong=path.join(wrongDir,"boundary.mp4"),bytes=Buffer.from(fs.readFileSync(source));bytes[bytes.indexOf("mdat")+100]^=1;fs.writeFileSync(wrong,bytes);
 await recovered.getByLabel("Relink source video",{exact:true}).setInputFiles(wrong);await recovered.getByRole("alert").filter({hasText:/contents do not match/}).waitFor();assert.equal((await database(recovered)).projects.length,0);
 const renamed=path.join(dir,"renamed-source.mp4");fs.copyFileSync(source,renamed);await recovered.getByLabel("Relink source video",{exact:true}).setInputFiles(renamed);await recovered.getByRole("button",{name:"Restore verified project",exact:true}).waitFor();await recovered.getByRole("button",{name:"Restore verified project",exact:true}).click();
 await recovered.getByRole("button",{name:"Export video",exact:true}).waitFor();await tools(recovered);assert.equal(await recovered.getByLabel("Project title",{exact:true}).inputValue(),"Interview café 你好");assert.equal(await recovered.getByLabel("Clip in time",{exact:true}).inputValue(),"00:00:01.000");assert.equal(await recovered.getByLabel("Caption 1 text",{exact:true}).inputValue(),"Krish café 你好\nKeep my correction");
 await saved(recovered);const recoveredMeta=(await database(recovered)).projects[0];assert.equal(recoveredMeta.createdAt,createdAt);assert.equal(recoveredMeta.captionStyle.background,"plate");assert.equal(recoveredMeta.captionDelivery,"both");assert.equal(recoveredMeta.editorialMarkers[0].note,"Preserve café and pause");assert.equal(recoveredMeta.exportRevision,undefined);assert.equal(recoveredMeta.sceneCuts[0].time,1.5);
 const recoveredHref=await exportVideo(recovered);
 console.log("PASS fresh-session lightweight recovery, same-name wrong-content rejection, renamed exact-source acceptance, restored decisions and a valid new MP4");

 const bundled=await fresh();await restoreFile(bundled,bundle);await bundled.getByText("All source contents and metadata match. Ready to restore as a separate project.",{exact:true}).waitFor();await bundled.getByRole("button",{name:"Restore verified project",exact:true}).click();await bundled.getByRole("button",{name:"Export video",exact:true}).waitFor();await tools(bundled);assert.equal(await bundled.getByLabel("Project title",{exact:true}).inputValue(),"Interview café 你好");assert.equal(await bundled.getByLabel("Caption 1 text",{exact:true}).inputValue(),manifest.decisions.captions[0].text);
 await exportVideo(bundled);console.log("PASS self-contained bundle restores and renders in another empty browser context");

 const corrupt=path.join(dir,"future.cutmark.json"),future={...manifest,version:99};fs.writeFileSync(corrupt,JSON.stringify(future));await restoreFile(recovered,corrupt);await recovered.getByRole("alert").filter({hasText:/format or version is not supported/}).waitFor();assert.equal(await recovered.getByRole("link",{name:"MP4",exact:true}).getAttribute("href"),recoveredHref);
 await restoreFile(recovered,light);
 await recovered.evaluate(()=>{window.originalDigest=crypto.subtle.digest.bind(crypto.subtle);crypto.subtle.digest=(...args)=>new Promise(resolve=>setTimeout(()=>resolve(window.originalDigest(...args)),300));});
 await recovered.getByLabel("Relink source video",{exact:true}).setInputFiles(source);await recovered.getByRole("button",{name:"Cancel backup import",exact:true}).click();await recovered.waitForTimeout(700);assert.equal(await recovered.getByRole("button",{name:"Restore verified project",exact:true}).count(),0);assert.equal(await recovered.getByRole("link",{name:"MP4",exact:true}).getAttribute("href"),recoveredHref);
 await recovered.evaluate(()=>{crypto.subtle.digest=window.originalDigest;});
 await restoreFile(recovered,bundle);await recovered.getByText("All source contents and metadata match. Ready to restore as a separate project.",{exact:true}).waitFor();
 const count=(await database(recovered)).projects.length;
 await recovered.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==="assets")throw new DOMException("Fixture quota","QuotaExceededError");return window.originalPut.apply(this,args);};});
 await recovered.getByRole("button",{name:"Restore verified project",exact:true}).click();await recovered.getByRole("alert").filter({hasText:/storage is full/}).waitFor();assert.equal((await database(recovered)).projects.length,count);assert.equal(await recovered.getByRole("link",{name:"MP4",exact:true}).getAttribute("href"),recoveredHref);assert.equal(await recovered.getByLabel("Caption 1 text",{exact:true}).inputValue(),manifest.decisions.captions[0].text);
 await recovered.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPut;});await recovered.getByRole("button",{name:"Restore verified project",exact:true}).click();await recovered.getByRole("button",{name:"Export video",exact:true}).waitFor();await saved(recovered);assert.equal((await database(recovered)).projects.length,count+1);
 await tools(recovered);await recovered.setViewportSize({width:390,height:844});assert.ok(await recovered.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await recovered.screenshot({path:path.join(dir,"backup-mobile.png"),fullPage:true});
 assert.deepEqual(errors,[]);console.log("PASS unsupported backup, cancellation, quota rollback/retry, preserved prior download, mobile layout and no uncaught browser errors");
 console.log("Artifacts: "+dir);
}catch(error){for(let i=0;i<contexts.length;i++){const p=contexts[i].pages()[0];await p.screenshot({path:path.join(dir,"failure-"+i+".png"),fullPage:true});console.log((await p.locator("body").innerText()).slice(-6500));}console.log(errors);throw error;}finally{await browser.close();}
