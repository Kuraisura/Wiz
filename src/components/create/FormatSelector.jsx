import React from "react";
import { CheckSquare, Square, ListChecks, ToggleLeft, GitCompare } from "lucide-react";

const formats = [
  { key: "Multiple Choice", icon: ListChecks },
  { key: "Identification", icon: CheckSquare },
  { key: "Matching Type", icon: GitCompare },
  { key: "True / False", icon: ToggleLeft },
];

export default function FormatSelector({ selected, setSelected }) {
  const toggle = (key) =>
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  return (
    <section>
      <h3 className="font-semibold text-sm text-foreground mb-1">Quiz Question Format</h3>
      <p className="text-xs text-muted-foreground mb-3">Select one or more styles for question generation</p>
      <div className="grid grid-cols-2 gap-2.5">
        {formats.map(({ key, icon: Icon }) => {
          const active = selected.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`flex items-center gap-2.5 rounded-2xl border p-3.5 text-left transition-all ${
                active
                  ? "border-primary bg-accent/60 shadow-sm"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-sm font-medium ${active ? "text-primary" : "text-foreground"}`}>{key}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}