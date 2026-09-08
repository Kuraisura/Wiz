import React from "react";

function AvgRing({ value }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90 shrink-0">
      <circle cx="19" cy="19" r={r} fill="none" stroke="currentColor" strokeWidth="3.5" className="text-primary/15" />
      <circle
        cx="19" cy="19" r={r} fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
        className="text-primary transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
  );
}

export default function StatsRow({ completed, avg, focus }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <div className="rounded-2xl bg-card border border-border p-3 shadow-sm flex flex-col items-center text-center">
        <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Completed</p>
        <p className="text-2xl font-bold text-foreground mt-1">{completed}</p>
        <p className="text-[11px] text-muted-foreground">Total tests</p>
      </div>
      <div className="rounded-2xl bg-card border border-border p-3 shadow-sm flex flex-col items-center text-center">
        <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Avg Score</p>
        <div className="flex items-center justify-center gap-2 mt-1">
          <AvgRing value={avg} />
          <p className="text-2xl font-bold text-foreground">{avg}%</p>
        </div>
        <p className="text-[11px] text-muted-foreground">Avg score</p>
      </div>
      <div className="rounded-2xl bg-card border border-border p-3 shadow-sm flex flex-col items-center text-center">
        <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Focus</p>
        <p className="text-2xl font-bold text-foreground mt-1">{focus}h</p>
        <p className="text-[11px] text-muted-foreground">Study time</p>
      </div>
    </div>
  );
}
