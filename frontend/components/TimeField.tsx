"use client";
import { useState, useRef } from "react";
import { formatTime, parseTime } from "@/lib/timing";
export default function TimeField({ value, label, disabled, validate, onCommit }: {
  value: number; label: string; disabled?: boolean;
  validate: (value: number) => string | null; onCommit: (value: number) => void;
}) {
  const cancelled = useRef(false);
  const [draft, setDraft] = useState<{ value: number; text: string; error: string }>({ value, text: formatTime(value), error: "" });
  if(draft.value!==value)setDraft({value,text:formatTime(value),error:""});
  const text = draft.value === value ? draft.text : formatTime(value);
  const error = draft.value === value ? draft.error : "";
  const commit = () => {
    const parsed = parseTime(text);
    const message = parsed === null ? "Use seconds, MM:SS or HH:MM:SS, with optional decimals." : validate(parsed);
    if (message) { setDraft({ value, text, error: message }); return; }
    onCommit(parsed!);
    setDraft({ value: parsed!, text: formatTime(parsed!), error: "" });
  };
  return <span className="block min-w-0 flex-1">
    <input aria-label={label} aria-invalid={Boolean(error)} title="Seconds, MM:SS or HH:MM:SS; optional decimal seconds" type="text" inputMode="decimal" disabled={disabled}
      value={text} onChange={(event) => setDraft({ value, text: event.target.value, error: "" })}
      onBlur={() => { if (cancelled.current) { cancelled.current = false; return; } commit(); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { cancelled.current = true; setDraft({ value, text: formatTime(value), error: "" }); event.currentTarget.blur(); } }}
      className="min-h-10 w-full min-w-0 rounded-md border border-line-strong bg-[#15161B] px-2.5 py-2 font-mono text-xs tabular-nums text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-40" />
    {error && <span role="alert" className="mt-1 block text-[11px] text-rose-300">{error}</span>}
  </span>;
}
