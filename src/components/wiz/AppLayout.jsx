import React, { useState, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AppHeader from "@/components/wiz/AppHeader";
import BottomNav from "@/components/wiz/BottomNav";
import { Capacitor } from "@capacitor/core";

const titles = {
  "/": "",
  "/quizzes": "Quizzes",
  "/flashcards": "Flashcards",
  "/library": "Library",
};

const TAB_ROUTES = ["/", "/quizzes", "/flashcards", "/library"];

export default function AppLayout() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState("in");
  const prevPathname = useRef(location.pathname);

  // Disable status bar overlay on Android so content doesn't draw under it
  useEffect(() => {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      import("@capacitor/status-bar").then(({ StatusBar }) => {
        StatusBar.setOverlaysWebView({ overlay: false });
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (location.pathname !== prevPathname.current) {
      // Only animate when switching between tab routes
      const wasTab = TAB_ROUTES.includes(prevPathname.current);
      const isTab = TAB_ROUTES.includes(location.pathname);

      if (wasTab && isTab) {
        setTransitionStage("out");
      } else {
        // Non-tab navigation: just swap immediately
        setDisplayLocation(location);
      }
      prevPathname.current = location.pathname;
    }
  }, [location]);

  const handleAnimationEnd = () => {
    if (transitionStage === "out") {
      setDisplayLocation(location);
      setTransitionStage("in");
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <AppHeader title={titles[location.pathname] || ""} />
      <main className="max-w-md mx-auto px-5 pt-4 pb-24 min-h-[calc(100vh-4rem)]" style={{ marginTop: "calc(4rem + var(--safe-top, 0px))" }}>
        <div
          key={displayLocation.pathname}
          className={transitionStage === "out" ? "animate-tab-out" : "animate-tab-in"}
          onAnimationEnd={handleAnimationEnd}
        >
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
