import React from "react";

export default function WizLogo({ size = 40, withWordmark = false }) {
  return (
    <div className="inline-flex items-center gap-2">
      <img 
        src="/logo.png" 
        alt="Wiz Logo" 
        style={{ width: size, height: size }} 
        className="rounded-xl shrink-0 object-contain"
      />
      {withWordmark && (
        <span className="font-bold text-lg text-foreground tracking-tight font-heading">Wiz</span>
      )}
    </div>
  );
}