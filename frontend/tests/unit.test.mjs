import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const urls = new Map();
async function module(name) {
  const url = compile(name);
  return import(url);
}
function compile(name) {
  if (urls.has(name)) return urls.get(name);
  let code = ts.transpileModule(fs.readFileSync(new URL("../lib/" + name + ".ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  code = code.replace(/from "(\.\/[^"]+)"/g, (_, path) => "from " + JSON.stringify(compile(path.slice(2))));
  code += "\n//# sourceURL=cutmark-unit-" + name + ".js\n";
  const url = "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  urls.set(name, url);
  return url;
}
const timing = await module("timing");
const captions = await module("captions");
const { createHistory, editReducer } = await module("editable-project");
const { migrateProject, projectSummary } = await module("project-history");
const range = { id: "r1", sourceId: "s1", start: 10, end: 20 };
const original = { ranges: [range], captions: [{ id: 1, start: 11, end: 14, text: "Krish — café\n你好" }], sceneMarkers: [13], scenesDetected: true, includeSceneDetection: true };

test("strict timecodes reject extra components, missing fields and nonfinite values", () => {
  for (const text of ["1:02:03:04", "1::02", "1:60", "1:60:00", "-1", "NaN", "Infinity", "1e3", "0x10", "1:2", ":02", ""]) assert.equal(timing.parseTime(text), null, text);
  assert.equal(timing.parseTime("1:02:03.125"), 3723.125);
  assert.equal(timing.parseTime("123:45.5"), 7425.5);
  assert.equal(timing.parseTime("0.000001"), 0.000001);
});
test("formatting carries rounding into minutes and hours", () => {
  assert.equal(timing.formatTime(59.9999), "00:01:00.000");
  assert.equal(timing.formatTime(3599.9999), "01:00:00.000");
  assert.equal(timing.formatTime(59.999, 2), "00:01:00.00");
});
test("selection validation handles short sources and media boundaries", () => {
  assert.equal(timing.validateRange(0, 0.025, 0.025), null);
  assert.equal(timing.validateRange(0, 0.025, 0.025, 30), null);
  assert.ok(timing.validateRange(0, 0.01, 2, 30));
  assert.equal(timing.validateRange(0, 1001 / 30000, 2, 30000 / 1001), null);
  for (const args of [[-1, 1, 2], [0, 3, 2], [1, 1, 2], [NaN, 1, 2], [0, Infinity, 2], [0, 1, 0]]) assert.ok(timing.validateRange(...args));
});
test("mapping uses ordered half-open source ranges and clips cues without mutating originals", () => {
  const ranges = [range, { id: "r2", sourceId: "s1", start: 30, end: 35 }];
  assert.equal(timing.sourceToSequence(10, ranges), 0);
  assert.equal(timing.sourceToSequence(20, ranges), null);
  assert.equal(timing.sequenceToSource(10, ranges), 30);
  assert.equal(timing.sequenceToSource(15, ranges), null);
  const cues = [{ id: 1, start: 8, end: 12, text: "First" }, { id: 2, start: 19, end: 32, text: "Across gap" }];
  assert.deepEqual(timing.mapCuesToOutput(cues, ranges).map(({ start, end }) => [start, end]), [[0, 2], [9, 10], [10, 12]]);
  assert.equal(cues[0].start, 8);
});
test("corrected captions survive trim, undo, redo and serialization", () => {
  let state = createHistory(original);
  state = editReducer(state, { type: "edit", value: { ...state.present, ranges: [{ ...range, start: 12 }] }, action: "Change trim" });
  assert.equal(state.present.captions[0].text, original.captions[0].text);
  state = editReducer(state, { type: "undo" }); assert.equal(state.present.ranges[0].start, 10);
  state = editReducer(state, { type: "redo" }); assert.equal(state.present.ranges[0].start, 12);
  assert.equal(state.revision, 3);
  assert.deepEqual(captions.parseCaptions(captions.serializeCaptions(state.present.captions)).map(({start,end,text})=>({start,end,text})), original.captions.map(({start,end,text})=>({start,end,text})));
});
test("typing coalesces into one undo action, new edits clear redo, history is bounded", () => {
  let state = createHistory(original);
  for (let i = 1; i < 8; i++) state = editReducer(state, { type: "edit", value: { ...original, captions: [{ ...original.captions[0], text: "word" + i }] }, action: "Edit captions", group: "text-1", at: 1000 + i * 50 });
  assert.equal(state.past.length, 1);
  state = editReducer(state, { type: "undo" }); assert.equal(state.present.captions[0].text, original.captions[0].text);
  state = editReducer(state, { type: "edit", value: { ...state.present, sceneMarkers: [] }, action: "Remove marker" });
  assert.equal(state.future.length, 0);
  for (let i = 0; i < 150; i++) state = editReducer(state, { type: "edit", value: { ...state.present, sceneMarkers: [i] }, action: "Move marker" });
  assert.equal(state.past.length, 100);
});
test("VTT retains Unicode and multiline text and invalid timestamps are rejected", () => {
  assert.equal(captions.parseCaptions("WEBVTT\n\n00:60.000 --> 01:01.000\nbad\n").length, 0);
  const parsed = captions.parseCaptions(captions.serializeCaptions(original.captions));
  assert.equal(parsed[0].text, original.captions[0].text);
  assert.equal(parsed[0].id, original.captions[0].id);
  assert.match(captions.serializeSubRip(parsed), /00:00:11,000 --> 00:00:14,000/);
});
test("legacy migration keeps the original export and accurately records missing source", () => {
  const video = new Blob(["legacy"]);
  const legacy = { id: "old", fileName: "clip.mp4", createdAt: 42, video, duration: 10, captionsVtt: "WEBVTT", sceneMarkers: [2] };
  const migrated = migrateProject(legacy);
  assert.equal(migrated.video, video);
  assert.equal(migrated.sourceIsExport, true);
  assert.equal(migrated.captionTimebase, "output");
  assert.equal(migrated.createdAt, 42);
  assert.equal(migrateProject(migrated), migrated);
  assert.equal("video" in projectSummary(migrated), false);
  assert.equal("sourceVideo" in projectSummary(migrated), false);
});


test("subtitle delivery never emits intervals collapsed by millisecond rounding", () => {
  const cue = { id: 1, start: 0.0001, end: 0.0004, text: "Keep the source edit" };
  assert.equal(captions.isSubtitleInterval(cue.start, cue.end), false);
  assert.equal(captions.serializeCaptions([cue]), "WEBVTT\n\n");
  assert.equal(captions.serializeSubRip([cue]), "");
  assert.equal(cue.text, "Keep the source edit");
  assert.equal(captions.isSubtitleInterval(0.0004, 0.0006), true);
});

const view = await module("timeline-view");
const cueEdit = await module("caption-editing");
test("timeline zoom retains playhead position and clamps a navigable source window", () => {
  const initial = { start: 100, span: 200 };
  assert.deepEqual(view.zoomView(initial, 2, 150, 600), { start: 125, span: 100 });
  assert.deepEqual(view.zoomView({ start: 125, span: 100 }, .5, 150, 600), initial);
  assert.deepEqual(view.fitView(580, 100, 600), { start: 500, span: 100 });
  assert.deepEqual(view.fitView(-30, 1000, 600), { start: 0, span: 600 });
});
test("snap distance follows visible pixels, including long recordings and modifier bypass", () => {
  assert.equal(view.snapInView(305.09, [305], 10, 1000).time, 305);
  assert.equal(view.snapInView(305.11, [305], 10, 1000).time, 305.11);
  assert.equal(view.snapInView(305.09, [305], 10, 1000, true).time, 305.09);
  assert.equal(view.snapInView(59, [60], 600, 1000).target, 60);
  assert.equal(view.snapInView(59, [60], 10, 1000).target, undefined);
});
test("waveform aggregation retains short transients and silent regions at multiple zooms", () => {
  const source = Float32Array.from([0,0,0,0,.2,1,.3,0,0]);
  const levels = view.buildPeakPyramid(source);
  assert.equal(levels.at(-1)[0], 1);
  assert.equal(view.peakAtPixel(levels, .1, 0, .3), 0);
  assert.equal(view.peakAtPixel(levels, .1, .4, .6), 1);
  assert.equal(view.peakAtPixel(levels, .1, 0, .9), 1);
  assert.equal(view.buildPeakPyramid(new Float32Array(100)).at(-1)[0], 0);
});
const sampleCues = [{ id: 1, start: 1, end: 3, text: "Krish café 你好" }, { id: 2, start: 3.5, end: 4, text: "Again again" }, { id: 3, start: 5, end: 6, text: "End" }];
test("caption split preserves exact wording and times; adjacent merge and shifting remain reversible", () => {
  const split = cueEdit.splitCaption(sampleCues, 1, 2, 6);
  assert.deepEqual(split.slice(0,2).map(({start,end,text})=>({start,end,text})), [{start:1,end:2,text:"Krish "},{start:2,end:3,text:"café 你好"}]);
  assert.throws(() => cueEdit.splitCaption(sampleCues,1,3,6));
  assert.throws(() => cueEdit.splitCaption(sampleCues,1,2,0));
  assert.throws(() => cueEdit.mergeCaptions(sampleCues,[1,3]));
  const merged = cueEdit.mergeCaptions(sampleCues,[1,2]);
  assert.equal(merged[0].end, 4); assert.equal(merged[0].text,"Krish café 你好\nAgain again");
  const shifted = cueEdit.shiftCaptions(sampleCues,[1,2],.5,10);
  assert.equal(shifted[0].start,1.5); assert.equal(shifted[2],sampleCues[2]);
  assert.throws(() => cueEdit.shiftCaptions(sampleCues,[1,2],-2,10));
  assert.equal(sampleCues[0].start,1);
  let history = createHistory({...original,captions:sampleCues});
  history = editReducer(history,{type:"edit",value:{...history.present,captions:split},action:"Split caption"});
  history = editReducer(history,{type:"undo"});
  assert.deepEqual(history.present.captions,sampleCues);
});
test("replacement preserves literal search punctuation, dollar text and Unicode", () => {
  assert.equal(cueEdit.replaceCaptionText("Name (Chris). CHRIS café 你好", "Chris", "$& Krish"), "Name ($& Krish). $& Krish café 你好");
  assert.equal(cueEdit.replaceCaptionText("A.B A?B", "A.B", "你好"), "你好 A?B");
  assert.equal(cueEdit.replaceCaptionText("again again again", "", ""), "again again again");
});
test("caption review flags timing, overlap and readability without modifying text; notes justify guidance only", () => {
  const guidance = {lineLength:10,charactersPerSecond:5};
  const issues = cueEdit.captionIssues([{...sampleCues[0],end:3.8},sampleCues[1]],{...range,start:1.2,end:4},guidance);
  assert.ok(issues.some(x=>x.code==="outside")); assert.ok(issues.some(x=>x.code==="overlap")); assert.ok(issues.some(x=>x.code==="speed"));
  const flags = cueEdit.captionIssues([sampleCues[0]],undefined,guidance);
  const reviewedCue = {...sampleCues[0],reviewNote:"Deliberate delivery",acknowledgedWarnings:flags.map(flag=>flag.key)};
  const reviewed = cueEdit.captionIssues([reviewedCue],undefined,guidance);
  assert.ok(cueEdit.captionIssues([reviewedCue],range,guidance).some(flag=>!flag.acknowledged), "a new selection requires renewed review");
  assert.ok(reviewed.every(x=>x.acknowledged));
  assert.equal(sampleCues[0].text,"Krish café 你好");
  const invalid = cueEdit.captionIssues([{id:1,start:1,end:1,text:"x",reviewNote:"reason",acknowledgedWarnings:["invalid"]}],undefined,guidance);
  assert.equal(invalid.find(x=>x.code==="invalid").acknowledged,false);
});

test("waveform pixel ranges cannot borrow a nearby transient from a coarse block", () => {
  const base = new Float32Array(120000);
  base.fill(.3,0,1000);base.fill(.3,2000,3000);
  const levels = view.buildPeakPyramid(base);
  assert.equal(view.peakAtPixel(levels,.005,7.48,8.98),0);
  assert.equal(view.peakAtPixel(levels,.005,4.5,5.5),Math.fround(.3));
  assert.equal(view.peakAtPixel(levels,.005,5.1,9.9),0);
});

const scenes = await module("scene-tools");
test("scene sensitivity changes candidate threshold without promoting gradual transitions",()=>{
  const sample=[{from:0,time:.25,score:0},{from:.25,time:.5,score:.2},{from:.5,time:.75,score:0}];
  assert.equal(scenes.findSceneCandidates(sample,"balanced").length,1);
  assert.equal(scenes.findSceneCandidates(sample,"fewer").length,0);
  assert.equal(scenes.findSceneCandidates(sample.map(x=>({...x,score:x.score*.65})),"more").length,1);
  assert.equal(scenes.findSceneCandidates(Array.from({length:20},(_,i)=>({from:i/4,time:(i+1)/4,score:.1})),"more").length,0);
  assert.equal(scenes.pixelDifference(new Uint8ClampedArray([0,0,0,255]),new Uint8ClampedArray([255,255,255,255])),1);
});
test("scene rescans protect reviewed, moved, dismissed and out-of-area cuts until explicit replacement",()=>{
  const previous=[{id:"before",time:.5,origin:"detected",confirmed:false},{id:"confirmed",time:1,origin:"detected",confirmed:true,bracket:{start:.75,end:1}},{id:"moved",time:2.1,origin:"manual",confirmed:true},{id:"after",time:3.5,origin:"manual",confirmed:true}];
  const incoming=[{id:"new1",time:1,origin:"detected",confirmed:false},{id:"new2",time:2,origin:"detected",confirmed:false},{id:"new3",time:3,origin:"detected",confirmed:false}];
  const kept=scenes.mergeSceneScan(previous,incoming,.75,3.25,false,[{start:1.75,end:2},{start:2.75,end:3}]);
  assert.deepEqual(kept.map(x=>x.id),["before","confirmed","moved","after"]);
  const replaced=scenes.mergeSceneScan(previous,incoming,.75,3.25,true,[{start:2.75,end:3}]);
  assert.deepEqual(replaced.map(x=>x.id),["before","new1","new2","new3","after"]);
  assert.equal(previous[1].id,"confirmed");
});
test("recorded scene analysis matches complete source/settings only and source scenes use half-open boundaries",()=>{
  const settings={mode:"quick",sensitivity:"balanced",scope:"selection"};
  const analysis={sourceId:"s",start:1,end:3,settings,complete:true};
  assert.equal(scenes.analysisMatches(analysis,"s",1,3,settings),true);
  assert.equal(scenes.analysisMatches({...analysis,complete:false},"s",1,3,settings),false);
  assert.equal(scenes.analysisMatches(analysis,"s",1.1,3,settings),false);
  assert.equal(scenes.analysisMatches(analysis,"other",1,3,settings),false);
  assert.equal(scenes.analysisMatches(analysis,"s",1,3,{...settings,sensitivity:"more"}),false);
  const cuts=scenes.cutsFromLegacy([1,2,3]);
  assert.deepEqual(scenes.sceneBetween(1,cuts,4),{start:1,end:2});
  assert.deepEqual(scenes.sceneBetween(4,cuts,4),{start:3,end:4});
});
test("named source markers and scene records survive project summaries and undo without becoming detected cuts",()=>{
  const marker={id:"hook",time:1.25,name:"Hook",note:"Krish café 你好",color:"gold"};
  const before={...original,editorialMarkers:[marker],sceneCuts:scenes.cutsFromLegacy([13])};
  let state=createHistory(before);
  state=editReducer(state,{type:"edit",value:{...before,editorialMarkers:[{...marker,time:2}]},action:"Move editorial marker"});
  state=editReducer(state,{type:"undo"});
  assert.deepEqual(state.present.editorialMarkers,[marker]);assert.deepEqual(state.present.sceneMarkers,[13]);
  assert.equal(projectSummary({id:"p",editorialMarkers:[marker],video:new Blob(["asset"])}).editorialMarkers[0].note,marker.note);
});

const subtitleImport=await module("subtitle-import");
const captionRender=await module("caption-renderer");
test("subtitle imports validate timestamp components and preserve Unicode/multiline text with fresh identifiers",()=>{
  const text="\uFEFF1\r\n00:00:01,100 --> 00:00:02,900\r\nKrish — café\r\n你好\r\n\r\n1\r\n00:00:03,000 --> 00:00:04,000\r\nAgain\r\n\r\n3\r\n00:60:00,000 --> 01:01:00,000\r\nbad";
  const result=subtitleImport.parseSubtitleImport(text,"srt");
  assert.equal(result.cues.length,2);assert.deepEqual(result.cues.map(cue=>cue.id),[1,2]);assert.equal(result.cues[0].text,"Krish — café\n你好");
  assert.equal(result.issues.filter(issue=>issue.kind==="error").length,1);
  const round=subtitleImport.parseSubtitleImport(captions.serializeSubRip(result.cues),"srt");
  assert.deepEqual(round.cues,result.cues);
});
test("VTT import flags styling and cue positioning instead of pretending they were preserved",()=>{
  const result=subtitleImport.parseSubtitleImport("WEBVTT\n\nSTYLE\n::cue { color:red }\n\nnamed\n00:00.100 --> 00:02.900 align:start\n<v Chris><i>café &amp; 你好</i>\n\nbad\n00:00.500 --> 00:00.500\nbad","vtt");
  assert.equal(result.cues[0].text,"café & 你好");assert.equal(result.cues[0].start,.1);
  assert.equal(result.issues.filter(issue=>issue.kind==="warning").length,3);assert.equal(result.issues.filter(issue=>issue.kind==="error").length,1);
});
test("subtitle byte decoding accepts BOM-marked UTF-16 and rejects invalid encodings rather than replacing words",()=>{
  const utf8=new TextEncoder().encode("café 你好");assert.equal(subtitleImport.decodeSubtitleBytes(utf8.buffer),"café 你好");
  const buffer=Buffer.from("\uFEFFcafé 你好","utf16le");const array=Uint8Array.from(buffer);assert.equal(subtitleImport.decodeSubtitleBytes(array.buffer),"café 你好");
  assert.throws(()=>subtitleImport.decodeSubtitleBytes(Uint8Array.from([255,1,253]).buffer));
  assert.throws(()=>subtitleImport.decodeSubtitleBytes(new ArrayBuffer(2*1024*1024+1)));
});
test("literal brackets and ampersands round-trip without becoming cue markup",()=>{
  const cue={id:1,start:0,end:1,text:"A < B & literal <i>word</i>"};
  const vtt=captions.serializeCaptions([cue]);assert.match(vtt,/&lt;i&gt;/);assert.equal(captions.parseCaptions(vtt)[0].text,cue.text);
  assert.equal(subtitleImport.parseSubtitleImport(vtt,"vtt").cues[0].text,cue.text);
});
test("caption wrapping preserves long words, explicit lines, emoji clusters and safe-area geometry",()=>{
  const measure=text=>[...text].length*10;
  assert.deepEqual(captionRender.wrapCaption("hello world",60,measure),["hello","world"]);
  assert.deepEqual(captionRender.wrapCaption("ABCDEFGHIJ\n你好",30,measure),["ABC","DEF","GHI","J","你好"]);
  const context={font:"",measureText:text=>({width:[...text].length*8})};
  const style={...captionRender.DEFAULT_CAPTION_STYLE,size:5,margin:7};
  const layout=captionRender.captionLayout(context,"Two lines\ncafé",320,180,style);
  assert.ok(layout.x>=320*.07);assert.ok(layout.y>=180*.07);assert.ok(layout.y+layout.boxHeight<=180*.93+.0001);
  assert.throws(()=>captionRender.captionLayout(context,Array(100).fill("line").join("\n"),320,180,style),/does not fit/);
});
test("caption style and delivery edits are named revisions and older output settings remain immutable",()=>{
  const oldStyle={...captionRender.DEFAULT_CAPTION_STYLE},output={revision:0,style:oldStyle};
  let state=createHistory({...original,captionStyle:oldStyle,captionDelivery:"sidecar"});
  state=editReducer(state,{type:"edit",value:{...state.present,captionStyle:{...oldStyle,color:"#ff0000"},captionDelivery:"both"},action:"Change caption style"});
  state=editReducer(state,{type:"undo"});assert.equal(state.present.captionStyle.color,"#ffffff");assert.equal(output.style.color,"#ffffff");
  assert.equal(projectSummary({id:"p",captionStyle:oldStyle,captionDelivery:"both"}).captionDelivery,"both");
});

test("subtitle timing rejects suffix digits and missing separators instead of accepting a prefix",()=>{
  for(const end of ["00:00:01.0000","00:00:01.000abc","00:00:01.000:02"]){
    const result=subtitleImport.parseSubtitleImport("WEBVTT\n\n00:00:00.000 --> "+end+"\nwords","vtt");
    assert.equal(result.cues.length,0);assert.ok(result.issues.some(issue=>issue.kind==="error"));
  }
});

const output = await module("output-spec");
test("output policies keep landscape/portrait orientation, never upscale and deliberately omit audio",()=>{
  for(const [width,height] of [[3840,2160],[2160,3840]]){
    const spec=output.outputSpec(width,height,true,{resolution:"720",quality:"smaller",audio:"omit"});
    assert.equal(Math.max(spec.width,spec.height),1280);assert.equal(Math.min(spec.width,spec.height),720);
    assert.equal(spec.audio,false);assert.equal(spec.reencode,true);
  }
  const unchanged=output.outputSpec(90,160,false,{resolution:"1080",quality:"balanced",audio:"omit"});
  assert.equal(unchanged.width,90);assert.equal(unchanged.height,160);assert.equal(unchanged.reencode,false);
});
test("export settings are reversible decisions and output snapshots preserve prior policies",()=>{
  const preferences={...output.DEFAULT_EXPORT_PREFERENCES};
  let state=createHistory({...original,exportPreferences:preferences});
  const snapshot=state.present.exportPreferences;
  state=editReducer(state,{type:"edit",value:{...state.present,exportPreferences:{...preferences,quality:"high",audio:"omit"}},action:"Change export quality"});
  assert.equal(snapshot.quality,"balanced");state=editReducer(state,{type:"undo"});assert.equal(state.present.exportPreferences.audio,"keep");
  assert.equal(projectSummary({id:"p",exportPreferences:preferences}).exportPreferences.quality,"balanced");
});

const portable=await module("portable-project");
const backupMedia={duration:30,width:320,height:180,hasAudio:false,frameRate:30,videoCodec:"avc",audioCodec:null,hdr:false};
async function sampleBackup(){
 const source=new Blob(["source contents"],{type:"video/mp4"});
 const project={id:"p",title:"Review café 你好",fileName:"source.mp4",createdAt:10,captionsVtt:null,sceneMarkers:[],duration:30};
 const decisions={...original,projectTitle:project.title,captionGuidance:{lineLength:42,charactersPerSecond:17},captionStyle:{...captionRender.DEFAULT_CAPTION_STYLE},captionDelivery:"both",exportPreferences:{...output.DEFAULT_EXPORT_PREFERENCES},editorialMarkers:[{id:"m",time:12,name:"Quote 你好",note:"Keep café",color:"gold"}],sceneCuts:[{id:"c",time:15,origin:"manual",confirmed:true}],dismissedCuts:[{start:13,end:14}],sceneSettings:{mode:"quick",scope:"source",sensitivity:"balanced"},sceneAnalysis:undefined};
 return {source,backup:await portable.createBackup(project,decisions,backupMedia,source)};
}
test("portable lightweight and included-source backups preserve Unicode, source time, styles, markers and provenance",async()=>{
 const {source,backup}=await sampleBackup();
 for(const bundled of [false,true]){
  const result=await portable.readBackup(portable.backupBlob(backup,bundled?source:undefined));
  assert.deepEqual(result.backup,backup);
  if(bundled){assert.equal(await result.source.text(),await source.text());await portable.verifyRelink(backup,result.source,backupMedia);}
  else assert.equal(result.source,undefined);
  const restored=portable.restoredProject(backup,source);assert.equal(restored.title,backup.title);assert.equal(restored.trimStart,10);assert.equal(restored.captions[0].text,original.captions[0].text);assert.equal(restored.createdAt,10);assert.equal(restored.video,undefined);
 }
 const reviewed=structuredClone(backup);reviewed.decisions.captions[0].text="Deliberate long wording ".repeat(100);reviewed.decisions.captions[0].acknowledgedWarnings=["line:"+JSON.stringify(reviewed.decisions.captions[0])];assert.deepEqual(portable.validateBackup(reviewed).decisions.captions[0],reviewed.decisions.captions[0]);
 const legacy={...backup,source:{...backup.source,kind:"saved-export"}};
 assert.equal(portable.restoredProject(legacy,source).sourceIsExport,true);
});
test("relink checks actual source contents rather than filename and rejects incompatible metadata",async()=>{
 const {source,backup}=await sampleBackup();
 const wrong=new Blob(["source contentX"],{type:"video/mp4"});
 assert.equal(wrong.size,source.size);
 await assert.rejects(portable.verifyRelink(backup,wrong,backupMedia),/contents do not match/);
 await assert.rejects(portable.verifyRelink(backup,source,{...backupMedia,width:640}),/dimensions or tracks/);
});
test("backup imports reject unsupported features, corrupt bundles, nonfinite timing and invalid style/marker structure",async()=>{
 const {source,backup}=await sampleBackup();
 for(const mutate of [p=>p.version=99,p=>p.decisions.ranges[0].end=40,p=>p.decisions.captionStyle.font="remote",p=>p.decisions.editorialMarkers[0].color="red",p=>p.decisions.sceneCuts[0].confirmed="yes",p=>p.decisions.exportPreferences.quality="fake",p=>p.decisions.ranges.push(p.decisions.ranges[0]),p=>p.decisions.crop={x:0},p=>p.decisions.captions[0].start=NaN]){
  const altered=structuredClone(backup);mutate(altered);assert.throws(()=>portable.validateBackup(altered));
 }
 const bundle=portable.backupBlob(backup,source);
 await assert.rejects(portable.readBackup(bundle.slice(0,bundle.size-1)),/truncated/);
 await assert.rejects(portable.readBackup(new Blob(["not JSON"])),/valid UTF-8 JSON/);
 assert.equal(portable.projectFileStem('Quote: café/你好'),"Quote- café-你好");
});
test("source fingerprinting is cancellable between bounded chunks and a retry still verifies all contents",async()=>{
 const blob=new Blob([new Uint8Array(5*1024*1024)]),controller=new AbortController();
 await assert.rejects(portable.fingerprintSource(blob,controller.signal,()=>controller.abort()),error=>error.name==="AbortError");
 const hash=await portable.fingerprintSource(blob);assert.match(hash,/^[a-f0-9]{64}$/);
});

const storage=await module("storage-tools");
test("storage size accounting deduplicates shared media and reports unmeasured legacy records",()=>{
 const original={id:"a",sourceBytes:100,outputBytes:50,sourceAssetId:"source",outputAssetId:"output",exportRevision:1};
 const clone={...original,id:"b"};
 const sizes=storage.mediaUsage([original,clone,{id:"old"}]);
 assert.equal(sizes.sources.bytes,100);assert.equal(sizes.sources.count,2);assert.equal(sizes.sources.unmeasured,1);assert.equal(sizes.outputs.bytes,50);assert.equal(sizes.outputs.count,1);
});
test("model cleanup matches only the specific HTTPS English-model repository",()=>{
 assert.equal(storage.isEnglishModelUrl("https://huggingface.co/onnx-community/whisper-tiny.en/resolve/main/config.json"),true);
 for(const url of ["https://huggingface.co/onnx-community/whisper-tiny/resolve/main/config.json","https://example.com/onnx-community/whisper-tiny.en/config.json","http://huggingface.co/onnx-community/whisper-tiny.en/config.json","https://huggingface.co/onnx-community/whisper-tiny.en-other/config.json","not a URL"])assert.equal(storage.isEnglishModelUrl(url),false);
});

test("sequence timing distinguishes repeated clips and assigns joins to the next clip", () => {
  const ranges = [{id:"a",sourceId:"s",start:3,end:4},{id:"b",sourceId:"s",start:0,end:2},{id:"c",sourceId:"s",start:1,end:2}];
  assert.equal(timing.validateSequence(ranges,"s",4,30),null);
  assert.equal(timing.sequenceDuration(ranges),4);
  assert.deepEqual(timing.sourceOccurrences(1.5,"s",ranges).map(h=>[h.rangeId,h.sequenceTime]),[["b",2.5],["c",3.5]]);
  assert.deepEqual(timing.sourceOccurrences(2,"s",ranges),[]);
  assert.deepEqual(timing.sourceOccurrences(1.5,"other",ranges),[]);
  assert.equal(timing.sequenceOccurrence(1,ranges).rangeId,"b");
  assert.equal(timing.sequenceOccurrence(3,ranges).rangeId,"c");
  for (const t of [4,-1,NaN,Infinity]) assert.equal(timing.sequenceOccurrence(t,ranges),null);
  const cues=[{id:1,start:1.5,end:3.5,text:"café 你好"}];
  assert.deepEqual(timing.mapCuesToOutput(cues,ranges).map(c=>[c.start,c.end,c.text]),[[0,.5,"café 你好"],[2.5,3,"café 你好"],[3.5,4,"café 你好"]]);
  assert.equal(cues[0].start,1.5);
});
test("sequence validation rejects invalid references and preserves fractional frame joins", () => {
  const frame=1001/30000;
  const ranges=[{id:"a",sourceId:"s",start:0,end:frame},{id:"b",sourceId:"s",start:frame*2,end:frame*3}];
  assert.equal(timing.validateSequence(ranges,"s",1,30000/1001),null);
  assert.equal(timing.sequenceOccurrence(frame,ranges).sourceTime,frame*2);
  for (const bad of [[],[ranges[0],ranges[0]],[{...ranges[0],id:""}],[{...ranges[0],sourceId:"other"}],[{...ranges[0],end:Infinity}],[{...ranges[0],end:frame/2}]])
    assert.ok(timing.validateSequence(bad,"s",1,30000/1001));
});

const adjustments=await module("adjustments"),sequenceEdits=await module("sequence-edits"),presets=await module("project-presets");
test("framing geometry preserves aspect and aligns canvas and compatible-filter placement",()=>{
 const f={...adjustments.DEFAULT_FRAMING,ratio:"9:16",fit:"fill",x:25,rotation:90,flipX:true};
 const size=adjustments.framingSize(320,180,f,Infinity);assert.deepEqual(size,{width:180,height:320});
 const g=adjustments.frameGeometry(320,180,180,320,f);assert.deepEqual(g,{width:180,height:320,x:0,y:0});
 assert.match(adjustments.framingFilter(320,180,180,320,f),/^hflip,transpose=clock/);
 const square={...f,rotation:0,ratio:"1:1"};
 assert.deepEqual(adjustments.framingSize(320,180,square,Infinity),{width:320,height:320});
 const crop=adjustments.frameGeometry(320,180,320,320,square);assert.ok(crop.width>=320&&crop.height>=320);assert.equal(Math.abs(crop.x%2),0);
 const fit=adjustments.frameGeometry(320,180,180,320,{...adjustments.DEFAULT_FRAMING});assert.deepEqual(fit,{width:180,height:102,x:0,y:110});
});
test("audio gain, mute and fades use actual sequence duration without changing track intent",()=>{
 assert.match(adjustments.audioFilter({...adjustments.DEFAULT_AUDIO,gainDb:-6,fadeIn:3,fadeOut:.4},2),/^volume=0.501/);
 assert.match(adjustments.audioFilter({...adjustments.DEFAULT_AUDIO,gainDb:-6,fadeIn:3,fadeOut:.4},2),/afade=t=in:st=0:d=2,afade=t=out:st=1.6:d=0.4$/);
 assert.match(adjustments.audioFilter({...adjustments.DEFAULT_AUDIO,mute:true},2),/^volume=0$/);
});
test("removal closes gaps, preserves order and source decisions, and supports repeated ranges",()=>{
 const ranges=[{id:"a",sourceId:"s",start:0,end:10},{id:"b",sourceId:"s",start:0,end:10}];
 let id=0;const result=sequenceEdits.subtractInterval(ranges,3,7,()=>String(++id));
 assert.deepEqual(result.map(r=>[r.id,r.start,r.end]),[["a",0,3],["1",7,10],["b",0,3],["2",7,10]]);
 assert.equal(ranges[0].end,10);assert.equal(timing.sequenceDuration(result),12);
 assert.deepEqual(sequenceEdits.subtractInterval(ranges,0,10,()=>""),[]);
 assert.throws(()=>sequenceEdits.subtractInterval(ranges,NaN,1,()=>""));
});
test("pause suggestions preserve speech padding and include a trailing pause",()=>{
 const peaks=new Float32Array([1,0,0,0,0,1,0,0,0,0]);
 assert.deepEqual(sequenceEdits.silenceSuggestions(peaks,.1,-40,.3,.1,1),[{start:.2,end:.4},{start:.7000000000000001,end:.9}]);
 assert.deepEqual(sequenceEdits.silenceSuggestions(peaks,.1,-40,1,.1,1),[]);
});
test("portable v2 preserves sequences, framing, audio, clips and stale-client protection",async()=>{
 const {backup,source}=await sampleBackup();
 const f={...adjustments.DEFAULT_FRAMING,ratio:"9:16",fit:"fill"},a={...adjustments.DEFAULT_AUDIO,gainDb:-6,fadeIn:.2};
 const b={...backup,version:2,decisions:{...backup.decisions,ranges:[range,{...range,id:"r2",start:1,end:3}],framing:f,audioAdjustments:a,clips:[{id:"clip",name:"Quote",range,preferences:output.DEFAULT_EXPORT_PREFERENCES,framing:f,selected:true}]}};
 const parsed=portable.validateBackup(b);assert.deepEqual(parsed,b);
 const restored=portable.restoredProject(parsed,source);assert.equal(restored.ranges.length,2);assert.equal(restored.clips[0].range.sourceId,restored.id);assert.equal(restored.duration,12);assert.equal(restored.audioAdjustments.gainDb,-6);
 for(const mutate of [v=>v.version=1,v=>v.decisions.framing.zoom=4,v=>v.decisions.audioAdjustments.fadeOut=Infinity,v=>v.decisions.clips[0].range.sourceId="other",v=>v.decisions.clips[0].preferences=null]){const wrong=structuredClone(b);mutate(wrong);assert.throws(()=>portable.validateBackup(wrong));}
});
test("output presets validate only supported settings and exclude source editorial content",()=>{
 const p={format:"cutmark-preset",version:1,id:"one",name:"Social",settings:{framing:{...adjustments.DEFAULT_FRAMING,ratio:"9:16"},audioAdjustments:{...adjustments.DEFAULT_AUDIO,gainDb:-3},captionStyle:captionRender.DEFAULT_CAPTION_STYLE,exportPreferences:output.DEFAULT_EXPORT_PREFERENCES}};
 assert.deepEqual(presets.validatePreset(p),p);
 for(const change of [v=>v.settings.ranges=[],v=>v.settings.captionStyle.color="bad",v=>v.version=99]){const wrong=structuredClone(p);change(wrong);assert.throws(()=>presets.validatePreset(wrong));}
});

const assemblyTools=await module("assembly");
test("assembly maps distinct source captions, repeated titles and markers through ordered joins",()=>{
 const source=(id,captions)=>({id,assetId:id,reference:{fileName:id,mime:"video/mp4",bytes:1,fingerprint:"0".repeat(64),algorithm:"sha256-chunks-4m-v1",kind:"original",metadata:{...backupMedia,duration:4}},captions});
 const a={enabled:true,sources:[{...source("a",[{id:1,start:1.2,end:2.2,text:"A"}]),titles:[{id:1,start:1,end:2,text:"Title",style:captionRender.DEFAULT_CAPTION_STYLE}],markers:[{id:"m",time:1.5,name:"Quote",note:"Keep",color:"gold"}],sceneMarkers:[1.8]},source("b",[{id:1,start:.2,end:1,text:"B"}])],ranges:[{id:"1",sourceId:"a",start:1,end:2},{id:"2",sourceId:"b",start:0,end:1},{id:"3",sourceId:"a",start:1,end:2}]};
 assert.equal(assemblyTools.validateAssembly(a),null);
 assert.deepEqual(assemblyTools.assemblyCaptions(a).map(c=>[Math.round(c.start*1000),Math.round(c.end*1000),c.text]),[[200,1000,"A"],[1200,2000,"B"],[2200,3000,"A"]]);
 assert.deepEqual(assemblyTools.assemblyTitles(a).map(t=>[t.start,t.end]),[[0,1],[2,3]]);
 assert.deepEqual(assemblyTools.assemblyMarkers(a).markers.map(m=>m.sequenceTime),[.5,2.5]);
 for(const alter of [v=>v.ranges[0].sourceId="missing",v=>v.ranges[0].end=99,v=>v.sources.push(v.sources[0])]){const bad=structuredClone(a);alter(bad);assert.ok(assemblyTools.validateAssembly(bad));}
});
test("v3 source bundles contain each distinct source once, validate all decisions and restore content refs",async()=>{
 const {backup,source}=await sampleBackup(),extra=new Blob(["second"],{type:"video/mp4"}),fingerprint=await portable.fingerprintSource(extra);
 const ref={...backup.source,fileName:"second.mp4",bytes:extra.size,fingerprint};
 const assembly={enabled:true,sources:[{id:"one",assetId:"old-primary",reference:backup.source,captions:[]},{id:"two",assetId:"old-extra",reference:ref,captions:[]}],ranges:[{id:"a",sourceId:"one",start:1,end:2},{id:"b",sourceId:"two",start:3,end:4}]};
 const b={...backup,version:3,decisions:{...backup.decisions,assembly}};
 assert.deepEqual(portable.validateBackup(b),b);
 const packed=portable.backupBlob(b,source,{[fingerprint]:extra}),read=await portable.readBackup(packed);assert.equal(await read.source.text(),await source.text());assert.equal(await read.mediaAssets[fingerprint].text(),"second");
 const restored=portable.restoredProject(read.backup,read.source,read.mediaAssets);assert.equal(restored.assembly.sources[0].assetId,restored.id);assert.equal(restored.assembly.sources[1].assetId,"media:"+fingerprint);
 assert.throws(()=>portable.backupBlob(b,source,{}),/missing source/);
 await assert.rejects(()=>portable.readBackup(packed.slice(0,packed.size-1)),/truncated/);
 for(const alter of [v=>v.version=2,v=>v.decisions.assembly.ranges[0].sourceId="missing",v=>v.decisions.assembly.sources[0].reference.fingerprint="bad"]){const bad=structuredClone(b);alter(bad);assert.throws(()=>portable.validateBackup(bad));}
});
test("sequence caption review uses retained coverage and invalidates range-dependent acknowledgements",()=>{
 const ranges=[{id:"a",sourceId:"s",start:0,end:1},{id:"b",sourceId:"s",start:2,end:3}],guidance={lineLength:42,charactersPerSecond:30};
 const cues=[{id:1,start:2.1,end:2.9,text:"Retained"},{id:2,start:.5,end:2.5,text:"Removed gap"}];
 const flags=cueEdit.captionIssues(cues,ranges,guidance);assert.ok(!flags.some(f=>f.cueId===1&&f.code==="outside"));assert.ok(flags.some(f=>f.cueId===2&&f.code==="outside"));
});
test("timed titles retain styles in v2 backups and reject malformed style/timing",async()=>{
 const {backup}=await sampleBackup();const b={...backup,version:2,decisions:{...backup.decisions,titles:[{id:1,start:11,end:12,text:"Krish 你好",style:{...captionRender.DEFAULT_CAPTION_STYLE,position:"top",bold:true}}]}};
 assert.deepEqual(portable.validateBackup(b),b);
 for(const change of [v=>v.version=1,v=>v.decisions.titles[0].style.position="offscreen",v=>v.decisions.titles[0].end=99]){const bad=structuredClone(b);change(bad);assert.throws(()=>portable.validateBackup(bad));}
});

const imageTools=await module("image-tools");
test("image assets remain external to decisions, preserve transparent-layer settings and round-trip v3 bundles",async()=>{
 const {backup,source}=await sampleBackup();const image=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1,2,3])],{type:"image/png"}),fingerprint=await portable.fingerprintSource(image);
 assert.equal(await imageTools.imageMime(image),"image/png");assert.equal(await imageTools.imageMime(new Blob(["<svg></svg>"])),null);
 const overlay={id:"logo",assetId:"image:"+fingerprint,start:10,end:15,x:80,y:20,size:20,opacity:.5,reference:{kind:"image",fileName:"logo.png",mime:"image/png",bytes:image.size,fingerprint,algorithm:"sha256-chunks-4m-v1",metadata:{width:64,height:64}}};
 const b={...backup,version:3,decisions:{...backup.decisions,images:[overlay]}};assert.deepEqual(portable.validateBackup(b),b);
 const bundled=portable.backupBlob(b,source,{[fingerprint]:image}),read=await portable.readBackup(bundled);assert.equal(read.mediaAssets[fingerprint].size,image.size);assert.deepEqual(portable.restoredProject(read.backup,read.source,read.mediaAssets).images[0],overlay);
 for(const alter of [v=>v.version=2,v=>v.decisions.images[0].reference.metadata.width=9999,v=>v.decisions.images[0].reference.mime="image/svg+xml",v=>v.decisions.images[0].opacity=2,v=>v.decisions.images[0].end=99]){const bad=structuredClone(b);alter(bad);assert.throws(()=>portable.validateBackup(bad));}
 const frames=timing.mapCuesToOutput([overlay],[{...range,start:12,end:14}]);assert.deepEqual(frames.map(image=>[image.start,image.end]),[[0,2]]);
 const usage=storage.mediaUsage([{id:"p",sourceBytes:100,sourceAssetId:"source",duration:1,fileName:"x",createdAt:0,captionsVtt:null,sceneMarkers:[],images:[overlay]},{id:"clone",sourceBytes:100,sourceAssetId:"source",duration:1,fileName:"x",createdAt:0,captionsVtt:null,sceneMarkers:[],images:[overlay]}]);assert.equal(usage.sources.bytes,100+image.size);assert.equal(usage.sources.count,2);
});

