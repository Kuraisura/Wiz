import React from "react";

export default function ScopeSection({ scope, setScope }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="font-semibold text-sm text-foreground">Review Scope & Focus <span className="text-muted-foreground font-normal">(optional)</span></h3>
        {scope && (
          <button onClick={() => setScope("")} className="text-xs font-medium text-primary">Clear</button>
        )}
      </div>
      <textarea
        value={scope}
        onChange={(e) => setScope(e.target.value)}
        rows={4}
        placeholder="Optionally describe what you want the quiz to focus on"
        className="w-full rounded-2xl border border-border bg-card p-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
      />
    </section>
  );
}
