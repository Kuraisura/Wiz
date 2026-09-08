import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// ---------------------------------------------------------------------------
// OAuth URL cleanup — must run BEFORE React mounts (prevents 404 flash)
// ---------------------------------------------------------------------------
(function cleanOAuthErrors() {
  const hash = window.location.hash || "";
  if (hash.includes("error=") || hash.includes("access_denied")) {
    window.history.replaceState(null, "", "#/login");
  } else if (hash.includes("access_token") || hash.includes("code=")) {
    window.history.replaceState(null, "", "/");
  }
})();

// ---------------------------------------------------------------------------
// Handle back-forward cache (bfcache) — clean stale URLs when page is restored
// ---------------------------------------------------------------------------
window.addEventListener("pageshow", function (e) {
  if (e.persisted) {
    const hash = window.location.hash || "";
    if (hash.includes("error=") || hash.includes("access_denied")) {
      window.history.replaceState(null, "", "#/login");
      window.location.reload();
    }
  }
});

// ---------------------------------------------------------------------------
// Capacitor: Listen for deep links (OAuth callback)
// ---------------------------------------------------------------------------
(async () => {
  try {
    const { App } = await import("@capacitor/app");
    const { supabase } = await import("@/supabaseClient");

    await App.addListener("appUrlOpen", async ({ url }) => {
      console.log("[App] Deep link received:", url);

      // Handle OAuth callback
      if (url.includes("login-callback") || url.includes("access_token")) {
        let hash = "";

        // Extract tokens from URL fragment or query params
        if (url.includes("#")) {
          hash = url.split("#")[1];
        } else if (url.includes("?")) {
          hash = url.split("?")[1];
        } else {
          const idx = url.indexOf("login-callback");
          if (idx !== -1) {
            hash = url.substring(idx + "login-callback".length).replace(/^#|\?/, "");
          }
        }

        if (!hash) return;

        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const code = params.get("code");

        try {
          if (accessToken && refreshToken) {
            console.log("[App] Setting session from deep link tokens");
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          } else if (code) {
            console.log("[App] Exchanging PKCE code from deep link");
            await supabase.auth.exchangeCodeForSession(code);
          }

          // Clean URL after successful auth
          window.history.replaceState(null, "", "/");
        } catch (err) {
          console.error("[App] Deep link auth error:", err);
        }
      }
    });
  } catch (err) {
    // Not in Capacitor — ignore
  }
})();

// ---------------------------------------------------------------------------
// Suppress framer-motion internal layout animation errors (startTime crash)
// ---------------------------------------------------------------------------
const suppressStartTime = (msg) => {
  if (typeof msg === 'string' && msg.includes('startTime')) return true;
  if (msg && typeof msg === 'object' && msg.message && msg.message.includes('startTime')) return true;
  return false;
};

const origConsoleError = console.error;
console.error = function (...args) {
  if (args.some(a => suppressStartTime(a))) return;
  origConsoleError.apply(console, args);
};

const origConsoleWarn = console.warn;
console.warn = function (...args) {
  if (args.some(a => suppressStartTime(a))) return;
  origConsoleWarn.apply(console, args);
};

window.onerror = function (msg) {
  if (suppressStartTime(msg)) return true;
};

window.addEventListener('error', function (e) {
  if (e.message && e.message.includes('startTime')) {
    e.preventDefault();
    return false;
  }
}, true);

window.addEventListener('unhandledrejection', function (e) {
  const reason = e.reason;
  const msg = reason?.message || String(reason) || '';
  // Suppress Capacitor plugin .then() errors (safe to ignore)
  if (msg.includes('.then()') && msg.includes('is not implemented')) {
    e.preventDefault();
    return false;
  }
  if (msg.includes('startTime')) {
    e.preventDefault();
    return false;
  }
});

// ---------------------------------------------------------------------------
// Mount React app
// ---------------------------------------------------------------------------
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
