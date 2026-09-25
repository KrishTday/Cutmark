import Link from "next/link";

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:px-8">
    <header className="flex items-center justify-between border-b border-white/[0.07] pb-5">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink focus-visible:outline-accent">
        <span className="grid size-8 place-items-center rounded-[10px] bg-accent text-[#17131F]" aria-hidden="true">c.</span>
        cutmark<span className="text-accent">.</span>
      </Link>
      <Link href="/" className="rounded-lg border border-line-strong px-3 py-2 text-xs text-ink-muted transition-colors hover:bg-white/[0.05] hover:text-ink">Back to editor</Link>
    </header>
    <article className="py-10">
      <p className="text-[10px] uppercase tracking-[0.16em] text-accent">Cutmark</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 text-xs text-ink-faint">Last updated {updated}</p>
      <div className="legal-copy mt-8 space-y-7 text-sm leading-7 text-ink-muted">{children}</div>
    </article>
    <footer className="flex gap-5 border-t border-white/[0.07] py-5 text-xs text-ink-faint">
      <Link className="hover:text-ink" href="/privacy">Privacy</Link>
      <Link className="hover:text-ink" href="/terms">Terms</Link>
      <a className="hover:text-ink" href="https://github.com/KrishTday/Cutmark/issues" target="_blank" rel="noreferrer">Support</a>
    </footer>
  </main>;
}
