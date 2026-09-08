import React from "react";

const tint = [
  "bg-indigo-100 text-indigo-700",
  "bg-cyan-100 text-cyan-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-slate-100 text-slate-700",
];

export default function FolderChips({ folders, selected, onSelect }) {
  return (
    <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
      {folders.map((f, i) => {
        const active = selected === f.name;
        return (
          <button
            key={f.name}
            onClick={() => onSelect(f.name)}
            className={`shrink-0 rounded-2xl px-4 py-3 text-left transition-all duration-200 active:scale-95 hover:-translate-y-0.5 hover:shadow-md ${
              active ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : tint[i % tint.length]
            }`}
          >
            <p className="text-sm font-bold">{f.name}</p>
            <p className={`text-[11px] ${active ? "text-primary-foreground/80" : "opacity-75"}`}>
              {f.count} {f.count === 1 ? "file" : "files"}
            </p>
          </button>
        );
      })}
    </div>
  );
}