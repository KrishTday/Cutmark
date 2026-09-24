"use client";

import type { CaptionCue } from "@/lib/captions";

interface TranscriptEditorProps {
  cues: CaptionCue[];
  duration: number;
  onChange: (cues: CaptionCue[]) => void;
}

function formatTime(time: number) {
  const ms = Math.max(0, Math.round(time * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

function parseTime(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (text.includes(":")) {
    const parts = text.split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
    if (parts.length === 3 && parts[1] < 60 && parts[2] < 60) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2 && parts[1] < 60) return parts[0] * 60 + parts[1];
    return null;
  }
  const seconds = Number(text);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export default function TranscriptEditor({ cues, duration, onChange }: TranscriptEditorProps) {
  const updateCue = (id: number, update: Partial<CaptionCue>) => onChange(cues.map((cue) => cue.id === id ? { ...cue, ...update } : cue));
  const removeCue = (id: number) => onChange(cues.filter((cue) => cue.id !== id));
  const addCue = () => {
    let start = cues.length ? Math.min(duration, Math.max(...cues.map((cue) => cue.end))) : 0;
    if (start >= duration) start = Math.max(0, duration - 2);
    const end = Math.min(duration, start + 2);
    onChange([...cues, { id: Math.max(0, ...cues.map((cue) => cue.id)) + 1, start, end, text: "New caption" }]);
  };

  return <section className="mt-6 rounded-xl border border-line bg-[#18191F] p-4 sm:p-5" aria-label="Caption transcript editor">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">Transcript</h2>
        <p className="mt-1 text-[11px] text-ink-muted">Edit the words or timestamps, then download the updated captions.</p>
      </div>
      <button type="button" onClick={addCue} disabled={duration <= 0} className="rounded-md border border-line px-3 py-2 text-[11px] font-medium text-ink-muted transition-colors hover:border-line-strong hover:bg-white/[0.04] hover:text-ink focus-visible:outline-accent disabled:opacity-40">Add caption</button>
    </div>
    <div className="mt-4 space-y-2">
      {cues.map((cue) => <article key={cue.id} className="grid gap-3 rounded-lg border border-line bg-[#202127] p-3 transition-colors duration-200 hover:border-line-strong sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:items-center">
        <label className="flex items-center gap-2 text-[10px] text-ink-faint">
          <span>In</span>
          <input key={`start-${cue.id}-${cue.start}`} aria-label={`Caption ${cue.id} start time`} defaultValue={formatTime(cue.start)} onBlur={(event) => {
            const value = parseTime(event.currentTarget.value);
            if (value === null || value >= cue.end) event.currentTarget.value = formatTime(cue.start);
            else updateCue(cue.id, { start: Math.min(duration, value) });
          }} className="w-[112px] rounded-md border border-line-strong bg-[#15161B] px-2.5 py-2 font-mono text-[11px] tabular-nums text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/10" />
        </label>
        <label className="flex items-center gap-2 text-[10px] text-ink-faint">
          <span>Out</span>
          <input key={`end-${cue.id}-${cue.end}`} aria-label={`Caption ${cue.id} end time`} defaultValue={formatTime(cue.end)} onBlur={(event) => {
            const value = parseTime(event.currentTarget.value);
            if (value === null || value <= cue.start || value > duration) event.currentTarget.value = formatTime(cue.end);
            else updateCue(cue.id, { end: value });
          }} className="w-[112px] rounded-md border border-line-strong bg-[#15161B] px-2.5 py-2 font-mono text-[11px] tabular-nums text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/10" />
        </label>
        <textarea aria-label={`Caption ${cue.id} text`} rows={1} defaultValue={cue.text} onBlur={(event) => updateCue(cue.id, { text: event.currentTarget.value })} className="min-h-10 w-full resize-y rounded-md border border-line-strong bg-[#15161B] px-3 py-2.5 text-xs leading-relaxed text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/10" />
        <button type="button" onClick={() => removeCue(cue.id)} aria-label={`Remove caption ${cue.id}`} className="justify-self-end rounded px-2 py-1.5 text-[11px] text-ink-faint transition-colors hover:bg-rose-950/30 hover:text-rose-300 focus-visible:outline-accent">Remove</button>
      </article>)}
    </div>
    {!cues.length && <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-surface-raised/40 px-3 py-4 text-xs text-ink-muted">No caption cues yet. Add one to create a caption for this clip.</p>}
  </section>;
}
