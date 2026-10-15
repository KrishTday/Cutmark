import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.CUTMARK_PLAYWRIGHT_PATH||"playwright");
const root=process.env.CUTMARK_ARTIFACTS;if(!root)throw new Error("Set CUTMARK_ARTIFACTS to the existing verification fixtures.");
const artifacts=path.join(root,"caption-delivery");fs.mkdirSync(artifacts,{recursive:true});
const browser=await chromium.launch({channel:"msedge",headless:true}),context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
const url=process.env.CUTMARK_TEST_URL||"http://127.0.0.1:4174";
async function input(label,value){const field=page.getByLabel(label,{exact:true});await field.fill(value);await field.press("Tab");}
async function saved(){await page.getByText("Saved in this browser",{exact:true}).first().waitFor();}
async function seek(time){await page.locator("video").first().evaluate((video,time)=>{video.pause();video.currentTime=time},time);await page.waitForFunction(time=>{const v=document.querySelector("video");return !v.seeking&&Math.abs(v.currentTime-time)<.001},time);await page.waitForTimeout(100);}
async function meta(){return page.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open("splice-projects",7);open.onsuccess=()=>{const db=open.result,q=db.transaction("projects","readonly").objectStore("projects").getAll();q.onsuccess=()=>{db.close();resolve(q.result.sort((a,b)=>b.updatedAt-a.updatedAt)[0]);};};}));}
async function exportVideo(name){
  await page.getByRole("button",{name:/Export (video|latest changes)/}).click();
  await page.getByRole("button",{name:"Export video",exact:true}).waitFor({timeout:120000});
  const link=page.getByRole("link",{name:"MP4",exact:true}),href=await link.getAttribute("href");
  const bytes=await link.evaluate(async link=>Array.from(new Uint8Array(await(await fetch(link.href)).arrayBuffer())));
  const output=path.join(artifacts,name);fs.writeFileSync(output,Buffer.from(bytes));await saved();return {output,href};
}
function frame(file,time,width,height){return execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-ss",String(time),"-i",file,"-frames:v","1","-vf","scale="+width+":"+height,"-pix_fmt","rgba","-f","rawvideo","-"]);}
async function expected(){
  return page.getByLabel("Styled caption preview",{exact:true}).evaluate(layer=>{
    const source=document.querySelector("video"),canvas=document.createElement("canvas");canvas.width=layer.width;canvas.height=layer.height;
    const ctx=canvas.getContext("2d");ctx.drawImage(source,0,0,canvas.width,canvas.height);ctx.drawImage(layer,0,0);
    return {width:canvas.width,height:canvas.height,pixels:Array.from(ctx.getImageData(0,0,canvas.width,canvas.height).data),alpha:Array.from(layer.getContext("2d").getImageData(0,0,layer.width,layer.height).data).filter((_,index)=>index%4===3)};
  });
}
function similarity(expected,actual){
  let reference=0,delivered=0,intersection=0;
  for(let index=0;index<expected.alpha.length;index++){
    if(expected.alpha[index]<100)continue;const offset=index*4;
    const a=expected.pixels[offset]>170&&expected.pixels[offset+1]>170&&expected.pixels[offset+2]>170;
    const b=actual[offset]>170&&actual[offset+1]>170&&actual[offset+2]>170;
    if(a)reference++;if(b)delivered++;if(a&&b)intersection++;
  }
  assert.ok(reference>10,"preview contains real rendered glyphs");return 2*intersection/(reference+delivered);
}
// Seven-pixel glyphs are sensitive to H.264 quantization. Allow one output pixel;
// normal-sized footage still uses exact-position white-ink F1.
function tinyGlyphAgreement(expected,actual){
  const ink=(pixels)=>new Set(expected.alpha.flatMap((alpha,index)=>alpha>=100&&Math.min(...pixels.slice(index*4,index*4+3))>130?[index]:[]));
  const reference=ink(expected.pixels),delivered=ink(actual);
  const near=(index,set)=>{const x=index%expected.width,y=Math.floor(index/expected.width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<expected.width&&y+dy>=0&&y+dy<expected.height&&set.has((y+dy)*expected.width+x+dx))return true;return false;};
  assert.ok(reference.size>100&&delivered.size>100);
  return ([...reference].filter(index=>near(index,delivered)).length+[...delivered].filter(index=>near(index,reference)).length)/(reference.size+delivered.size);
}
async function styleOpen(){const panel=page.getByText("Caption style and delivery",{exact:true});if(!(await panel.evaluate(summary=>summary.parentElement.open)))await panel.click();}
async function visibleInk(){await page.waitForFunction(()=>{const c=document.querySelector('canvas[aria-label="Styled caption preview"]');if(!c)return false;const p=c.getContext("2d").getImageData(0,0,c.width,c.height).data;return p.some((value,index)=>index%4===3&&value>100)});}
try{
 await page.goto(url);await page.getByLabel("Source video file",{exact:true}).setInputFiles(path.join(root,"no-audio.mp4"));await page.getByRole("button",{name:"Export video",exact:true}).waitFor();await saved();
 await input("Clip in time","1");await input("Clip out time","3");
 await page.getByRole("button",{name:"Add caption",exact:true}).click();await page.getByLabel("Caption 1 text",{exact:true}).fill("Keep my correction");
 const srt=path.join(artifacts,"import.srt");fs.writeFileSync(srt,"\uFEFF1\r\n00:00:00,100 --> 00:00:01,900\r\nKrish café 你好\r\nLongWordWithoutSpacesABCDEFGHIJKLMNO\r\n\r\n2\r\n00:60:00,000 --> 01:01:00,000\r\nMalformed", "utf8");
 await page.getByText("Import SRT or VTT",{exact:true}).click();await page.getByLabel("Subtitle file",{exact:true}).setInputFiles(srt);
 await page.getByLabel("Subtitle timestamp basis",{exact:true}).selectOption("selection");await page.getByLabel("Subtitle import action",{exact:true}).selectOption("replace");
 assert.equal(await page.getByRole("button",{name:"Replace captions from file",exact:true}).isDisabled(),true);
 assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),"Keep my correction");
 await page.getByLabel("Accept subtitle import warnings",{exact:true}).check();await page.getByRole("button",{name:"Replace captions from file",exact:true}).click();
 assert.equal(await page.getByLabel("Caption 1 start time",{exact:true}).inputValue(),"00:00:01.100");
 await page.getByRole("button",{name:/Undo · Replace captions from file/}).click();assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),"Keep my correction");
 await page.getByRole("button",{name:"Redo",exact:true}).click();
 const words=await page.getByLabel("Caption 1 text",{exact:true}).inputValue();assert.match(words,/你好/);
 assert.match(decodeURIComponent(await page.getByRole("link",{name:"Current subtitles (.vtt)",exact:true}).getAttribute("href")),/00:00:00.100 --> 00:00:01.900/);
 console.log("PASS reviewed SRT import, malformed-block warning, selection/source mapping, replace undo and current VTT export");
 const vtt=path.join(artifacts,"append.vtt");fs.writeFileSync(vtt,"WEBVTT\n\n00:00:03.100 --> 00:00:03.900\nOutside trim café &amp; 你好");
 await page.getByLabel("Subtitle file",{exact:true}).setInputFiles(vtt);await page.getByLabel("Subtitle timestamp basis",{exact:true}).selectOption("source");await page.getByLabel("Subtitle import action",{exact:true}).selectOption("append");
 await page.getByRole("button",{name:"Append imported captions",exact:true}).click();
 assert.equal(await page.getByLabel("Caption 2 text",{exact:true}).inputValue(),"Outside trim café & 你好");assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),words);
 await page.getByRole("button",{name:/Undo · Import subtitle cues/}).click();
 fs.writeFileSync(vtt,"WEBVTT\n\n00:00:03.100 --> 00:00:05.000\nOut of source");await page.getByLabel("Subtitle file",{exact:true}).setInputFiles(vtt);
 await page.getByRole("alert").filter({hasText:/exceed the chosen time basis/}).waitFor();assert.ok(await page.getByRole("button",{name:"Append imported captions",exact:true}).isDisabled());
 const invalid=path.join(artifacts,"invalid.srt");fs.writeFileSync(invalid,Buffer.from([255,1,254]));await page.getByLabel("Subtitle file",{exact:true}).setInputFiles(invalid);await page.getByRole("alert").filter({hasText:/encoding/}).waitFor();
 assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),words);
 console.log("PASS VTT source-time append, Unicode entity decoding, undo and rejected encoding/out-of-source imports preserve corrections");

 await styleOpen();await page.getByLabel("Caption style preset",{exact:true}).selectOption("contrast");await page.getByLabel("Caption font",{exact:true}).selectOption("mono");await input("Caption text size","7");await page.getByLabel("Caption placement",{exact:true}).selectOption("middle");
 await seek(1.5);await visibleInk();const reference=await expected();
 // Prove that subtitle-file delivery does not alter video pixels even while the style preview is visible.
 await page.route("**/ffmpeg/**",route=>route.abort());await page.route("**/ffmpeg-mt/**",route=>route.abort());
 const plain=await exportVideo("sidecar.mp4");const plainPixels=frame(plain.output,.5,320,180);
 assert.ok(!Array.from(plainPixels).some((_,index)=>index%4===0&&plainPixels[index]>170&&plainPixels[index+1]>170&&plainPixels[index+2]>170));
 await page.getByLabel("Caption delivery",{exact:true}).selectOption("both");const burned=await exportVideo("native-burned.mp4");
 await page.getByLabel("Use native caption preview",{exact:true}).check();assert.ok(await page.getByLabel("Styled caption preview",{exact:true}).isHidden());assert.equal(await page.locator("video").first().evaluate(video=>video.textTracks[0].mode),"showing");await page.getByLabel("Use native caption preview",{exact:true}).uncheck();await visibleInk();
 const score=similarity(reference,frame(burned.output,.5,320,180));assert.ok(score>.8,"native caption glyph/layout agreement: "+score);
 let record=await meta();assert.equal(record.exportSettings.captions,"both");assert.equal(record.exportSettings.captionStyle.font,"mono");assert.equal(record.captions[0].text,words);
 for(const time of [0,1.95]){const pixels=frame(burned.output,time,320,180);assert.ok(!Array.from(pixels).some((_,index)=>index%4===0&&pixels[index]>170&&pixels[index+1]>170&&pixels[index+2]>170),"caption remains inside half-open cue interval");}
 await page.screenshot({path:path.join(artifacts,"styled-preview.png"),fullPage:true});
 console.log("PASS actual native MP4 caption pixels match shared preview layout; sidecar video stays plain and cue boundaries remain half-open");

 await page.getByLabel("Caption font",{exact:true}).selectOption("sans");
 await page.route("**/fonts/*",route=>route.abort());await page.getByRole("button",{name:"Export latest changes",exact:true}).click();
 await page.getByRole("alert").filter({hasText:/caption font could not load/}).waitFor({timeout:30000});
 assert.equal(await page.getByRole("link",{name:"MP4",exact:true}).getAttribute("href"),burned.href);assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),words);
 await page.unroute("**/fonts/*");const retried=await exportVideo("font-retry.mp4");
 await page.route("**/fonts/*",async route=>{await new Promise(resolve=>setTimeout(resolve,1000));await route.continue()});
 await page.getByLabel("Caption placement",{exact:true}).selectOption("top");await page.getByRole("button",{name:"Export latest changes",exact:true}).click();await page.getByRole("button",{name:"Cancel",exact:true}).click();await page.waitForTimeout(1200);
 assert.equal(await page.getByRole("link",{name:"MP4",exact:true}).getAttribute("href"),retried.href);
 await page.unroute("**/fonts/*");await page.unroute("**/ffmpeg/**");await page.unroute("**/ffmpeg-mt/**");
 await saved();await page.reload();await page.getByRole("button",{name:"Open project",exact:true}).first().click();await styleOpen();
 assert.equal(await page.getByLabel("Caption delivery",{exact:true}).inputValue(),"both");assert.equal(await page.getByLabel("Caption placement",{exact:true}).inputValue(),"top");assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),words);
 console.log("PASS font failure/cancel retain prior validated MP4; retry and saved caption styles/words survive reopening");

 await page.getByRole("button",{name:"New video",exact:true}).click();await page.getByLabel("Source video file",{exact:true}).setInputFiles(path.join(root,"boundary.mp4"));await page.getByRole("button",{name:"Export video",exact:true}).waitFor();
 await input("Clip in time","1");await input("Clip out time","3");await page.getByRole("button",{name:"Add caption",exact:true}).click();
 await input("Caption 1 start time","1.1");await input("Caption 1 end time","2.9");await page.getByLabel("Caption 1 text",{exact:true}).fill("Audio remains café 你好");
 await styleOpen();await page.getByLabel("Caption style preset",{exact:true}).selectOption("contrast");await page.getByLabel("Caption delivery",{exact:true}).selectOption("burned");await page.getByLabel("Bold",{exact:true}).check();await page.getByLabel("Shadow",{exact:true}).check();await input("Caption outline size","3");await page.getByLabel("Caption alignment",{exact:true}).selectOption("right");await page.getByLabel("Caption placement",{exact:true}).selectOption("top");
 await page.getByText("Export and storage details",{exact:true}).click();await page.getByLabel("Use compatible processor for the next export",{exact:true}).check();
 await seek(1.5);await visibleInk();const audioReference=await expected(),fallback=await exportVideo("compatible-burned-audio.mp4");
 const audioMeta=JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-of","json",fallback.output],{encoding:"utf8"}));
 assert.ok(audioMeta.streams.some(track=>track.codec_type==="audio"));assert.ok(similarity(audioReference,frame(fallback.output,.5,320,180))>.75);
 console.log("PASS compatible source preparation plus shared caption rendering retains real audio and layout");

 await page.getByRole("button",{name:"New video",exact:true}).click();await page.getByLabel("Source video file",{exact:true}).setInputFiles(path.join(root,"portrait.mp4"));await page.getByRole("button",{name:"Export video",exact:true}).waitFor();
 await page.getByRole("button",{name:"Add caption",exact:true}).click();await page.getByLabel("Caption 1 text",{exact:true}).fill("Vertical café 你好");await styleOpen();
 await page.getByLabel("Caption style preset",{exact:true}).selectOption("contrast");await input("Caption text size","8");await page.getByLabel("Caption delivery",{exact:true}).selectOption("burned");
 await seek(.5);await visibleInk();const portraitReference=await expected(),portrait=await exportVideo("portrait-burned.mp4");
 const portraitMeta=JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-of","json",portrait.output],{encoding:"utf8"}));
 assert.equal(portraitMeta.streams[0].width,90);assert.equal(portraitMeta.streams[0].height,160);
 assert.ok(tinyGlyphAgreement(portraitReference,frame(portrait.output,.5,90,160))>.95,"seven-pixel glyphs agree within one codec pixel");
 const largePortrait=path.join(artifacts,"portrait-360.mp4");
 execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","color=c=green:s=360x640:r=30:d=2","-c:v","libx264","-pix_fmt","yuv420p",largePortrait]);
 await page.getByRole("button",{name:"New video",exact:true}).click();await page.getByLabel("Source video file",{exact:true}).setInputFiles(largePortrait);await page.getByRole("button",{name:"Export video",exact:true}).waitFor();
 await page.getByRole("button",{name:"Add caption",exact:true}).click();const portraitWords="Vertical café 你好\nLongWordWithoutSpacesABCDEFGHIJKLMNO";
 await page.getByLabel("Caption 1 text",{exact:true}).fill(portraitWords);await styleOpen();await page.getByLabel("Caption style preset",{exact:true}).selectOption("contrast");await input("Caption text size","8");await page.getByLabel("Caption delivery",{exact:true}).selectOption("burned");
 await seek(.5);await visibleInk();const largeReference=await expected(),large=await exportVideo("portrait-360-burned.mp4");
 const largeScore=similarity(largeReference,frame(large.output,.5,360,640));assert.ok(largeScore>.85,"normal-sized portrait Unicode, multiline and long-word glyph agreement: "+largeScore);
 await page.getByLabel("Caption 1 text",{exact:true}).fill(Array(100).fill("Does not fit").join("\n"));await page.getByRole("button",{name:"Export latest changes",exact:true}).click();await page.getByRole("alert").filter({hasText:/caption does not fit/}).waitFor();
 assert.equal(await page.getByRole("link",{name:"MP4",exact:true}).getAttribute("href"),large.href);
 await page.getByRole("button",{name:/Undo ·/}).click();assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),portraitWords);
 await exportVideo("portrait-360-retry.mp4");await page.getByText("Caption style and delivery",{exact:true}).click();
 console.log("PASS normal-sized portrait multiline wrapping, tiny-frame codec tolerance, native accessibility preview and overflow retaining previous output");
 await page.setViewportSize({width:390,height:844});await page.getByRole("navigation",{name:"Editing tools",exact:true}).getByRole("button",{name:"Captions",exact:true}).click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(artifacts,"portrait-mobile.png"),fullPage:true});
 assert.deepEqual(errors,[]);console.log("PASS portrait MP4 dimensions, readable safe-area style parity, mobile layout and no uncaught browser errors");
 console.log("Artifacts: "+artifacts);
}catch(error){await page.screenshot({path:path.join(artifacts,"failure.png"),fullPage:true});console.log((await page.locator("body").innerText()).slice(-9000));console.log("Browser errors:",errors);throw error;}
finally{await browser.close();}