test("MP4 naming rules preserve Unicode, sanitize filesystem characters and keep legacy defaults",()=>{
 assert.equal(output.outputFileName("Review café 你好",output.DEFAULT_EXPORT_PREFERENCES),"Review café 你好-cutmark.mp4");
 assert.equal(output.outputFileName("Quote",{...output.DEFAULT_EXPORT_PREFERENCES,filePrefix:"client:one",fileSuffix:"vertical"}),"client-one-Quote-vertical.mp4");
 assert.equal(output.outputFileName("CON",{...output.DEFAULT_EXPORT_PREFERENCES,fileSuffix:""}),"_CON.mp4");
 assert.equal(output.outputFileName("bad\u0000name",{...output.DEFAULT_EXPORT_PREFERENCES,fileSuffix:""}),"bad-name.mp4");
});

test("primary assembly words, titles and logos follow corrections atomically through undo/redo and explicit freeze",()=>{
 const source={id:"bin",primary:true,assetId:"source",reference:{fileName:"a.mp4"},captions:[]};
 const edits={...original,titles:[{id:1,start:10,end:12,text:"Title",style:captionRender.DEFAULT_CAPTION_STYLE}],assembly:{enabled:true,sources:[source],ranges:[{...range,sourceId:"bin"}]}};
 let h=createHistory(edits);assert.equal(h.present.assembly.sources[0].captions[0].text,original.captions[0].text);
 h=editReducer(h,{type:"edit",value:{...h.present,captions:[{...h.present.captions[0],text:"Corrected name"}]},action:"Correct name"});assert.equal(assemblyTools.assemblyCaptions(h.present.assembly)[0].text,"Corrected name");
 h=editReducer(h,{type:"undo"});assert.equal(h.present.assembly.sources[0].captions[0].text,original.captions[0].text);h=editReducer(h,{type:"redo"});
 h=editReducer(h,{type:"edit",value:{...h.present,assembly:{...h.present.assembly,sources:h.present.assembly.sources.map(s=>({...s,primary:false}))}},action:"Freeze source"});
 h=editReducer(h,{type:"edit",value:{...h.present,captions:[{...h.present.captions[0],text:"Later primary wording"}]},action:"Correct primary only"});assert.equal(h.present.assembly.sources[0].captions[0].text,"Corrected name");assert.equal(h.present.captions[0].text,"Later primary wording");
});

