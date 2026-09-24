export interface CaptionCue {
  id: number;
  start: number;
  end: number;
  text: string;
}

function parseVttTime(value: string): number | null {
  const match = value.trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

export function parseCaptions(vtt: string): CaptionCue[] {
  return vtt.split(/\r?\n\s*\r?\n/).flatMap((block, index) => {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timingLine = lines.findIndex((line) => line.includes("-->"));
    if (timingLine < 0) return [];
    const [startText, endText] = lines[timingLine].split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const start = parseVttTime(startText);
    const end = parseVttTime(endText);
    const text = lines.slice(timingLine + 1).join("\n").trim();
    if (start === null || end === null || end <= start || !text) return [];
    return [{ id: index + 1, start, end, text }];
  });
}

function formatVttTime(time: number): string {
  const milliseconds = Math.max(0, Math.round(time * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}

export function serializeCaptions(cues: CaptionCue[]): string {
  const ordered = [...cues].filter((cue) => cue.text.trim() && cue.end > cue.start).sort((a, b) => a.start - b.start);
  if (!ordered.length) return "WEBVTT\n\n";
  return `WEBVTT\n\n${ordered.map((cue, index) => `${index + 1}\n${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}\n${cue.text.trim()}`).join("\n\n")}\n`;
}

export function serializeSubRip(cues: CaptionCue[]): string {
  const format = (time: number) => formatVttTime(time).replace(".", ",");
  const ordered = [...cues].filter((cue) => cue.text.trim() && cue.end > cue.start).sort((a, b) => a.start - b.start);
  return ordered.map((cue, index) => `${index + 1}\n${format(cue.start)} --> ${format(cue.end)}\n${cue.text.trim()}`).join("\n\n") + (ordered.length ? "\n" : "");
}
