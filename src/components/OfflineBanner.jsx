import React, { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";
import { Capacitor } from "@capacitor/core";

let Network = null;
async function getNetwork() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!Network) {
    try { Network = (await import("@capacitor/network")).Network; } catch {}
  }
  return Network;
}

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    let cancelled = false;

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    let listener = null;

    async function checkNetwork() {
      const net = await getNetwork();
      if (!net || cancelled) return;
      try {
        const status = await net.getStatus();
        if (status?.connected === false) setIsOffline(true);
      } catch {}
      if (!cancelled) {
        listener = net.addListener("networkStatusChange", (status) => {
          if (cancelled) return;
          setIsOffline(!status?.connected);
        });
      }
    }
    checkNetwork();

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (listener && typeof listener.remove === "function") {
        listener.remove();
      }
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top duration-300">
      <WifiOff className="w-4 h-4" />
      <span>You're offline — some features may be limited</span>
    </div>
  );
}