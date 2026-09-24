import { BeaconLogo } from "../brand/logo";

export function BeaconHeader() {
  return (
    <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-4 backdrop-blur-xl">
      <BeaconLogo />
      <div className="text-right text-sm text-slate-400">
        <div className="font-medium text-slate-200">Evidence-first AI Infrastructure</div>
        <div>Human-in-the-loop Decision System</div>
      </div>
    </header>
  );
}
