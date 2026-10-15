import { escapeSubtitleText, decodeSubtitleText } from "./subtitle-text";
import { formatTime as formatVttTime, parseTime } from "./timing";
export interface CaptionCue {
  id: number;
  start: number;
  end: number;
  text: string;
  acknowledgedWarnings?: string[];
  reviewNote?: string;
}

function parseVttTime(value: string): number | null {
  const match = value.trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  return parseTime(value);
}

export function parseCaptions(vtt: string): CaptionCue[] {
  return vtt.split(/\r?\n\s*\r?\n/).flatMap((block, index) => {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timingLine = lines.findIndex((line) => line.includes("-->"));
    if (timingLine < 0) return [];
    const [startText, endText] = lines[timingLine].split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const start = parseVttTime(startText);
    const end = parseVttTime(endText);
    const text = decodeSubtitleText(lines.slice(timingLine + 1).join("\n").trim());
    if (start === null || end === null || end <= start || !text) return [];
    const identifier = timingLine > 0 && /^\d+$/.test(lines[timingLine - 1]) ? Number(lines[timingLine - 1]) : index + 1;
    return [{ id: identifier, start, end, text }];
  });
}

/** Subtitle timestamps have millisecond precision; never emit a collapsed interval. */
export function isSubtitleInterval(start: number, end: number): boolean {
  const from = Math.round(start * 1000), to = Math.round(end * 1000);
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 0 && to > from;
}

export function serializeCaptions(cues: CaptionCue[]): string {
  const ordered = [...cues].filter((cue) => cue.text.trim() && isSubtitleInterval(cue.start, cue.end)).sort((a, b) => a.start - b.start);
  if (!ordered.length) return "WEBVTT\n\n";
  return `WEBVTT\n\n${ordered.map((cue) => `${cue.id}\n${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}\n${escapeSubtitleText(cue.text.trim())}`).join("\n\n")}\n`;
}

export function serializeSubRip(cues: CaptionCue[]): string {
  const format = (time: number) => formatVttTime(time).replace(".", ",");
  const ordered = [...cues].filter((cue) => cue.text.trim() && isSubtitleInterval(cue.start, cue.end)).sort((a, b) => a.start - b.start);
  return ordered.map((cue, index) => `${index + 1}\n${format(cue.start)} --> ${format(cue.end)}\n${escapeSubtitleText(cue.text.trim())}`).join("\n\n") + (ordered.length ? "\n" : "");
}
