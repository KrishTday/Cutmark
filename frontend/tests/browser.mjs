import {openEditingTools,openPlaybackOptions} from "./workspace-ui.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CUTMARK_PLAYWRIGHT_PATH || "playwright");
const artifacts = process.env.CUTMARK_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), "cutmark-verification-"));
fs.mkdirSync(artifacts, { recursive: true });
const fixture = path.join(artifacts, "boundary.mp4");
function ffmpeg(args) { return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]); }
ffmpeg(["-f", "lavfi", "-i", "color=c=red:s=320x180:r=30:d=1", "-f", "lavfi", "-i", "color=c=green:s=320x180:r=30:d=1", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=30:d=1", "-f", "lavfi", "-i", "color=c=yellow:s=320x180:r=30:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-filter_complex", "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]", "-map", "[v]", "-map", "4:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fixture]);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
const url = process.env.CUTMARK_TEST_URL || "http://127.0.0.1:4173";
async function time(label, value) { await page.getByLabel(label, { exact: true }).fill(value); await page.getByLabel(label, { exact: true }).press("Tab"); }
async function saved() { await page.getByText("Saved in this browser", { exact: true }).first().waitFor({ timeout: 20000 }); }
async function exportVideo(name) {
  await page.getByRole("button", { name: /Export (video|latest changes)/ }).click();
  await page.getByText("Latest export", { exact: false }).first().waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: "Export video", exact: true }).waitFor();
  const href = await page.getByRole("link", { name: "MP4", exact: true }).getAttribute("href");
  const data = await page.evaluate(async (href) => Array.from(new Uint8Array(await (await fetch(href)).arrayBuffer())), href);
  const file = path.join(artifacts, name); fs.writeFileSync(file, Buffer.from(data)); return { file, href };
}
function color(file, last = false) {
  return ffmpeg(["-i", file, "-vf", (last ? "reverse," : "") + "scale=1:1", "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]);
}
function checkBoundary(file) {
  const first = color(file), last = color(file, true);
  assert.ok(first[1] > first[0] * 2 && first[1] > first[2] * 2, "first included frame should be green: " + first);
  assert.ok(last[2] > last[0] * 2 && last[2] > last[1] * 2, "last included frame should be blue, excluding yellow out: " + last);
}
async function records() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("splice-projects", 7);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction(["projects", "assets"], "readonly");
      const meta = tx.objectStore("projects").getAll(), assets = tx.objectStore("assets").getAll();
      tx.oncomplete = () => { resolve({ meta: meta.result, assets: assets.result.map((x) => ({ id: x.id, sourceSize: x.sourceVideo?.size, outputSize: x.video?.size })) }); db.close(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
}
try {
  await page.goto(url);
  await page.getByLabel("Source video file",{exact:true}).setInputFiles(fixture);
  await page.getByRole("button", { name: "Export video", exact: true }).waitFor();
  await saved();
  let stored = await records();
  assert.equal(stored.meta.length, 1); assert.ok(stored.assets[0].sourceSize); assert.equal(stored.assets[0].outputSize, undefined);
  console.log("PASS draft autosave before export");
  await time("Clip in time", "1:02:03:04");
  await page.getByRole("alert").filter({ hasText: "Use seconds" }).waitFor();
  assert.equal((await records()).meta[0].trimStart, 0);
  await time("Clip in time", "1");
  await time("Clip out time", "3");
  await page.getByRole("button", { name: "Add caption", exact: true }).click();
  await time("Caption 1 start time", "1.1");
  await time("Caption 1 end time", "2.9");
  await page.getByLabel("Caption 1 text", { exact: true }).fill("Krish — café\n你好");
  await saved();
  console.log("PASS invalid timecode and controlled caption input");
  // Escape discards a typed boundary; focused caption fields keep normal keys.
  await page.getByLabel("Clip in time", { exact: true }).fill("1.4");
  await page.getByLabel("Clip in time", { exact: true }).press("Escape");
  assert.equal(await page.getByLabel("Clip in time", { exact: true }).inputValue(), "00:00:01.000");
  const workspace = page.locator('section[aria-label="Editing workspace"]');
  await workspace.focus(); await workspace.press("ArrowRight");
  await page.getByText("Stepped using decoded source frame timestamps.", { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector("video").seeking && document.querySelector("video").currentTime > 0);
  await workspace.press("i");
  assert.notEqual(await page.getByLabel("Clip in time", { exact: true }).inputValue(), "00:00:01.000");
  await workspace.press("Control+z");
  assert.equal(await page.getByLabel("Clip in time", { exact: true }).inputValue(), "00:00:01.000");
  await page.getByLabel("Caption 1 text", { exact: true }).focus();
  await page.getByLabel("Caption 1 text", { exact: true }).press("Space");
  await page.getByLabel("Caption 1 text", { exact: true }).press("i");
  await page.getByLabel("Caption 1 text", { exact: true }).press("o");
  assert.equal(await page.locator("video").first().evaluate((video) => video.paused), true);
  assert.equal(await page.getByLabel("Clip in time", { exact: true }).inputValue(), "00:00:01.000");
  assert.equal(await page.getByLabel("Clip out time", { exact: true }).inputValue(), "00:00:03.000");
  await page.getByLabel("Caption 1 text", { exact: true }).fill("Krish — café\n你好"); await saved();
  const beforeDrag = (await records()).meta[0].revision;
  await page.getByRole("slider", { name: "Clip out point", exact: true }).scrollIntoViewIfNeeded();
  const handle = await page.getByRole("slider", { name: "Clip out point", exact: true }).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 8, handle.y + handle.height / 2, { steps: 6 });
  await page.mouse.up(); await saved();
  assert.equal((await records()).meta[0].revision, beforeDrag + 1, "one pointer drag is one edit");
  await page.getByRole("button", { name: /Undo · Change trim/ }).click();
  assert.equal(await page.getByLabel("Clip out time", { exact: true }).inputValue(), "00:00:03.000");
  console.log("PASS Escape, keyboard trim/undo, focused typing, and one undo entry per drag");

  const first = await exportVideo("automatic.mp4");
  checkBoundary(first.file);
  assert.equal(await page.locator("video").first().evaluate((video) => Math.round(video.duration)), 4);
  const subtitles = await page.getByRole("link", { name: "Current subtitles (.srt)", exact: true }).getAttribute("href");
  assert.match(decodeURIComponent(subtitles), /00:00:00,100 --> 00:00:01,900/);
  console.log("PASS export preserves source; audio and first/last frames are valid");
  await page.getByLabel("Caption 1 text", { exact: true }).fill("Corrected Krish — I/O\n你好");
  await time("Clip in time", "1.5");
  await page.getByRole("button", { name: /Undo · Change trim/ }).click();
  assert.equal(await page.getByLabel("Clip in time", { exact: true }).inputValue(), "00:00:01.000");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.equal(await page.getByLabel("Clip in time", { exact: true }).inputValue(), "00:00:01.500");
  assert.equal(await page.getByLabel("Caption 1 text", { exact: true }).inputValue(), "Corrected Krish — I/O\n你好");
  assert.equal(await page.getByRole("link", { name: "MP4", exact: true }).getAttribute("href"), first.href);
  await saved();

  await page.reload();
  await page.getByRole("button", { name:/^Open project(?::|$)/ }).click();
  await page.getByLabel("Caption 1 text", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Caption 1 text", { exact: true }).inputValue(), "Corrected Krish — I/O\n你好");
  assert.equal(await page.getByLabel("Clip in time", { exact: true }).inputValue(), "00:00:01.500");
  await page.getByRole("button", { name: "Export latest changes", exact: true }).waitFor();
  console.log("PASS undo/redo, caption correction, source and earlier export survive reload");
  await page.getByText("Export and storage details", { exact: true }).click();
  await page.getByLabel("Use compatible processor for the next export", { exact: true }).check();
  const fallback = await exportVideo("ffmpeg.mp4"); checkBoundary(fallback.file);
  console.log("PASS compatible processor preserves tracks and selection boundaries");
  // Force an export to remain active at worker setup, then cancel and retry.
  await time("Clip in time", "1.6");
  await page.getByLabel("Use compatible processor for the next export", { exact: true }).uncheck();
  await page.route("**/_next/static/chunks/*.js", async (route) => { await new Promise((resolve) => setTimeout(resolve, 1200)); await route.continue(); });
  await page.getByRole("button", { name: "Export latest changes", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForTimeout(2000);
  assert.equal(await page.getByRole("link", { name: "MP4", exact: true }).getAttribute("href"), fallback.href);
  assert.equal(await page.getByLabel("Caption 1 text", { exact: true }).inputValue(), "Corrected Krish — I/O\n你好");
  await page.unroute("**/_next/static/chunks/*.js");
  console.log("PASS cancellation ignores late work and retains previous export");
  // An intentional persistence failure leaves the current draft and file available.
  await page.evaluate(() => {
    window.cutmarkOriginalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function() { throw new DOMException("Test storage quota exhausted", "QuotaExceededError"); };
  });
  await page.getByLabel("Caption 1 text", { exact: true }).fill("Quota-safe correction");
  await page.getByRole("button", { name: "Retry saving", exact: true }).waitFor({ timeout: 10000 });
  assert.equal(await page.getByRole("link", { name: "MP4", exact: true }).getAttribute("href"), fallback.href);
  assert.equal(await page.getByLabel("Caption 1 text", { exact: true }).inputValue(), "Quota-safe correction");
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.cutmarkOriginalPut; });
  await page.getByRole("button", { name: "Retry saving", exact: true }).click(); await saved();
  console.log("PASS quota failure preserves corrections/download and retry succeeds");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(artifacts, "mobile.png"), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "mobile horizontal overflow");
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({ path: path.join(artifacts, "desktop.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log("PASS desktop/mobile layout and no uncaught browser errors");
  // Exercise native browser encoding without allowing an FFmpeg fallback.
  const noAudio = path.join(artifacts, "no-audio.mp4");
  ffmpeg(["-i", fixture, "-an", "-c:v", "copy", noAudio]);
  const nativeContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const nativePage = await nativeContext.newPage();
  await nativePage.route("**/ffmpeg/**", (route) => route.abort());
  await nativePage.route("**/ffmpeg-mt/**", (route) => route.abort());
  await nativePage.goto(url);
  await nativePage.getByLabel("Source video file",{exact:true}).setInputFiles(noAudio);
  await nativePage.getByRole("button", { name: "Export video", exact: true }).waitFor();
  assert.ok(await nativePage.getByRole("button", { name: "Generate selection captions", exact: true }).isDisabled());
  for (const [label, value] of [["Clip in time", "1"], ["Clip out time", "3"]]) {
    await nativePage.getByLabel(label, { exact: true }).fill(value); await nativePage.getByLabel(label, { exact: true }).press("Tab");
  }
  await nativePage.getByRole("button", { name: "Export video", exact: true }).click();
  await nativePage.getByRole("link", { name: "MP4", exact: true }).waitFor({ timeout: 60000 });
  const nativeData = await nativePage.getByRole("link", { name: "MP4", exact: true }).evaluate(async (link) => Array.from(new Uint8Array(await (await fetch(link.href)).arrayBuffer())));
  const nativeOutput = path.join(artifacts, "webcodecs.mp4"); fs.writeFileSync(nativeOutput, Buffer.from(nativeData)); checkBoundary(nativeOutput);
  console.log("PASS WebCodecs exports valid boundary frames with FFmpeg explicitly unavailable");
  await nativeContext.close();

  // Old databases migrate atomically, including export-only records, without five-project eviction.
  const legacyContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const legacyPage = await legacyContext.newPage();
  await legacyPage.goto(url + "/privacy/");
  const sourceBytes = Array.from(fs.readFileSync(fixture)), exportBytes = Array.from(fs.readFileSync(first.file));
  await legacyPage.evaluate(({ sourceBytes, exportBytes }) => new Promise((resolve, reject) => {
    const request = indexedDB.open("splice-projects", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recent", { keyPath: "id" });
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("recent", "readwrite");
      for (let i = 0; i < 7; i++) tx.objectStore("recent").put({
        id: "legacy-" + i, fileName: i === 0 ? "legacy-original.mp4" : "legacy-export-" + i + ".mp4", createdAt: 42 + i,
        video: new Blob([new Uint8Array(exportBytes)], { type: "video/mp4" }),
        ...(i === 0 ? { sourceVideo: new Blob([new Uint8Array(sourceBytes)], { type: "video/mp4" }), sourceDuration: 4, trimStart: 1, trimEnd: 3 } : {}),
        duration: 2, captionsVtt: "WEBVTT\n\n1\n00:00:00.100 --> 00:00:01.900\nLegacy correction\n",
        sceneMarkers: [1], sceneDetectionSucceeded: true,
      });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }), { sourceBytes, exportBytes });
  await legacyPage.goto(url);
  await legacyPage.getByRole("button", { name:/^Open project(?::|$)/ }).first().waitFor();
  assert.equal(await legacyPage.getByRole("button", { name:/^Open project(?::|$)/ }).count(), 7);
  await legacyPage.getByRole("article", {name:"legacy-original.mp4",exact:true}).getByRole("button", { name:/^Open project(?::|$)/ }).click();
  await legacyPage.getByLabel("Caption 1 start time", { exact: true }).waitFor();
  assert.equal(await legacyPage.getByLabel("Caption 1 start time", { exact: true }).inputValue(), "00:00:01.100");
  assert.equal(await legacyPage.getByLabel("Clip in time", { exact: true }).inputValue(), "00:00:01.000");
  await legacyPage.getByRole("button", { name: "New video", exact: true }).click();
  await legacyPage.getByRole("button", { name:/^Open project(?::|$)/ }).first().waitFor();
  assert.equal(await legacyPage.getByRole("button", { name:/^Open project(?::|$)/ }).count(), 7);
  await legacyPage.getByRole("article", {name:"legacy-export-1.mp4",exact:true}).getByRole("button", { name:/^Open project(?::|$)/ }).click();
  await legacyPage.getByText(/This older project only retained an exported video/).waitFor();
  assert.equal(await legacyPage.getByLabel("Caption 1 start time", { exact: true }).inputValue(), "00:00:00.100");
  await legacyPage.getByText("Export and storage details", { exact: true }).click();
  await legacyPage.getByText("Manage saved projects", { exact: true }).click();
  await legacyPage.getByRole("button", { name: "Delete saved project legacy-export-2.mp4", exact: true }).click();
  await legacyPage.getByRole("button", { name: "Delete project", exact: true }).click();
  await legacyPage.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await legacyPage.getByRole("button", { name: "Delete saved project legacy-export-2.mp4", exact: true }).count(), 0);
  assert.equal(await legacyPage.getByLabel("Caption 1 text", { exact: true }).inputValue(), "Legacy correction");
  console.log("PASS targeted project cleanup leaves the active editable project intact");
  console.log("PASS seven legacy records migrate; source and export-only timing are distinguished");
  await legacyContext.close();

  // Short, fractional, VFR and portrait clips are probed and exported with their real dimensions.
  const cases = [
    ["fractional", ["-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30000/1001:duration=3", "-c:v", "libx264"], "1.001", "2.002"],
    ["vfr", ["-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=3", "-vf", "select='if(lt(t,1),not(mod(n,2)),1)'", "-fps_mode", "vfr", "-c:v", "libx264"], "0.5", "2.5"],
    ["portrait", ["-f", "lavfi", "-i", "testsrc2=size=90x160:rate=30:duration=2", "-c:v", "libx264"], "0.5", "1.5"],
    ["one-frame", ["-f", "lavfi", "-i", "color=c=blue:size=160x90:rate=60", "-frames:v", "1", "-c:v", "libx264"], "0", null],
    ["hour-long", ["-f", "lavfi", "-i", "color=c=blue:size=32x32:rate=1:duration=3601", "-c:v", "libx264", "-preset", "ultrafast"], "00:59:59", "01:00:01"],
  ];
  for (const [name, args, start, end] of cases) {
    const input = path.join(artifacts, name + ".mp4"); ffmpeg([...args, "-pix_fmt", "yuv420p", input]);
    await page.getByRole("button", { name: "New video", exact: true }).click();
    await page.getByLabel("Source video file",{exact:true}).setInputFiles(input);
    await page.getByRole("button", { name: "Export video", exact: true }).waitFor();
    await time("Clip in time", start);
    if (end) await time("Clip out time", end);
    if (name !== "one-frame") {
      await openPlaybackOptions(page);await page.getByRole("button", { name: /Last included frame/ }).click();
      await page.getByText("Showing the last included source frame; the out point is excluded.", { exact: true }).waitFor({ timeout: 30000 });
      await page.waitForTimeout(100);
      const boundary = await page.locator("video").first().evaluate((video) => video.currentTime);
      assert.ok(boundary < end.split(":").map(Number).reduce((total, value) => total * 60 + value, 0));
      await page.getByRole("button", { name: "Previous frame", exact: true }).click();
      await page.getByText("Stepped using decoded source frame timestamps.", { exact: true }).waitFor();
      await page.waitForTimeout(100);
      const previous = await page.locator("video").first().evaluate((video) => video.currentTime);
      assert.ok(previous < boundary, "actual previous timestamp for " + name);
    }
    await exportVideo(name + "-output.mp4");
    console.log("PASS " + name + " source: boundary inspection, real frame timing, and playable export");
  }
  // Silent audio is a normal outcome and never replaces corrected cues.
  const silent = path.join(artifacts, "silent.mp4");
  ffmpeg(["-i", fixture, "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=16000", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-t", "4", silent]);
  await page.getByRole("button", { name: "New video", exact: true }).click();
  await page.getByLabel("Source video file",{exact:true}).setInputFiles(silent);
  await page.getByRole("button", { name: "Export video", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add caption", exact: true }).click();
  await page.getByLabel("Caption 1 text", { exact: true }).fill("Keep my correction");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Regenerate selection captions", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /silent/ }).waitFor({ timeout: 60000 });
  assert.equal(await page.getByLabel("Caption 1 text", { exact: true }).inputValue(), "Keep my correction");
  console.log("PASS silence leaves existing captions intact and keeps export enabled");

  // Blank text is an edit decision, even though an empty cue isn't delivered as a subtitle.
  await page.getByLabel("Caption 1 text", { exact: true }).fill(""); await saved();
  await page.reload(); await page.getByRole("button", { name:/^Open project(?::|$)/ }).first().click();
  await page.getByLabel("Caption 1 text", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Caption 1 text", { exact: true }).inputValue(), "");
  console.log("PASS blank caption edits survive saving and reopening");

  // A worker completion carrying corrupt bytes cannot replace a valid previous output.
  await page.getByRole("button", { name: "New video", exact: true }).click();
  await page.getByLabel("Source video file",{exact:true}).setInputFiles(noAudio);
  await page.getByRole("button", { name: "Export video", exact: true }).waitFor();
  await time("Clip in time", "1"); await time("Clip out time", "3");
  const validBeforeFailure = await exportVideo("before-corrupt.mp4");
  await time("Clip in time", "1.5");
  await page.evaluate(() => {
    window.cutmarkNativeWorker = window.Worker;
    window.Worker = class extends window.cutmarkNativeWorker {
      postMessage(data, transfer) { if (data.kind) return super.postMessage(data, transfer); setTimeout(() => this.onmessage?.({ data: { type: "complete", buffer: new Uint8Array([1, 2, 3]).buffer } }), 30); }
    };
  });
  await page.getByRole("button", { name: "Export latest changes", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: /\S/ }).waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole("link", { name: "MP4", exact: true }).getAttribute("href"), validBeforeFailure.href);
  await page.evaluate(() => { window.Worker = window.cutmarkNativeWorker; });
  await exportVideo("after-corrupt-retry.mp4");
  console.log("PASS corrupt completion is rejected, previous file survives, and retry works");

  // Scene scanning can be stopped while seeking without losing an existing marker.
  await openPlaybackOptions(page);await page.getByRole("button", { name: "Last included frame", exact: true }).click();
  await page.getByText("Showing the last included source frame; the out point is excluded.", { exact: true }).waitFor();
  await openEditingTools(page);await page.getByText(/Scene cuts · 0 markers/).click();
  await page.getByRole("button", { name: "Add cut at playhead", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Rescan cuts", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.getByLabel("Clip in time", { exact: true }).inputValue(), "00:00:01.500");
  await page.getByText("Scene cuts · 1 markers", { exact: true }).waitFor();
  console.log("PASS scene scan cancellation retains range and existing markers");

  // Model download failure and cancellation preserve the manually edited transcript.
  await page.getByRole("button", { name: "New video", exact: true }).click();
  await page.getByLabel("Source video file",{exact:true}).setInputFiles(fixture);
  await page.getByRole("button", { name: "Export video", exact: true }).waitFor();
  await page.getByRole("button", { name: "Add caption", exact: true }).click();
  await page.getByLabel("Caption 1 text", { exact: true }).fill("Keep the corrected name");
  await page.route("https://huggingface.co/**", (route) => route.abort());
  await page.route("https://cdn-lfs.huggingface.co/**", (route) => route.abort());
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Regenerate selection captions", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: /\S/ }).waitFor({ timeout: 90000 });
  assert.equal(await page.getByLabel("Caption 1 text", { exact: true }).inputValue(), "Keep the corrected name");
  await page.route("**/_next/static/chunks/*.js", async (route) => { await new Promise((resolve) => setTimeout(resolve, 1500)); await route.continue(); });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Regenerate selection captions", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.unroute("**/_next/static/chunks/*.js");
  assert.equal(await page.getByLabel("Caption 1 text", { exact: true }).inputValue(), "Keep the corrected name");
  console.log("PASS model failure and transcription cancellation preserve corrections");

  // Known HDR metadata may be retained verbatim, but cannot enter an unverified re-encode.
  const hdr = path.join(artifacts, "hdr-metadata.mp4");
  ffmpeg(["-f", "lavfi", "-i", "color=c=blue:size=160x90:rate=30:duration=2", "-c:v", "libx264", "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc", hdr]);
  await page.getByRole("button", { name: "New video", exact: true }).click();
  await page.getByLabel("Source video file",{exact:true}).setInputFiles(hdr);
  await page.getByText("Export and storage details", { exact: true }).click();
  await page.getByText(/This source has HDR or wide-color metadata/).waitFor();
  await time("Clip in time", "0.5");
  assert.equal(await page.getByRole("button", { name: "Export video", exact: true }).isDisabled(), true);
  console.log("PASS HDR metadata is detected and unverified color conversion is blocked");
  assert.deepEqual(errors, []);

  console.log("Artifacts: " + artifacts);
} catch (error) { await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }); console.log((await page.locator("body").innerText()).slice(-6000)); console.log("Browser errors:", errors); throw error; } finally { await browser.close(); }
