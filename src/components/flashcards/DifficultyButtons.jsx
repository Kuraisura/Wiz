import React from "react";
import { Frown, Smile, Laugh } from "lucide-react";

const options = [
  { key: "Hard", interval: "< 1 min", icon: Frown, classes: "bg-red-100 text-red-800 active:bg-red-200" },
  { key: "Good", interval: "1 day", icon: Smile, classes: "bg-cyan-100 text-cyan-800 active:bg-cyan-200" },
  { key: "Easy", interval: "4 days", icon: Laugh, classes: "bg-violet-100 text-violet-800 active:bg-violet-200" },
];

export default function DifficultyButtons({ onRate }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground text-right mb-1.5">Interval Scheduling</p>
      <div className="grid grid-cols-3 gap-2.5">
        {options.map(({ key, interval, icon: Icon, classes }) => (
          <button
            key={key}
            onClick={() => onRate(key, interval)}
            className={`rounded-2xl py-3 flex flex-col items-center gap-1 transition-all duration-200 active:scale-95 hover:-translate-y-0.5 hover:shadow-md ${classes}`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-sm font-bold">{key}</span>
            <span className="text-[11px] font-medium opacity-80">{interval}</span>
          </button>
        ))}
      </div>
    </div>
  );
}