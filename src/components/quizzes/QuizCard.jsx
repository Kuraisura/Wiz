import React, { useState } from "react";
import { FileText, ChevronDown, Trash2, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/supabaseClient";
import { useNavigate } from "react-router-dom";

import { useToast } from "@/components/ui/use-toast";
import { format, isToday, isYesterday } from "date-fns";

const scoreLabel = (s) => (s >= 90 ? "HIGH" : s >= 85 ? "SOLID" : s >= 70 ? "PASS" : "NEEDS REV");
const ringTone = (s) => (s >= 85 ? "text-primary" : s >= 70 ? "text-cyan-600" : "text-amber-600");

function whenLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const time = format(d, "h:mm a");
  if (isToday(d)) return `Generated today \u2022 ${time}`;
  if (isYesterday(d)) return `Yesterday \u2022 ${time}`;
  return format(d, "MMM d, yyyy");
}

function ScoreRing({ score }) {
  const r = 21;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg viewBox="0 0 50 50" className="w-14 h-14 -rotate-90">
        <circle cx="25" cy="25" r={r} fill="none" stroke="currentColor" strokeWidth="4.5" className="text-secondary" />
        <circle
          cx="25" cy="25" r={r} fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
          className={`${ringTone(score)} transition-[stroke-dashoffset] duration-700 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs font-bold text-foreground">{score}%</span>
        <span className="text-[7px] font-semibold tracking-wide text-muted-foreground">{scoreLabel(score)}</span>
      </div>
    </div>
  );
}

export default function QuizCard({ quiz, index, onUpdated, onDelete }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [review, setReview] = useState(false);

  const hasCompleted = quiz.completion_status === "Completed" && typeof quiz.score === "number";

  const handleStartQuiz = () => {
    navigate(`/quiz/${quiz.id}`);
  };

  const handleRetake = async () => {
    try {
      const { error } = await supabase
        .from('quizzes')
        .update({ completion_status: "Not Taken", score: null })
        .eq('id', quiz.id);

      if (error) throw error;

      toast({ title: "Quiz reset", description: `"${quiz.title}" is ready to retake.` });
      onUpdated?.();
      navigate(`/quiz/${quiz.id}`);
    } catch (err) {
      toast({ title: "Could not reset quiz", description: "Please try again later.", variant: "destructive" });
    }
  };

  return (
    <div
      className="rounded-2xl bg-card border border-border p-4 shadow-sm cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md animate-fade-in"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: 'both' }}
      onClick={() => setReview((r) => !r)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground">{whenLabel(quiz.generated_date)}</span>
          </div>
          <h3 className="font-bold text-sm text-foreground mt-2 leading-snug">{quiz.title}</h3>
          <div className="flex items-center gap-1.5 mt-1.5">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {quiz.question_count} Questions · {quiz.format}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {typeof quiz.score === "number" ? (
            <ScoreRing score={quiz.score} />
          ) : (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 shrink-0">
              Not Taken
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-90"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-2 mt-3.5" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          className="flex-1 h-9 rounded-xl text-xs font-semibold"
          onClick={() => setReview((r) => !r)}
        >
          Review Answers
          <ChevronDown className={`w-3.5 h-3.5 ml-1.5 transition-transform duration-200 ${review ? "rotate-180" : ""}`} />
        </Button>
        <Button
          size="sm"
          variant={hasCompleted ? "outline" : "default"}
          className="flex-1 h-9 rounded-xl text-xs font-semibold"
          onClick={hasCompleted ? handleRetake : handleStartQuiz}
        >
          {hasCompleted ? (
            <>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Retake
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Take Quiz
            </>
          )}
        </Button>
      </div>

      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${review ? 'max-h-40 opacity-100 mt-3 pt-3 border-t border-border' : 'max-h-0 opacity-0'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><p className="text-muted-foreground">Score</p><p className="font-semibold text-foreground">{quiz.score ?? "\u2014"}%</p></div>
          <div><p className="text-muted-foreground">Questions</p><p className="font-semibold text-foreground">{quiz.question_count}</p></div>
          <div><p className="text-muted-foreground">Difficulty</p><p className="font-semibold text-foreground">{quiz.difficulty}</p></div>
          <div><p className="text-muted-foreground">Status</p><p className="font-semibold text-foreground">{quiz.completion_status}</p></div>
        </div>
      </div>
    </div>
  );
}
