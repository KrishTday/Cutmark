import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {openEditingTools,openPlaybackOptions} from "./workspace-ui.mjs";
const {chromium}=createRequire(import.meta.url)(process.env.CUTMARK_PLAYWRIGHT_PATH||"playwright");
const root=process.env.CUTMARK_ARTIFACTS,dir=path.join(root,"workspace");fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:"msedge",headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on("pageerror",error=>errors.push(error.message));
const url=process.env.CUTMARK_TEST_URL||"http://127.0.0.1:4174";
async function screenshot(name){await page.screenshot({path:path.join(dir,name+".png"),fullPage:true});}
async function field(label,value){const input=page.getByLabel(label,{exact:true});await input.fill(value);await input.press("Tab");}
async function fits(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
try{
 await page.goto(url);await page.getByLabel("Source video file",{exact:true}).setInputFiles(path.join(root,"boundary.mp4"));await page.getByRole("button",{name:"Export video",exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector("video")?.readyState>=2);
 assert.equal(await page.getByText("More editing tools",{exact:true}).evaluate(e=>e.parentElement.open),false);
 assert.equal(await page.getByText("Playback options",{exact:true}).evaluate(e=>e.parentElement.open),false);
 assert.equal(await page.getByRole("button",{name:"Play preview",exact:true}).isVisible(),true);
 assert.equal(await page.getByLabel("Search captions",{exact:true}).count(),0);
 assert.equal(await page.getByLabel("Preview playback speed",{exact:true}).isVisible(),false);
 assert.ok((await page.getByRole("button",{name:"Export video",exact:true}).boundingBox()).y<240,"export stays in the project header");
 await screenshot("desktop-trim");
 await field("Clip in time","00:00:00.500");await field("Clip out time","00:00:01.500");
 await page.getByRole("button",{name:"Add caption",exact:true}).click();await page.getByLabel("Caption 1 text",{exact:true}).fill("Keep the words clear. Café 你好");
 await page.getByText("Saved in this browser",{exact:true}).first().waitFor();
 await screenshot("desktop-captions");
 await openEditingTools(page);await page.locator("summary").filter({hasText:/^Framing and audio/}).click();assert.equal(await page.getByLabel("Output aspect ratio",{exact:true}).isVisible(),true);await page.getByText("More editing tools",{exact:true}).click();
 await openPlaybackOptions(page);await page.getByLabel("Preview playback speed",{exact:true}).selectOption("1.5");await page.getByLabel("Preview volume",{exact:true}).fill("0.5");await page.getByText("Playback options",{exact:true}).click();assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),"Keep the words clear. Café 你好");
 assert.equal(await page.getByLabel("Clip in time",{exact:true}).inputValue(),"00:00:00.500");
 await page.setViewportSize({width:390,height:844});await page.getByRole("navigation",{name:"Editing tools",exact:true}).getByRole("button",{name:"Captions",exact:true}).click();await fits();await screenshot("mobile-captions");
 await page.getByRole("navigation",{name:"Editing tools",exact:true}).getByRole("button",{name:"Trim",exact:true}).click();await fits();assert.ok(await page.locator(".timeline-ruler").evaluate(ruler=>{const labels=[...ruler.children].filter(label=>getComputedStyle(label).display!=="none").map(label=>label.getBoundingClientRect());return labels.every((label,index)=>index===0||label.left>=labels[index-1].right-1);}),"mobile ruler labels do not overlap");await screenshot("mobile-trim");
 assert.equal(await page.getByLabel("Clip out time",{exact:true}).inputValue(),"00:00:01.500");
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.style.zoom="2");await screenshot("zoom-200");assert.ok(await page.evaluate(()=>document.body.getBoundingClientRect().right<=innerWidth+1));await page.evaluate(()=>document.documentElement.style.zoom="");
 await page.reload();await page.getByRole("button",{name:/^Open project(?::|$)/}).click();await page.getByLabel("Caption 1 text",{exact:true}).waitFor();assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),"Keep the words clear. Café 你好");assert.equal(await page.getByLabel("Clip in time",{exact:true}).inputValue(),"00:00:00.500");
 assert.deepEqual(errors,[]);console.log("PASS focused default controls, accessible advanced/playback disclosures, visible export, caption/range preservation, desktop/mobile/zoom and reopen");
}finally{await browser.close();}
