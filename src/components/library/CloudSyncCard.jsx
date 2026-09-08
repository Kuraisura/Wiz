import React from "react";
import { Cloud } from "lucide-react";

export default function CloudSyncCard({ usedMB }) {
  const totalMB = 2048;
  const pct = Math.min(100, (usedMB / totalMB) * 100);
  const label = usedMB >= 1024 ? `${(usedMB / 1024).toFixed(2)} GB` : `${usedMB.toFixed(1)} MB`;

  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
          <Cloud className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-foreground">Wiz Cloud Sync</p>
          <p className="text-xs text-muted-foreground">{label} of 2 GB used</p>
        </div>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden mt-3">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}