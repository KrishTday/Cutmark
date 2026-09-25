import Editor from "@/components/Editor";

function BrandMark() {
  return <svg viewBox="0 0 22 22" className="size-[18px]" fill="none" aria-hidden="true"><path d="M4 6h14M4 11h8M4 16h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="m13.2 8.2 3.1 2.8-3.1 2.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export default function Home() {
  return <main className="mx-auto min-h-screen max-w-[1360px] px-4 pb-10 sm:px-7 lg:px-10">
    <header className="flex h-[68px] items-center justify-between border-b border-white/[0.07]">
      <a href="/" className="flex items-center gap-2.5 text-ink" aria-label="Cutmark home">
        <span className="grid size-8 place-items-center rounded-[10px] bg-accent text-[#17131F]"><BrandMark /></span>
        <span className="text-[15px] font-semibold tracking-[-0.04em]">cutmark<span className="text-accent">.</span></span>
        <span className="ml-1 hidden border-l border-white/10 pl-3 text-[10px] font-medium tracking-wide text-ink-faint sm:inline">VIDEO STUDIO</span>
      </a>
      <div className="flex items-center gap-3">
        <a href="https://github.com/KrishTday/splice" target="_blank" rel="noreferrer" className="rounded-lg border border-line-strong px-3 py-2 text-[11px] font-medium text-ink-muted transition-colors duration-200 hover:bg-white/[0.05] hover:text-ink focus-visible:outline-accent">Source <span aria-hidden="true" className="ml-1">↗</span></a>
      </div>
    </header>

    <section className="flex flex-wrap items-end justify-between gap-4 py-7 sm:py-9">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Video editor</p>
        <h1 className="text-[26px] font-semibold tracking-[-0.045em] text-ink sm:text-[32px]">Make a clean cut.</h1>
        <p className="mt-2 text-xs leading-5 text-ink-muted sm:text-[13px]">Runs locally in your browser.</p>
      </div>
    </section>

    <Editor />
  </main>;
}
