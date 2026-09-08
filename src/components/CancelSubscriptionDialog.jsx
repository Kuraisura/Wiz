import React, { useState } from "react";
import { X, AlertTriangle, Trash2, Crown, ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CancelSubscriptionDialog({ open, onConfirm, onCancel, loading, isTrial }) {
  const [step, setStep] = useState(1);

  if (!open) return null;

  const handleConfirm = () => {
    if (step === 1) {
      setStep(2);
    } else {
      onConfirm();
    }
  };

  const handleClose = () => {
    setStep(1);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-5">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-sm bg-card rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {step === 1 ? (
          /* Step 1: Warning */
          <div className="p-6 pt-8 space-y-5">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {isTrial ? "Cancel Free Trial?" : "Cancel Subscription?"}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isTrial
                  ? "You'll keep Pro benefits until your trial ends. No charges will apply."
                  : "You'll lose access to all Pro features at the end of your current billing period."}
              </p>
            </div>

            {/* What you'll lose */}
            <div className="rounded-2xl bg-secondary/50 p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {isTrial ? "What happens next" : "You'll lose access to"}
              </p>
              {isTrial ? (
                <>
                  <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4 text-emerald-500 shrink-0" />
                    Pro features remain active until trial ends
                  </div>
                  <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    No charges will be made
                  </div>
                  <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    Account moves to Free plan after trial
                  </div>
                </>
              ) : (
                [
                  "AI quiz generation from documents",
                  "Auto-flashcard creation",
                  "Smart question analysis",
                  "Priority support",
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    {feature}
                  </div>
                ))
              )}
            </div>

            <Button
              onClick={handleConfirm}
              className="w-full h-12 rounded-xl font-semibold"
              variant="outline"
            >
              Continue to Cancel
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        ) : (
          /* Step 2: Final confirmation */
          <div className="p-6 pt-8 space-y-5">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                <Crown className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Are you absolutely sure?</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isTrial
                  ? "Your trial will end immediately and you'll be moved to the Free plan."
                  : "This action cannot be undone. You can always resubscribe later."}
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleClose}
                className="flex-1 h-12 rounded-xl font-semibold"
              >
                {isTrial ? "Keep Trial" : "Keep Pro"}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 h-12 rounded-xl font-semibold bg-red-500 hover:bg-red-600 text-white"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Yes, Cancel
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
