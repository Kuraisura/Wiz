import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle, ShieldAlert } from "lucide-react";
import WizLogo from "@/components/wiz/WizLogo";
import GoogleIcon from "@/components/GoogleIcon";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { checkRateLimit, recordFailedAttempt, clearRateLimit, getRetryAfterSeconds } from "@/lib/rateLimiter";
import { recordDevice } from "@/lib/antiAbuse";
import { signInWithOAuthNative } from "@/lib/capacitorOAuth";

// Detect Capacitor native
function isNative() {
  return window.Capacitor?.isNativePlatform?.() || false;
}

function sanitizeInput(text) {
  if (!text) return "";
  return text
    .replace(/['";\\]/g, "")
    .replace(/--/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE|DECLARE|CAST|CONVERT|TRUNCATE|GRANT|REVOKE)\b/gi, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function Login() {
  const navigate = useNavigate();
  const { checkUserAuth, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null);
  const [retryAfter, setRetryAfter] = useState(0);
  const timerRef = useRef(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Handle OAuth error from URL
  useEffect(() => {
    const hash = window.location.hash || "";
    if (hash.includes("error=") || hash.includes("access_denied")) {
      const params = new URLSearchParams(hash.substring(2));
      const errorParam = params.get("error");
      if (errorParam === "access_denied") {
        setError("Sign in was cancelled. Please try again.");
      } else {
        setError("Failed to connect your account. Please try again.");
      }
      window.history.replaceState(null, "", "#/login");
      setOauthLoading(null);
    }
  }, []);

  // Check rate limit on mount and start countdown if locked
  useEffect(() => {
    const seconds = getRetryAfterSeconds("login");
    if (seconds > 0) {
      setRetryAfter(seconds);
      timerRef.current = setInterval(() => {
        const remaining = getRetryAfterSeconds("login");
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          setRetryAfter(0);
        } else {
          setRetryAfter(remaining);
        }
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Check rate limit
    const rateCheck = checkRateLimit("login");
    if (!rateCheck.allowed) {
      setError(`Too many failed attempts. Please wait ${formatTime(rateCheck.retryAfterMs / 1000)} before trying again.`);
      setRetryAfter(rateCheck.retryAfterMs / 1000);
      return;
    }

    const cleanEmail = sanitizeInput(email);
    const cleanPassword = sanitizeInput(password);

    if (!cleanEmail || !cleanPassword) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (authError) throw authError;

      // Success — clear rate limit and record device
      clearRateLimit("login");
      await checkUserAuth();
      // Record device after auth state is updated
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) await recordDevice(authUser.id);
      toast({ title: "Welcome back!", description: "You've successfully signed in." });
      navigate("/");
    } catch (err) {
      // Record failed attempt
      recordFailedAttempt("login");

      // Check remaining attempts
      const remaining = checkRateLimit("login");
      const attemptsUsed = 5 - remaining.attemptsLeft;

      if (err.message?.includes("Invalid login")) {
        setError(`Incorrect email or password. ${remaining.attemptsLeft > 0 ? `${remaining.attemptsLeft} attempt${remaining.attemptsLeft !== 1 ? "s" : ""} remaining.` : "Please try again later."}`);
      } else if (err.message?.includes("Email not confirmed")) {
        setError("Please verify your email first. Check your inbox.");
      } else if (err.message?.includes("Too many")) {
        setError("Too many requests from Supabase. Please wait a moment and try again.");
      } else if (!remaining.allowed) {
        setRetryAfter(remaining.retryAfterMs / 1000);
        setError(`Account locked due to too many failed attempts. Please wait ${formatTime(remaining.retryAfterMs / 1000)}.`);
        // Start countdown
        timerRef.current = setInterval(() => {
          const r = getRetryAfterSeconds("login");
          if (r <= 0) {
            clearInterval(timerRef.current);
            setRetryAfter(0);
            setError("");
          } else {
            setRetryAfter(r);
          }
        }, 1000);
      } else {
        setError("Failed to sign in. Please try again.");
      }
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    setError("");
    setOauthLoading(provider);
    try {
      if (isNative()) {
        // Native: open system browser for OAuth, handle deep link callback
        await signInWithOAuthNative(provider);
        // If we get here, auth succeeded — onAuthStateChange will update state
        clearRateLimit("login");
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) await recordDevice(authUser.id);
        toast({ title: "Welcome back!", description: "You've successfully signed in." });
        navigate("/");
      } else {
        // Web: standard Supabase OAuth redirect
        const redirectUrl = window.location.origin + "/";
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: redirectUrl,
            queryParams: provider === "google" ? { access_type: "offline", prompt: "consent" } : {},
          },
        });
        if (error) throw error;
      }
    } catch (err) {
      console.error("[Login] OAuth error:", err);
      setOauthLoading(null);
      if (err.message === "OAuth timed out") {
        // Don't show error for timeout — user already sees nothing
      } else if (err.message !== "OAuth cancelled") {
        // Only show generic error for real failures, not cancellations
        setError("Failed to connect your account. Please try again.");
      }
    }
  };

  const isLocked = retryAfter > 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-7">
          <WizLogo size={64} />
          <h1 className="text-2xl font-bold text-foreground mt-4 tracking-tight">Wiz</h1>
          <p className="text-sm text-muted-foreground mt-2">Sign in to access your modules and quizzes</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-sm font-medium text-foreground">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="student@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-11 h-12 rounded-xl bg-secondary border-transparent focus-visible:bg-card"
                disabled={isLocked}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-sm font-medium text-foreground">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-11 pr-11 h-12 rounded-xl bg-secondary border-transparent focus-visible:bg-card"
                disabled={isLocked}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-xs font-medium text-muted-foreground hover:text-primary">
              Forgot Password?
            </Link>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 animate-in fade-in slide-in-from-top-1 duration-300">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400 font-medium leading-snug">{error}</p>
            </div>
          )}

          {isLocked && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 animate-in fade-in slide-in-from-top-1 duration-300">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">Account temporarily locked</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  Try again in {formatTime(retryAfter)}
                </p>
              </div>
            </div>
          )}

          <Button type="submit" className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/25" disabled={loading || oauthLoading || isLocked}>
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Signing in...
              </>
            ) : (
              <>Sign In <ArrowRight className="w-5 h-5 ml-2" /></>
            )}
          </Button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase tracking-wide">
            <span className="bg-background px-3 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-12 rounded-xl text-sm font-medium bg-card"
            onClick={() => handleOAuth("google")}
            disabled={loading || oauthLoading || isLocked}
          >
            {oauthLoading === "google" ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <GoogleIcon className="w-5 h-5 mr-2" />
            )}
            Google
          </Button>
          <Button
            variant="outline"
            className="h-12 rounded-xl text-sm font-medium bg-card"
            onClick={() => handleOAuth("github")}
            disabled={loading || oauthLoading || isLocked}
          >
            {oauthLoading === "github" ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" className="w-5 h-5 mr-2" alt="GitHub" />
            )}
            GitHub
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Don't have an account?{" "}
          <Link to="/register" className="text-primary font-semibold hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
