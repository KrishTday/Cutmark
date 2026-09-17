import Editor from "@/components/Editor";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      <header className="flex items-center justify-between border-b border-line py-5">
        <div className="font-display text-2xl font-bold tracking-tight">Splice</div>
        <a
          href="https://github.com/"
          className="font-mono text-sm text-ink-muted underline decoration-line-strong decoration-1 underline-offset-4 hover:text-accent"
        >
          source
        </a>
      </header>

      <section className="grid grid-cols-1 gap-6 border-b border-line py-10 md:grid-cols-[2fr_1fr]">
        <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl">
          Trim a clip. Get the cuts and captions back automatically.
        </h1>
        <p className="self-end text-ink-muted">
          Upload a video, set the in and out points, and Splice hands the rest to AWS: FFmpeg trims the
          clip and finds scene changes, Transcribe writes the captions.
        </p>
      </section>

      <Editor />

      <footer className="mt-16 border-t border-line py-8 text-sm text-ink-muted">
        <p>
          Pipeline: S3 (direct upload) → Step Functions → FFmpeg (Lambda container) + AWS Transcribe →
          CloudFront. Infrastructure defined in CDK — see the repository for the full architecture.
        </p>
      </footer>
    </main>
  );
}
