import Editor from "@/components/Editor";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      <header className="flex items-center justify-between border-b border-line py-5">
        <div className="font-display text-2xl font-bold tracking-tight">Splice</div>
        <a
          href="https://github.com/KrishTday/splice"
          className="font-mono text-sm text-ink-muted underline decoration-line-strong decoration-1 underline-offset-4 hover:text-accent"
        >
          source
        </a>
      </header>

      <section className="grid grid-cols-1 gap-6 border-b border-line py-10 md:grid-cols-[2fr_1fr]">
        <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl">
          Shape a clip. Find the cuts and captions automatically.
        </h1>
        <p className="self-end text-ink-muted">
          Trim a video, find scene changes, and generate captions — right in your browser. Your video stays on your device.
        </p>
      </section>

      <Editor />

      <footer className="mt-16 border-t border-line py-8 text-sm text-ink-muted">
        <p>
          Video editing and transcription run locally in your browser with FFmpeg WebAssembly and Whisper Tiny.
        </p>
      </footer>
    </main>
  );
}
