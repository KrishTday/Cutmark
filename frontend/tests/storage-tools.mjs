import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.CUTMARK_PLAYWRIGHT_PATH||"playwright"),root=process.env.CUTMARK_ARTIFACTS;
if(!root)throw new Error("Set CUTMARK_ARTIFACTS.");
const dir=path.join(root,"storage-tools");fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:"msedge",headless:true}),page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on("pageerror",e=>errors.push(e.message));
async function open(name){const summary=page.getByText(name,{exact:true});if(!(await summary.evaluate(e=>e.parentElement.open)))await summary.click();}
async function state(){return page.evaluate(()=>new Promise(resolve=>{const req=indexedDB.open("splice-projects",7);req.onsuccess=()=>{const db=req.result,t=db.transaction(["projects","assets"]),p=t.objectStore("projects").getAll(),a=t.objectStore("assets").getAllKeys();t.oncomplete=()=>{db.close();resolve({projects:p.result,assets:a.result});};};}));}
async function keys(){return page.evaluate(async()=>{const result={};for(const name of await caches.keys()){const cache=await caches.open(name);result[name]=(await cache.keys()).map(key=>key.url).sort();}return result;});}
const english=["https://huggingface.co/onnx-community/whisper-tiny.en/resolve/main/config.json","https://huggingface.co/onnx-community/whisper-tiny.en/resolve/main/onnx/encoder_model_quantized.onnx"];
try{
 await page.goto(process.env.CUTMARK_TEST_URL||"http://127.0.0.1:4174");await page.getByLabel("Source video file",{exact:true}).setInputFiles(path.join(root,"boundary.mp4"));await page.getByRole("button",{name:"Export video",exact:true}).waitFor();
 await page.getByRole("button",{name:"Add caption",exact:true}).click();await page.getByLabel("Caption 1 text",{exact:true}).fill("Saved café 你好");
 await page.getByRole("button",{name:"Export video",exact:true}).click();await page.getByRole("button",{name:"Export video",exact:true}).waitFor();await page.getByText("Saved in this browser",{exact:true}).first().waitFor();
 const before=await state(),href=await page.getByRole("link",{name:"MP4",exact:true}).getAttribute("href");
 await page.evaluate(async english=>{
  const cache=await caches.open("transformers-cache");
  for(const url of [...english,"https://huggingface.co/onnx-community/whisper-tiny/resolve/main/config.json","https://example.com/onnx-community/whisper-tiny.en/config.json"]){const body="fixture model data";await cache.put(url,new Response(body,{headers:{"content-length":String(body.length)}}));}
  const other=await caches.open("other-cache");await other.put(location.origin+"/unrelated",new Response("keep this"));
  Object.defineProperty(navigator.storage,"persisted",{value:async()=>false,configurable:true});
  Object.defineProperty(navigator.storage,"persist",{value:async()=>false,configurable:true});
 },english);
 const originalKeys=await keys();await open("Export and storage details");await open("Manage saved projects");await open("Storage and model cache");await page.getByText(/English model cache: 2 files/).waitFor();
 assert.ok(await page.getByText(/Saved source references: 1/).isVisible());assert.ok(await page.getByText(/Rendered output references: 1/).isVisible());
 await page.getByRole("button",{name:"Remove cached English model",exact:true}).click();await page.getByText(/English model cache: 0 files/).waitFor();
 const afterKeys=await keys();assert.deepEqual(afterKeys["transformers-cache"],originalKeys["transformers-cache"].filter(url=>!english.includes(url)));assert.deepEqual(afterKeys["other-cache"],originalKeys["other-cache"]);
 const after=await state();assert.deepEqual(after.assets,before.assets);assert.equal(after.projects[0].revision,before.projects[0].revision);assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),"Saved café 你好");assert.equal(await page.getByRole("link",{name:"MP4",exact:true}).getAttribute("href"),href);
 console.log("PASS targeted English-model cleanup preserves unrelated caches, saved metadata/media, corrected captions and the prior MP4");

 await page.evaluate(async english=>{const cache=await caches.open("transformers-cache");for(const url of english)await cache.put(url,new Response("fixture model data",{headers:{"content-length":"18"}}));window.originalDelete=Cache.prototype.delete;Cache.prototype.delete=function(...args){return new Promise(resolve=>setTimeout(()=>resolve(window.originalDelete.apply(this,args)),200));};},english);
 await page.getByRole("button",{name:"Refresh storage information",exact:true}).click();await page.getByText(/English model cache: 2 files/).waitFor();await page.getByRole("button",{name:"Remove cached English model",exact:true}).click();await page.getByRole("button",{name:"Cancel model cleanup",exact:true}).click();await page.getByText(/Model cleanup cancelled/).waitFor();await page.waitForTimeout(400);
 const remaining=(await keys())["transformers-cache"].filter(url=>english.includes(url));assert.ok(remaining.length>=1&&remaining.length<=2);assert.equal(await page.getByRole("link",{name:"MP4",exact:true}).getAttribute("href"),href);
 await page.evaluate(()=>{Cache.prototype.delete=window.originalDelete;});
 await page.getByRole("button",{name:"Request browser storage retention",exact:true}).click();await page.getByText(/browser did not grant persistent storage/).waitFor();
 await page.evaluate(()=>{Object.defineProperty(navigator.storage,"persist",{value:async()=>true,configurable:true});});
 await page.getByRole("button",{name:"Request browser storage retention",exact:true}).click();await page.getByText(/browser granted persistent storage/).waitFor();assert.ok(await page.getByRole("button",{name:"Request browser storage retention",exact:true}).isDisabled());
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(dir,"storage-mobile.png"),fullPage:true});
 assert.deepEqual(errors,[]);console.log("PASS cache cancellation, explicitly requested retention grant/denial handling, responsive storage controls and no uncaught browser errors");
}catch(error){await page.screenshot({path:path.join(dir,"failure.png"),fullPage:true});console.log((await page.locator("body").innerText()).slice(-7000));console.log(errors);throw error;}finally{await browser.close();}
