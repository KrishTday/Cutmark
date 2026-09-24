import assert from "node:assert/strict";
import test from "node:test";
import { isValidTrimRange } from "../lambda/start-job/trim-range";

test("accepts a positive range beginning at zero", () => {
  assert.equal(isValidTrimRange(0, 0.1), true);
});

test("rejects empty, reversed, negative, and non-finite ranges", () => {
  for (const [start, end] of [[2, 2], [3, 2], [-1, 2], [0, Infinity], [NaN, 4]]) {
    assert.equal(isValidTrimRange(start, end), false, `${start}..${end}`);
  }
});
