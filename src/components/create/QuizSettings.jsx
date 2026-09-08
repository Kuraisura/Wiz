import React from "react";

const counts = [10, 20, 30, 50, 100];
const difficulties = [
  { value: "Warmup", label: "Warmup", sub: "Easy" },
  { value: "Standard", label: "Standard", sub: "Medium" },
  { value: "Exam Ready", label: "Exam Ready", sub: "Hard" },
];

export default function QuizSettings({ count, setCount, difficulty, setDifficulty }) {
  return (
    <section className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="font-semibold text-sm text-foreground">Question Count</h3>
          <span className="text-xs text-muted-foreground">{count} Questions</span>
        </div>
        <div className="flex gap-2">
          {counts.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={`flex-1 h-10 rounded-xl text-sm font-medium transition-all ${
                count === c
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border text-foreground hover:border-primary/30"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="font-semibold text-sm text-foreground">Difficulty Target</h3>
          <span className="text-xs text-muted-foreground">{difficulty}</span>
        </div>
        <div className="flex gap-2">
          {difficulties.map((d) => (
            <button
              key={d.value}
              onClick={() => setDifficulty(d.value)}
              className={`flex-1 h-10 rounded-xl text-xs font-medium px-1 transition-all ${
                difficulty === d.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border border-border text-foreground hover:border-primary/30"
              }`}
            >
              <div className="flex flex-col items-center leading-tight">
                <span>{d.label}</span>
                <span className="text-[9px] opacity-70">{d.sub}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}