import assert from "node:assert/strict";
import test from "node:test";
import { itemsToVtt, TranscribeItem } from "../lambda/transcription-complete/webvtt";

const word = (text: string, start: number, end: number): TranscribeItem => ({
  type: "pronunciation",
  start_time: String(start),
  end_time: String(end),
  alternatives: [{ content: text }],
});

const punctuation = (text: string): TranscribeItem => ({ type: "punctuation", alternatives: [{ content: text }] });

test("filters words to [trimStart, trimEnd) and offsets cue timestamps", () => {
  const vtt = itemsToVtt([
    word("before", 1, 1.4), punctuation(","),
    word("kept", 2, 2.5), punctuation("."),
    word("at-end", 5, 5.2),
  ], 2, 5);

  assert.equal(vtt, "WEBVTT\n\n1\n00:00:00.000 --> 00:00:00.500\nkept.\n");
});

test("formats millisecond offsets for words inside the trim range", () => {
  const vtt = itemsToVtt([word("hello", 9.125, 9.875), punctuation("!")], 9, 10);
  assert.match(vtt, /00:00:00\.125 --> 00:00:00\.875\nhello!/);
});
