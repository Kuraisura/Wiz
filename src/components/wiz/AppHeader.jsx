import React, { useState } from "react";
import { Link } from "react-router-dom";
import WizLogo from "@/components/wiz/WizLogo";
import { useAuth } from "@/lib/AuthContext";

export default function AppHeader({ title }) {
  const { user, profile } = useAuth();

  const initials = (profile?.full_name || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="fixed top-0 left-0 right-0 z-30 bg-background border-b border-border" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="max-w-md mx-auto px-5 h-16 flex items-center justify-between">
        <WizLogo size={36} withWordmark />
        {title && <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-foreground">{title}</span>}
        <Link
          to="/profile"
          className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold transition-transform duration-200 hover:scale-105 active:scale-95"
        >
          {initials}
        </Link>
      </div>
    </header>
  );
}
