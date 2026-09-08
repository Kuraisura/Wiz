import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2, AlertCircle, ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { checkRateLimit, recordFailedAttempt, clearRateLimit, getRetryAfterSeconds } from "@/lib/rateLimiter";
import { canRegisterNewAccount, recordRegistration } from "@/lib/antiAbuse";
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

export default function Register() {
  const navigate = useNavigate();
  const { checkUserAuth, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(null);
  const [retryAfter, setRetryAfter] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

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
      window.history.replaceState(null, "", "#/register");
      setOauthLoading(null);
    }
  }, []);

  useEffect(() => {
    const seconds = getRetryAfterSeconds("register");
    if (seconds > 0) {
      setRetryAfter(seconds);
      timerRef.current = setInterval(() => {
        const remaining = getRetryAfterSeconds("register");
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

    const rateCheck = checkRateLimit("register");
    if (!rateCheck.allowed) {
      setError(`Too many attempts. Please wait ${formatTime(rateCheck.retryAfterMs / 1000)} before trying again.`);
      setRetryAfter(rateCheck.retryAfterMs / 1000);
      return;
    }

    const cleanEmail = sanitizeInput(email);
    const cleanPassword = sanitizeInput(password);
    const cleanConfirm = sanitizeInput(confirmPassword);

    if (!cleanEmail || !cleanPassword || !cleanConfirm) {
      setError("Please fill in all fields.");
      return;
    }

    if (cleanPassword !== cleanConfirm) {
      setError("Passwords do not match.");
      return;
    }

    if (cleanPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      // Anti-abuse: check if device can register
      const deviceCheck = await canRegisterNewAccount(cleanEmail);
      if (!deviceCheck.allowed) {
        setError(deviceCheck.reason);
        setLoading(false);
        return;
      }

      const { error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (authError) throw authError;

      // Record registration for anti-abuse tracking
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await recordRegistration(user.id, cleanEmail);
      }

      clearRateLimit("register");
      await checkUserAuth();
      toast({ title: "Account created!", description: "Please check your email for verification." });
      navigate("/");
    } catch (err) {
      recordFailedAttempt("register");
      const remaining = checkRateLimit("register");

      if (err.message?.includes("already registered")) {
        setError("An account with this email already exists. Try signing in.");
      } else if (err.message?.includes("valid email")) {
        setError("Please enter a valid email address.");
      } else if (!remaining.allowed) {
        setRetryAfter(remaining.retryAfterMs / 1000);
        setError(`Too many attempts. Account locked for ${formatTime(remaining.retryAfterMs / 1000)}.`);
        timerRef.current = setInterval(() => {
          const r = getRetryAfterSeconds("register");
          if (r <= 0) {
            clearInterval(timerRef.current);
            setRetryAfter(0);
            setError("");
          } else {
            setRetryAfter(r);
          }
        }, 1000);
      } else {
        setError("Failed to create account. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    setError("");
    setOauthLoading(provider);
    try {
      // Anti-abuse: check if device can register before OAuth redirect
      const deviceCheck = await canRegisterNewAccount("");
      if (!deviceCheck.allowed) {
        setError(deviceCheck.reason);
        setOauthLoading(null);
        return;
      }

      if (isNative()) {
        // Native: open system browser for OAuth, handle deep link callback
        await signInWithOAuthNative(provider);
        // If we get here, auth succeeded — record registration
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          await recordRegistration(authUser.email || "", authUser.id);
        }
      } else {
        // Web: standard Supabase OAuth redirect
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: window.location.origin + "/",
          },
        });
        if (error) throw error;
      }
    } catch (err) {
      console.error("[Register] OAuth error:", err);
      setOauthLoading(null);
      if (err.message !== "OAuth timed out") {
        setError("Failed to connect your account. Please try again.");
      }
    }
  };

  const isLocked = retryAfter > 0;

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Button
          variant="outline"
          className="h-12 text-sm font-medium"
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
          className="h-12 text-sm font-medium"
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

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 mb-4 animate-in fade-in slide-in-from-top-1 duration-300">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400 font-medium leading-snug">{error}</p>
        </div>
      )}

      {isLocked && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 mb-4 animate-in fade-in slide-in-from-top-1 duration-300">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">Account temporarily locked</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Try again in {formatTime(retryAfter)}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              disabled={isLocked}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              disabled={isLocked}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              disabled={isLocked}
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading || oauthLoading || isLocked}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
