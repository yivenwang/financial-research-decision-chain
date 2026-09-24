export function BeaconLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/30 bg-cyan-300/10">
        <svg viewBox="0 0 48 48" className="h-7 w-7" aria-label="Beacon logo">
          <path d="M24 5 34 13v22L24 43 14 35V13z" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M18 25h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M24 13v12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <div className="text-lg font-semibold tracking-tight text-white">Beacon <span className="text-cyan-300">|</span> 研灯</div>
        <div className="text-xs tracking-[0.25em] text-slate-400">AI RESEARCH DECISION CHAIN</div>
      </div>
    </div>
  );
}
