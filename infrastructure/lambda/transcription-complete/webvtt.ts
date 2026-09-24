export interface TranscribeItem {
  start_time?: string;
  end_time?: string;
  type: "pronunciation" | "punctuation";
  alternatives: { content: string; confidence?: string }[];
}

const MAX_WORDS_PER_CUE = 12;
const MAX_CUE_SECONDS = 6;
const SENTENCE_ENDERS = new Set([".", "!", "?"]);

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
  const secWhole = Math.floor(seconds);
  const ms = Math.round((seconds - secWhole) * 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(secWhole)}.${pad(ms, 3)}`;
}

export function itemsToVtt(items: TranscribeItem[], trimStart: number, trimEnd: number): string {
  // Transcribe runs on the full source audio, so keep words in [trimStart,
  // trimEnd) and shift their timestamps to the trimmed clip's timeline.
  const windowed: TranscribeItem[] = [];
  let lastWordInWindow = false;

  for (const item of items) {
    if (item.type === "pronunciation") {
      const start = parseFloat(item.start_time ?? "0");
      lastWordInWindow = start >= trimStart && start < trimEnd;
      if (lastWordInWindow) {
        windowed.push({
          ...item,
          start_time: String(Math.max(0, start - trimStart)),
          end_time: String(Math.max(0, parseFloat(item.end_time ?? String(start)) - trimStart)),
        });
      }
    } else if (lastWordInWindow) {
      windowed.push(item);
    }
  }

  const cues: { start: number; end: number; text: string }[] = [];
  let words: string[] = [];
  let cueStart: number | null = null;
  let cueEnd = 0;

  const flush = () => {
    if (words.length === 0 || cueStart === null) return;
    cues.push({ start: cueStart, end: cueEnd, text: words.join(" ").replace(/ ([,.!?])/g, "$1") });
    words = [];
    cueStart = null;
  };

  for (const item of windowed) {
    const content = item.alternatives[0]?.content ?? "";
    if (!content) continue;
    if (item.type === "punctuation") {
      words.push(content);
      if (SENTENCE_ENDERS.has(content)) flush();
      continue;
    }

    const start = parseFloat(item.start_time ?? "0");
    const end = parseFloat(item.end_time ?? String(start));
    if (cueStart === null) cueStart = start;
    words.push(content);
    cueEnd = end;
    if (words.length >= MAX_WORDS_PER_CUE || end - cueStart >= MAX_CUE_SECONDS) flush();
  }
  flush();

  const body = cues
    .map((cue, i) => `${i + 1}\n${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${cue.text}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}
