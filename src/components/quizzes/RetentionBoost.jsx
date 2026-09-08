import React from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RetentionBoost() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-accent to-card border border-primary/15 p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Zap className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Daily Retention Boost</p>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
          Spaced repetition recommends revising Linear Algebra today.
        </p>
      </div>
      <Button asChild size="sm" className="rounded-full shrink-0 text-xs">
        <Link to="/flashcards">Quick Test</Link>
      </Button>
    </div>
  );
}