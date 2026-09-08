import React, { useRef, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { PlusCircle, ClipboardList, Layers, FolderOpen, Lock } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const items = [
  { to: "/", label: "Create", icon: PlusCircle, end: true },
  { to: "/quizzes", label: "Quizzes", icon: ClipboardList },
  { to: "/flashcards", label: "Flashcards", icon: Layers },
  { to: "/library", label: "Library", icon: FolderOpen, proOnly: true },
];

export default function BottomNav() {
  const location = useLocation();
  const { profile } = useAuth();
  const isPro = profile?.subscription_plan === "pro" || profile?.subscription_plan === "pro_trial";
  const navRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    if (!navRef.current) return;
    const activeIndex = items.findIndex(item =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
    );
    if (activeIndex === -1) return;

    const buttons = navRef.current.querySelectorAll('[data-nav-btn]');
    if (buttons[activeIndex]) {
      const btn = buttons[activeIndex];
      const navRect = navRef.current.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setIndicatorStyle({
        left: btnRect.left - navRect.left + btnRect.width / 2 - 16,
        width: 32,
      });
    }
  }, [location.pathname]);

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 px-4 pb-[calc(var(--safe-bottom,0px)+8px)]" style={{ pointerEvents: "none" }}>
      <nav
        ref={navRef}
        className="relative max-w-md mx-auto h-16 flex items-center justify-around rounded-2xl bg-card border border-border shadow-lg shadow-black/10"
        style={{ pointerEvents: "auto", touchAction: "none" }}
      >
        <div
          className="absolute top-0 h-[3px] w-8 bg-primary rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ left: indicatorStyle.left, width: indicatorStyle.width, transform: 'translateY(-50%)' }}
        />
        {items.map(({ to, label, icon: Icon, end, proOnly }) => {
          const isActive = end
            ? location.pathname === to
            : location.pathname.startsWith(to);
          const isLocked = proOnly && !isPro;
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-nav-btn
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors duration-200 ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <Icon
                  className="w-5 h-5 transition-all duration-300"
                  strokeWidth={isActive ? 2.5 : 2}
                  style={{ transform: isActive ? 'scale(1.1)' : 'scale(1)' }}
                />
                {isLocked && (
                  <Lock className="w-2.5 h-2.5 absolute -top-1 -right-1.5 text-amber-500" />
                )}
              </div>
              <span className={`text-[11px] transition-all duration-200 ${isActive ? "font-semibold" : "font-medium"}`}>
                {label}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