const home = await module("home-projects");
test("homepage sorts by actual edit time with bounded legacy fallbacks without mutating projects",()=>{
 const projects=[{id:"a",createdAt:500,updatedAt:100},{id:"b",createdAt:200},{id:"c",createdAt:50,updatedAt:300},{id:"d",createdAt:150,updatedAt:NaN},{id:"e",createdAt:Infinity}];
 assert.deepEqual(home.recentProjects(projects).map(p=>p.id),["c","b","d","a","e"]);
 assert.deepEqual(projects.map(p=>p.id),["a","b","c","d","e"]);assert.equal(home.projectEditedAt({updatedAt:1e30,createdAt:200}),200);
});
test("homepage distinguishes drafts, current exports, stale exports and unknown legacy revision state",()=>{
 assert.equal(home.projectExportLabel({revision:0}),"Draft · no export yet");
 assert.equal(home.projectExportLabel({revision:0,exportRevision:0}),"Export up to date");
 assert.equal(home.projectExportLabel({revision:7,exportRevision:4}),"Changes since export");
 assert.equal(home.projectExportLabel({outputAssetId:"legacy"}),"Export status unknown");assert.equal(home.projectExportLabel({outputBytes:100}),"Export saved · revision unknown");
 assert.equal(home.projectExportLabel({revision:NaN,exportRevision:NaN}),"Export saved · revision unknown");
});
test("homepage labels actual current edited duration rather than an earlier rendered duration",()=>{
 assert.deepEqual(home.projectDuration({duration:99,ranges:[{start:1,end:3},{start:8,end:10}]}),{seconds:4,label:"Edited"});
 assert.deepEqual(home.projectDuration({duration:99,ranges:[{start:0,end:5}],assembly:{enabled:true,ranges:[{start:4,end:7},{start:1,end:2}]}}),{seconds:4,label:"Edited"});
 assert.deepEqual(home.projectDuration({duration:2,sourceDuration:20}),{seconds:20,label:"Source"});
 assert.deepEqual(home.projectDuration({duration:2,sourceIsExport:true}),{seconds:2,label:"Saved video"});
 assert.equal(home.projectDuration({duration:NaN}),null);
});
