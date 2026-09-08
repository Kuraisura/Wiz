import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Zap, Crown, Loader2, Smartphone, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { hasIPUseadTrial, recordTrialUsage } from "@/lib/antiAbuse";
import CancelSubscriptionDialog from "@/components/CancelSubscriptionDialog";

const PESO = "\u20B1";

function isNative() {
  return window.Capacitor?.isNativePlatform?.() || false;
}

const PLANS = {
  free: {
    name: "Free",
    price: `${PESO}0`,
    priceUSD: "$0",
    period: "forever",
    icon: Zap,
    color: "text-muted-foreground",
    bg: "bg-secondary",
    features: [
      "Manual quiz creation",
      "Unlimited quizzes",
      "Flashcard study mode",
      "Quiz timer & shuffle",
      "Basic progress tracking",
    ],
    limitations: [
      "No AI quiz generation",
      "No auto-flashcard creation",
    ],
  },
  pro: {
    name: "Pro",
    price: `${PESO}279`,
    priceUSD: "$4.99",
    period: "/month",
    icon: Crown,
    color: "text-amber-600",
    bg: "bg-amber-50",
    features: [
      "Everything in Free",
      "AI quiz generation from documents",
      "Auto-flashcard creation",
      "Smart question analysis",
      "Priority support",
      "Early access to new features",
    ],
    limitations: [],
  },
};

const CHECKOUT_FUNCTION = "paymongo-checkout";
const ACTIVATE_FUNCTION = "activate-subscription";
const CANCEL_FUNCTION = "cancel-subscription";

