export function BeaconWorkflow() {
  const steps = ["Question", "Evidence", "Change", "Impact", "Decision"];

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-6 backdrop-blur-xl">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-cyan-300/80">
        Beacon Research Workflow
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-5">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center gap-3">
            <div className="flex h-12 w-full items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/5 text-sm font-medium text-slate-100">
              {step}
            </div>
            {index < steps.length - 1 && (
              <span className="hidden text-cyan-300/60 md:block">→</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
