import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
const {chromium}=createRequire(import.meta.url)(process.env.CUTMARK_PLAYWRIGHT_PATH||"playwright");
const root=process.env.CUTMARK_ARTIFACTS;if(!root)throw new Error("Set CUTMARK_ARTIFACTS.");
const dir=path.join(root,"export-settings");fs.mkdirSync(dir,{recursive:true});
const fixture=path.join(dir,"detailed-source.mp4");
execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","testsrc2=s=1280x720:r=24:d=2","-f","lavfi","-i","sine=frequency=440:sample_rate=48000:duration=2","-c:v","libx264","-crf","12","-colorspace","bt709","-color_primaries","bt709","-color_trc","bt709","-c:a","aac","-pix_fmt","yuv420p",fixture]);
const browser=await chromium.launch({channel:"msedge",headless:true}),page=await browser.newPage({viewport:{width:1366,height:900}});
const errors=[];page.on("pageerror",e=>errors.push(e.message));
const url=process.env.CUTMARK_TEST_URL||"http://127.0.0.1:4174";
const input=async(label,value)=>{const field=page.getByLabel(label,{exact:true});await field.fill(value);await field.press("Tab");};
async function openSettings(){const summary=page.locator("summary").filter({hasText:/^Export settings ·/});if(!(await summary.evaluate(e=>e.parentElement.open)))await summary.click();}
async function exportVideo(name){
 await page.getByRole("button",{name:/Export (video|latest changes)/}).click();await page.getByRole("button",{name:"Export video",exact:true}).waitFor({timeout:120000});
 const link=page.getByRole("link",{name:"MP4",exact:true}),href=await link.getAttribute("href");
 const bytes=await link.evaluate(async e=>Array.from(new Uint8Array(await(await fetch(e.href)).arrayBuffer()))),file=path.join(dir,name);
 fs.writeFileSync(file,Buffer.from(bytes));const metadata=JSON.parse(execFileSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",file],{encoding:"utf8"}));
 return {file,metadata,href,size:bytes.length};
}
function pixels(file,time,width=1280,height=720){return execFileSync("ffmpeg",["-v","error","-ss",String(time),"-i",file,"-frames:v","1","-vf","scale="+width+":"+height,"-pix_fmt","rgb24","-f","rawvideo","-"],{maxBuffer:16*1024*1024});}
function psnr(a,b){let squared=0;for(let i=0;i<a.length;i++)squared+=(a[i]-b[i])**2;return 10*Math.log10(255**2/(squared/a.length));}
async function meta(){return page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open("splice-projects",7);request.onsuccess=()=>{const db=request.result,q=db.transaction("projects").objectStore("projects").getAll();q.onsuccess=()=>{db.close();resolve(q.result.sort((a,b)=>b.updatedAt-a.updatedAt)[0]);};};}));}
async function seek(time){await page.locator("video").first().evaluate((video,t)=>{video.pause();video.currentTime=t},time);await page.waitForTimeout(150);}
try{
 await page.goto(url);await page.getByLabel("Source video file",{exact:true}).setInputFiles(fixture);await page.getByRole("button",{name:"Export video",exact:true}).waitFor();
 await input("Clip in time","0.25");await input("Clip out time","1.75");await page.getByText("Export and storage details",{exact:true}).click();await openSettings();
 const reference=pixels(fixture,.75);
 const sizes={};
 for(const compatible of [false,true]){
  await page.getByLabel("Use compatible processor for the next export",{exact:true}).setChecked(compatible);
  if(!compatible){await page.route("**/ffmpeg/**",r=>r.abort());await page.route("**/ffmpeg-mt/**",r=>r.abort());}
  const outputs={};
  for(const quality of ["smaller","high"]){
   await page.getByLabel("Export quality",{exact:true}).selectOption(quality);outputs[quality]=await exportVideo((compatible?"compatible":"native")+"-"+quality+".mp4");
   const video=outputs[quality].metadata.streams.find(t=>t.codec_type==="video");
   assert.equal(video.width,1280);assert.equal(video.height,720);assert.equal(video.avg_frame_rate,"24/1");assert.ok(outputs[quality].metadata.streams.some(t=>t.codec_type==="audio"));assert.ok(Math.abs(Number(outputs[quality].metadata.format.duration)-1.5)<.1);
  }
  const small=psnr(reference,pixels(outputs.smaller.file,.5)),high=psnr(reference,pixels(outputs.high.file,.5));
  assert.ok(outputs.high.size>outputs.smaller.size*1.1,"quality changes actual file size");assert.ok(high>small+.5,"high quality improves measured detail: "+JSON.stringify({small,high}));
  sizes[compatible?"compatible":"native"]={small:outputs.smaller.size,high:outputs.high.size,smallPsnr:small,highPsnr:high};
  if(!compatible){await page.unroute("**/ffmpeg/**");await page.unroute("**/ffmpeg-mt/**");}
 }
 console.log("PASS real file-size/detail policies in both processors: "+JSON.stringify(sizes));
 await page.getByLabel("Export preset",{exact:true}).selectOption("smaller");assert.equal(await page.getByLabel("Export resolution",{exact:true}).inputValue(),"720");assert.equal(await page.getByLabel("Export quality",{exact:true}).inputValue(),"smaller");await page.getByLabel("Export quality",{exact:true}).selectOption("high");
 await page.getByRole("button",{name:"Add caption",exact:true}).click();await page.getByLabel("Caption 1 text",{exact:true}).fill("Scaled café 你好");
 await page.getByText("Caption style and delivery",{exact:true}).click();await page.getByLabel("Caption style preset",{exact:true}).selectOption("contrast");await page.getByLabel("Caption delivery",{exact:true}).selectOption("burned");
 await page.getByLabel("Export resolution",{exact:true}).selectOption("480");await page.getByLabel("Export audio",{exact:true}).selectOption("omit");
 for(const compatible of [false,true]){
  await page.getByLabel("Use compatible processor for the next export",{exact:true}).setChecked(compatible);await seek(.75);
  await page.waitForFunction(()=>{const c=document.querySelector('canvas[aria-label="Styled caption preview"]');return c.width===854&&c.height===480});
  const expected=await page.getByLabel("Styled caption preview",{exact:true}).evaluate(c=>{
    const pixels=c.getContext("2d").getImageData(0,0,c.width,c.height).data;
    const composed=document.createElement("canvas");composed.width=c.width;composed.height=c.height;const ctx=composed.getContext("2d");
    ctx.drawImage(document.querySelector("video"),0,0,c.width,c.height);ctx.drawImage(c,0,0);
    return {pixels:Array.from(ctx.getImageData(0,0,c.width,c.height).data),alpha:Array.from(pixels).filter((_,index)=>index%4===3)};
  });
  const output=await exportVideo((compatible?"compatible":"native")+"-480-muted-caption.mp4"),video=output.metadata.streams.find(t=>t.codec_type==="video");
  assert.equal(video.width,854);assert.equal(video.height,480);assert.ok(!output.metadata.streams.some(t=>t.codec_type==="audio"));
  const actual=pixels(output.file,.5,854,480);let reference=0,delivered=0,intersection=0;
  for(let i=0;i<854*480;i++){if(expected.alpha[i]<100)continue;const a=Math.min(...expected.pixels.slice(i*4,i*4+3))>170,b=Math.min(...actual.slice(i*3,i*3+3))>170;if(a)reference++;if(b)delivered++;if(a&&b)intersection++;}
  const score=2*intersection/(reference+delivered);console.log("Caption agreement",compatible,score,reference,delivered);fs.writeFileSync(path.join(dir,(compatible?"compatible":"native")+"-preview.rgba"),Buffer.from(expected.pixels));assert.ok(reference>50&&score>.8,"output-size caption layout matches preview: "+score);
 }
 await page.getByText("Saved in this browser",{exact:true}).first().waitFor();const record=await meta();assert.equal(record.exportPreferences.resolution,"480");assert.equal(record.exportSettings.preferences.audio,"omit");assert.equal(record.exportMetadata.width,854);assert.equal(record.exportMetadata.hasAudio,false);
 await page.getByLabel("Export preset",{exact:true}).selectOption("source");assert.equal(await page.getByLabel("Export audio",{exact:true}).inputValue(),"keep");
 await page.getByRole("button",{name:/Undo · Apply export preset/}).click();assert.equal(await page.getByLabel("Export audio",{exact:true}).inputValue(),"omit");
 await page.getByText("Saved in this browser",{exact:true}).first().waitFor();await page.reload();await page.getByRole("button",{name:"Open project",exact:true}).first().click();await page.getByText("Export and storage details",{exact:true}).click();await openSettings();
 assert.equal(await page.getByLabel("Export resolution",{exact:true}).inputValue(),"480");assert.equal(await page.getByLabel("Export audio",{exact:true}).inputValue(),"omit");assert.equal(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),"Scaled café 你好");
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(dir,"settings-mobile.png"),fullPage:true});
 await page.setViewportSize({width:1366,height:900});
 const portraitSource=path.join(dir,"portrait-source.mp4");
 execFileSync("ffmpeg",["-v","error","-y","-f","lavfi","-i","color=c=green:s=720x1280:r=24:d=2","-c:v","libx264","-pix_fmt","yuv420p",portraitSource]);
 await page.getByRole("button",{name:"New video",exact:true}).click();await page.getByLabel("Source video file",{exact:true}).setInputFiles(portraitSource);await page.getByRole("button",{name:"Export video",exact:true}).waitFor();
 await page.getByRole("button",{name:"Add caption",exact:true}).click();await page.getByLabel("Caption 1 text",{exact:true}).fill("Portrait café 你好\nWords wrap in a vertical clip");
 await page.getByText("Caption style and delivery",{exact:true}).click();await page.getByLabel("Caption style preset",{exact:true}).selectOption("contrast");await page.getByLabel("Caption delivery",{exact:true}).selectOption("burned");
 await page.getByText("Export and storage details",{exact:true}).click();await openSettings();await page.getByLabel("Export resolution",{exact:true}).selectOption("480");await page.getByLabel("Export quality",{exact:true}).selectOption("high");
 for(const compatible of [false,true]){
  await page.getByLabel("Use compatible processor for the next export",{exact:true}).setChecked(compatible);await seek(.5);
  await page.waitForFunction(()=>{const c=document.querySelector('canvas[aria-label="Styled caption preview"]');return c.width===480&&c.height===854});
  const expected=await page.getByLabel("Styled caption preview",{exact:true}).evaluate(c=>{const layer=c.getContext("2d").getImageData(0,0,c.width,c.height).data,composed=document.createElement("canvas");composed.width=c.width;composed.height=c.height;const ctx=composed.getContext("2d");ctx.drawImage(document.querySelector("video"),0,0,c.width,c.height);ctx.drawImage(c,0,0);return {pixels:Array.from(ctx.getImageData(0,0,c.width,c.height).data),alpha:Array.from(layer).filter((_,index)=>index%4===3)};});
  const result=await exportVideo((compatible?"compatible":"native")+"-portrait-480.mp4"),video=result.metadata.streams.find(t=>t.codec_type==="video");assert.equal(video.width,480);assert.equal(video.height,854);
  const actual=pixels(result.file,.5,480,854);let reference=0,delivered=0,intersection=0;
  for(let i=0;i<480*854;i++){if(expected.alpha[i]<100)continue;const a=Math.min(...expected.pixels.slice(i*4,i*4+3))>170,b=Math.min(...actual.slice(i*3,i*3+3))>170;if(a)reference++;if(b)delivered++;if(a&&b)intersection++;}
  assert.ok(reference>100&&2*intersection/(reference+delivered)>.85,"portrait dimensions and multiline layout match in both engines");
 }
 console.log("PASS reduced portrait dimensions and Unicode/multiline caption parity through both processors");
 assert.deepEqual(errors,[]);console.log("PASS reduced-resolution composed captions, intentional audio omission, immutable output settings, preset undo/reopen and mobile layout");
}catch(error){await page.screenshot({path:path.join(dir,"failure.png"),fullPage:true});console.log((await page.locator("body").innerText()).slice(-7000));throw error;}finally{await browser.close();}
