// ---------------------------------------------------------------------------
// capacitorOAuth.js — OAuth flow for Capacitor (opens system browser)
// ---------------------------------------------------------------------------

import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { supabase } from "@/supabaseClient";

const REDIRECT_URL = "com.wiz.study://login-callback";

let appUrlOpenListener = null;

/**
 * Start OAuth on native (Capacitor).
 * Opens the system browser for Google/GitHub auth.
 * Returns a promise that resolves when auth succeeds, or rejects on error/cancel.
 */
export function signInWithOAuthNative(provider) {
  return new Promise(async (resolve, reject) => {
    // Clean up any previous listener
    if (appUrlOpenListener) {
      appUrlOpenListener.remove();
      appUrlOpenListener = null;
    }

    let resolved = false;

    function cleanup() {
      if (appUrlOpenListener) {
        appUrlOpenListener.remove();
        appUrlOpenListener = null;
      }
      if (restoreListener) {
        restoreListener.remove();
        restoreListener = null;
      }
      if (browserCloseListener) {
        browserCloseListener.remove();
        browserCloseListener = null;
      }
      clearTimeout(timeoutId);
    }

    // Listen for when app resumes without deep link (user closed browser / cancelled)
    let restoreListener = await App.addListener("appRestoredResult", () => {
      if (!resolved) {
        console.log("[Auth] App restored without OAuth callback — user likely cancelled");
        cleanup();
        resolved = true;
        reject(new Error("OAuth cancelled"));
      }
    });

    // Listen for browser close events
    let browserCloseListener = await Browser.addListener("browserFinished", () => {
      if (!resolved) {
        console.log("[Auth] Browser closed without callback — user likely cancelled");
        cleanup();
        resolved = true;
        reject(new Error("OAuth cancelled"));
      }
    });

    // Listen for deep link callback
    appUrlOpenListener = await App.addListener("appUrlOpen", async ({ url }) => {
      console.log("[Auth] Deep link received:", url);

      // Check if this is our OAuth callback
      if (!url.includes("login-callback") && !url.includes("access_token")) {
        return;
      }

      try {
        // Extract tokens from URL fragment or query params
        let hash = url.split("#")[1] || url.split("?")[1] || "";
        if (!hash) {
          // Try after "login-callback"
          const idx = url.indexOf("login-callback");
          if (idx !== -1) {
            const after = url.substring(idx + "login-callback".length);
            hash = after.replace(/^#|\?/, "");
          }
        }

        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const code = params.get("code");

        if (accessToken && refreshToken) {
          // Got tokens directly — set session
          console.log("[Auth] Setting session from tokens");
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (appUrlOpenListener) {
            appUrlOpenListener.remove();
            appUrlOpenListener = null;
          }

          cleanup();
          resolved = true;
          if (error) {
            console.error("[Auth] setSession error:", error);
            reject(error);
          } else {
            resolve({ success: true });
          }
        } else if (code) {
          // Got PKCE code — exchange for session
          console.log("[Auth] Exchanging code for session");
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          cleanup();
          resolved = true;
          if (error) {
            console.error("[Auth] exchangeCodeForSession error:", error);
            reject(error);
          } else {
            resolve({ success: true });
          }
        } else {
          console.warn("[Auth] No tokens or code found in deep link:", hash);
        }
      } catch (err) {
        console.error("[Auth] Deep link handling error:", err);
        cleanup();
        resolved = true;
        reject(err);
      }
    });

    // Build OAuth URL
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const redirectTo = encodeURIComponent(REDIRECT_URL);
    const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=${provider}&redirect_to=${redirectTo}`;

    console.log("[Auth] Opening OAuth in system browser:", authUrl);

    try {
      await Browser.open({ url: authUrl, presentationStyle: "popover" });
    } catch (err) {
      console.error("[Auth] Failed to open browser:", err);
      cleanup();
      resolved = true;
      reject(err);
    }

    // Timeout after 120s
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        cleanup();
        resolved = true;
        reject(new Error("OAuth timed out"));
      }
    }, 120000);
  });
}

/**
 * Clean up listeners.
 */
export function cleanupOAuthListener() {
  if (appUrlOpenListener) {
    appUrlOpenListener.remove();
    appUrlOpenListener = null;
  }
}
