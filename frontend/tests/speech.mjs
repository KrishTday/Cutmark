import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.CUTMARK_PLAYWRIGHT_PATH || "playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
try {
  await page.goto(process.env.CUTMARK_TEST_URL || "http://127.0.0.1:4174");
  await page.getByLabel("Source video file",{exact:true}).setInputFiles(process.env.CUTMARK_SPEECH_FIXTURE);
  await page.getByRole("button", { name: "Export video", exact: true }).waitFor();
  await page.getByRole("button", { name: "Generate selection captions", exact: true }).click();
  let previous = "";
  for (let i = 0; i < 120; i++) {
    if (await page.getByLabel("Caption 1 text", { exact: true }).count()) break;
    const error = (await page.getByRole("alert").allTextContents()).filter((text) => text.trim());
    if (error.length) throw new Error(error.join(" "));
    const body = (await page.locator("body").innerText()).slice(-2500);
    if (body !== previous) { console.log(body.match(/(?:Downloading|Loading|Transcribing|Preparing)[^\n]+/g)?.join(" · ") || "Caption processing continues"); previous = body; }
    await page.waitForTimeout(1000);
  }
  await page.getByLabel("Caption 1 text", { exact: true }).waitFor({ timeout: 5000 });
  const recognized = await page.locator('textarea[aria-label$=" text"]').evaluateAll((areas) => areas.map((area) => area.value));
  assert.ok(recognized.some((text) => text.trim()));
  console.log("Recognized:", recognized);
  assert.equal(await page.getByRole("link", { name: "MP4", exact: true }).count(), 0, "no encode needed for transcription");
  await page.getByLabel("Caption 1 text", { exact: true }).fill("My name is Krish, corrected locally.");
  await page.getByText("Saved in this browser", { exact: true }).first().waitFor();
  await page.route("https://huggingface.co/**", (route) => route.abort());
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Regenerate selection captions", exact: true }).click();
  await page.getByRole("button", { name: /Undo · Generate captions/ }).waitFor({ timeout: 120000 });
  await page.getByRole("button", { name: /Undo · Generate captions/ }).click();
  assert.equal(await page.getByLabel("Caption 1 text", { exact: true }).inputValue(), "My name is Krish, corrected locally.");
  await page.getByText("How local transcription works",{exact:true}).click();await page.getByText("English model weights are cached on this device.", {exact:true}).waitFor();
  for (const [label,value] of [["Clip in time","2"],["Clip out time","6"]]) { await page.getByLabel(label,{exact:true}).fill(value);await page.getByLabel(label,{exact:true}).press("Tab"); }
  await page.getByLabel("Caption transcription scope",{exact:true}).selectOption("source");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button",{name:"Regenerate full source captions",exact:true}).click();
  await page.getByRole("button",{name:/Undo · Generate captions/}).waitFor({timeout:120000});
  assert.equal(await page.getByLabel("Caption 1 start time",{exact:true}).inputValue(),"00:00:00.000");
  assert.match(await page.getByLabel("Caption 1 text",{exact:true}).inputValue(),/This is Cutmark/);
  assert.equal(await page.getByLabel("Clip in time",{exact:true}).inputValue(),"00:00:02.000");
  console.log("PASS full-source transcription keeps source timestamps outside a shorter output selection");
  console.log("PASS first model download, English transcription before export, cached retry without model network, and undo restoring corrected captions");
} catch (error) {
  console.log((await page.locator("body").innerText()).slice(-3500));
  throw error;
} finally { await browser.close(); }