export default function Subscription() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [currentPlan, setCurrentPlan] = useState("free");
  const [trialEndsAt, setTrialEndsAt] = useState(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState(0);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [trialCancelled, setTrialCancelled] = useState(false);
  const [hasUsedTrial, setHasUsedTrial] = useState(false);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (profile?.subscription_plan) {
      setCurrentPlan(profile.subscription_plan);
    }
    if (profile?.trial_ends_at) {
      setTrialEndsAt(profile.trial_ends_at);
      const end = new Date(profile.trial_ends_at);
      const now = new Date();
      const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      setTrialDaysLeft(Math.max(0, days));
    }
  }, [profile]);

  useEffect(() => {
    if (user?.id) {
      supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.status === "trialing") {
            setTrialCancelled(true);
          }
        });

      // Check if user has ever used a trial
      supabase
        .from("trial_usage")
        .select("id")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setHasUsedTrial(true);
          }
        });
    }
  }, [user]);

  const checkAndActivate = useCallback(async () => {
    if (!user?.id) return false;
    try {
      const { data, error } = await supabase.functions.invoke(ACTIVATE_FUNCTION, {
        body: { userId: user.id },
      });

      if (!error && data?.activated) {
        const plan = data.plan || "pro";
        setCurrentPlan(plan);
        updateProfile({
          subscription_plan: plan,
          trial_ends_at: data.trialEndsAt || null,
        });
        if (data.isTrial) {
          setTrialEndsAt(data.trialEndsAt);
          setHasUsedTrial(true);
          toast({
            title: "Free trial activated!",
            description: `3-day trial started. You won't be charged until ${new Date(data.trialEndsAt).toLocaleDateString()}.`,
          });
        } else {
          toast({ title: "Pro plan activated!", description: "You now have access to all Pro features." });
        }
        return true;
      }
    } catch (err) {
      console.error("Error checking subscription:", err);
    }
    return false;
  }, [user, updateProfile, toast]);

  const pollForActivation = useCallback(async () => {
    const maxAttempts = 10;
    const intervalMs = 3000;
    let attempt = 0;

    const poll = async () => {
      if (!mountedRef.current || attempt >= maxAttempts) {
        setProcessingPayment(false);
        if (attempt >= maxAttempts) {
          toast({
            title: "Payment processing",
            description: "Your payment is being processed. Pro features will activate shortly.",
          });
        }
        return;
      }
      attempt++;
      const activated = await checkAndActivate();
      if (activated || !mountedRef.current) {
        setProcessingPayment(false);
        return;
      }
      pollRef.current = setTimeout(poll, intervalMs);
    };

    poll();
  }, [checkAndActivate, toast]);

  useEffect(() => {
    const hash = window.location.hash || "";
    const qIndex = hash.indexOf("?");
    if (qIndex === -1) return;

    const params = new URLSearchParams(hash.substring(qIndex + 1));
    const status = params.get("status");

    if (status === "success") {
      window.history.replaceState(null, "", window.location.pathname + "#/subscription");
      checkAndActivate();
    } else if (status === "cancelled") {
      window.history.replaceState(null, "", window.location.pathname + "#/subscription");
      toast({ title: "Payment cancelled", description: "You can upgrade anytime." });
    }
  }, [checkAndActivate, toast]);

  const handleStartTrial = async () => {
    setLoading(true);
    try {
      // Anti-abuse: check if IP already used a trial
      const trialCheck = await hasIPUseadTrial();
      if (trialCheck.used) {
        if (trialCheck.isActive) {
          toast({
            title: "Trial already active",
            description: "You already have an active free trial on this device.",
          });
        } else {
          toast({
            title: "Trial already used",
            description: "Free trial has already been used on this device. Please subscribe.",
            variant: "destructive",
          });
        }
        setLoading(false);
        return;
      }

      // Create PayMongo checkout with ₱0 amount
      const { data, error } = await supabase.functions.invoke(CHECKOUT_FUNCTION, {
        body: {
          userId: user.id,
          email: user.email,
          amount: 0,
          currency: "PHP",
          type: "trial",
          siteUrl: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.checkoutUrl) {
        if (isNative()) {
          setProcessingPayment(true);
          try {
            const { Browser } = await import("@capacitor/browser");
            const handler = await Browser.addListener("browserFinished", () => {
              handler.remove();
              recordTrialUsage(user.id, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString());
              pollForActivation();
            });
            await Browser.open({ url: data.checkoutUrl, presentationStyle: "popover" });
          } catch (browserErr) {
            console.error("[Subscription] Browser error:", browserErr);
            setProcessingPayment(false);
            pollForActivation();
          }
        } else {
          window.location.href = data.checkoutUrl;
        }
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Trial unavailable", description: "Please try again later.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(CHECKOUT_FUNCTION, {
        body: {
          userId: user.id,
          email: user.email,
          amount: 27900,
          currency: "PHP",
          type: "subscribe",
          siteUrl: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.checkoutUrl) {
        if (isNative()) {
          setProcessingPayment(true);
          try {
            const { Browser } = await import("@capacitor/browser");
            const handler = await Browser.addListener("browserFinished", () => {
              handler.remove();
              pollForActivation();
            });
            await Browser.open({ url: data.checkoutUrl, presentationStyle: "popover" });
          } catch (browserErr) {
            console.error("[Subscription] Browser error:", browserErr);
            setProcessingPayment(false);
            pollForActivation();
          }
        } else {
          window.location.href = data.checkoutUrl;
        }
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Checkout unavailable", description: "Please check your connection and try again.", variant: "destructive" });
      setProcessingPayment(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setCanceling(true);
    try {
      const isTrialUser = currentPlan === "pro_trial" && trialEndsAt && new Date(trialEndsAt) > new Date();
      const { error } = await supabase.functions.invoke(CANCEL_FUNCTION, {
        body: { userId: user.id, isTrial: isTrialUser },
      });
      if (error) throw error;
      setShowCancelDialog(false);
      if (isTrialUser) {
        setTrialCancelled(true);
        toast({
          title: "Subscription cancelled",
          description: `You'll keep Pro benefits until ${new Date(trialEndsAt).toLocaleDateString()}. No charges will apply.`,
        });
      } else {
        setCurrentPlan("free");
        setTrialEndsAt(null);
        setTrialDaysLeft(0);
        updateProfile({ subscription_plan: "free", trial_ends_at: null });
        toast({ title: "Subscription cancelled", description: "You've been moved to the Free plan." });
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Cancel failed", description: "Please try again later.", variant: "destructive" });
    } finally {
      setCanceling(false);
    }
  };

  const isPro = currentPlan === "pro" || (currentPlan === "pro_trial" && trialDaysLeft > 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-30 bg-background border-b border-border" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="max-w-md mx-auto px-5 h-16 flex items-center justify-between relative">
          <button
            onClick={() => navigate("/")}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-foreground">Subscription</span>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-6 space-y-6" style={{ marginTop: "calc(4rem + var(--safe-top, 0px))" }}>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Choose Your Plan</h1>
          <p className="text-sm text-muted-foreground">Unlock the full power of AI-powered studying</p>
        </div>

        {/* Active Pro Plan Banner */}
        {isPro && (
          <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800/30 p-5 space-y-4 relative overflow-hidden">
            <svg className="absolute top-2 right-2 w-16 h-16 text-amber-300/40 dark:text-amber-600/20" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M50 10 L53 20 L63 20 L55 26 L58 36 L50 30 L42 36 L45 26 L37 20 L47 20 Z" />
              <circle cx="75" cy="45" r="6" />
              <path d="M20 60 Q30 50 40 60 Q50 70 60 60" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="15" cy="80" r="3" fill="currentColor" />
              <circle cx="85" cy="75" r="2" fill="currentColor" />
              <path d="M70 15 L73 12 M76 15 L79 12 M73 10 L73 7" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                <Crown className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-amber-700 dark:text-amber-300">
                  {currentPlan === "pro_trial" ? "Pro Trial Active" : "Pro Plan Active"}
                </h2>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  {trialCancelled
                    ? `Trial cancelled - active until ${new Date(trialEndsAt).toLocaleDateString()}`
                    : currentPlan === "pro_trial" && trialEndsAt && trialDaysLeft > 0
                      ? `Free trial ends in ${trialDaysLeft} day${trialDaysLeft > 1 ? "s" : ""}`
                      : "Full access to all Pro features"}
                </p>
              </div>
            </div>
            {trialEndsAt && trialDaysLeft > 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/20 rounded-xl px-3 py-2">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {trialCancelled
                    ? `Trial ends ${new Date(trialEndsAt).toLocaleDateString()} - no charges will apply`
                    : currentPlan === "pro_trial"
                      ? `Trial ends ${new Date(trialEndsAt).toLocaleDateString()} - subscribe to keep Pro after`
                      : `Renews ${new Date(trialEndsAt).toLocaleDateString()}`}
                </span>
              </div>
            )}
            {currentPlan === "pro_trial" && !trialCancelled && (
              <Button
                onClick={handleSubscribe}
                disabled={loading}
                className="w-full h-10 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Smartphone className="w-4 h-4 mr-2" />}
                Subscribe Now - {PESO}279/mo
              </Button>
            )}
            {!trialCancelled && (
              <Button
                onClick={() => setShowCancelDialog(true)}
                disabled={canceling}
                variant="outline"
                className="w-full h-10 rounded-xl text-sm font-semibold border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                {canceling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
                Cancel Subscription
              </Button>
            )}
            {trialCancelled && (
              <div className="text-center text-xs text-amber-600 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/20 rounded-xl px-3 py-2">
                Your trial has been cancelled. Pro features remain active until {new Date(trialEndsAt).toLocaleDateString()}.
              </div>
            )}
          </div>
        )}

        {/* Plan Cards */}
        <div className="space-y-4">
          {Object.entries(PLANS).map(([key, plan]) => {
            const isActive = currentPlan === key || (key === "pro" && currentPlan === "pro_trial");
            const Icon = plan.icon;
            return (
              <div
                key={key}
                className={`rounded-2xl border-2 p-5 transition-all ${
                  isActive
                    ? "border-primary bg-primary/5 shadow-md"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${plan.bg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${plan.color}`} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{plan.name}</h3>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold">{plan.price}</span>
                        <span className="text-xs text-muted-foreground">({plan.priceUSD})</span>
                        <span className="text-sm text-muted-foreground">{plan.period}</span>
                      </div>
                    </div>
                  </div>
                  {isActive && (
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      key === "pro" ? "text-amber-700 bg-amber-100" : "text-primary bg-primary/10"
                    }`}>
                      {currentPlan === "pro_trial" && key === "pro" ? "Trial Active" : "Current Plan"}
                    </span>
                  )}
                </div>

                <ul className="space-y-2.5 mb-5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                  {plan.limitations.map((f, i) => (
                    <li key={`lim-${i}`} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <span className="w-4 h-4 shrink-0 mt-0.5 text-center">-</span>
                      <span className="line-through">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* Free user: show trial + subscribe buttons */}
                {key === "pro" && currentPlan === "free" && (
                  <div className="space-y-2">
                    {!hasUsedTrial && (
                      <>
                        <Button
                          onClick={handleStartTrial}
                          disabled={loading}
                          className="w-full h-12 rounded-xl font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-base"
                        >
                          {loading ? (
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          ) : (
                            <Clock className="w-5 h-5 mr-2" />
                          )}
                          Start 3-Day Free Trial
                        </Button>
                        <p className="text-center text-xs text-muted-foreground">
                          No charge for 3 days. Cancel anytime.
                        </p>
                        <div className="relative flex items-center gap-3 py-2">
                          <div className="flex-1 h-px bg-border" />
                          <span className="text-xs text-muted-foreground">or</span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      </>
                    )}
                    <Button
                      onClick={handleSubscribe}
                      disabled={loading}
                      className="w-full h-12 rounded-xl font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-base"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      ) : (
                        <Smartphone className="w-5 h-5 mr-2" />
                      )}
                      {hasUsedTrial ? "Subscribe Now - ₱279/mo" : "Subscribe Now - ₱279/mo"}
                    </Button>
                  </div>
                )}
                {key === "pro" && currentPlan === "pro_trial" && !isPro && (
                  <div className="text-center text-sm text-muted-foreground py-2">
                    Upgrade to keep Pro after your trial
                  </div>
                )}
                {key === "pro" && currentPlan === "pro" && (
                  <div className="text-center text-sm text-muted-foreground py-2">
                    You are on the Pro plan
                  </div>
                )}
                {key === "free" && isActive && (
                  <div className="text-center text-sm text-muted-foreground py-2">
                    You are currently on the Free plan
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="text-center text-xs text-muted-foreground space-y-1 pb-8">
          <p>Cancel anytime. No questions asked.</p>
          <p>Prices in Philippine Peso (PHP).</p>
        </div>
      </main>

      <CancelSubscriptionDialog
        open={showCancelDialog}
        onConfirm={handleCancel}
        onCancel={() => setShowCancelDialog(false)}
        loading={canceling}
        isTrial={currentPlan === "pro_trial"}
      />

      {processingPayment && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-card rounded-3xl shadow-2xl p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
            <h2 className="text-xl font-bold">Processing Payment</h2>
            <p className="text-sm text-muted-foreground">
              Please wait while we confirm your payment. This may take a few moments.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
