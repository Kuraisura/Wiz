import React, { useEffect, useState } from "react";
import { ChevronDown, Shuffle, Lightbulb, Star, Loader2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

import { useToast } from "@/components/ui/use-toast";
import StudyCard from "@/components/flashcards/StudyCard";

export default function Flashcards() {
  const { user, updateStreak } = useAuth();
  const { toast } = useToast();
  const [quizzes, setQuizzes] = useState(null);
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [view, setView] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hint, setHint] = useState("");
  const [loadingCards, setLoadingCards] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);

  useEffect(() => {
    async function loadQuizzes() {
      try {
        const { data, error } = await supabase
          .from('quizzes')
          .select('id, title, course_code, format, question_count, completion_status')
          .eq('user_id', user?.id)
          .order('generated_date', { ascending: false });
        if (error) throw error;
        setQuizzes(data || []);
      } catch (err) {
        console.error(err);
        setQuizzes([]);
      }
    }
    loadQuizzes();
  }, [user]);

  useEffect(() => {
    if (!selectedQuizId) {
      setView([]);
      setIndex(0);
      setFlipped(false);
      setHint("");
      return;
    }

    async function loadFlashcards() {
      setLoadingCards(true);
      try {
        const { data: allCards, error } = await supabase
          .from('flashcards')
          .select('*')
          .eq('user_id', user?.id);
        if (error) throw error;

        const quiz = quizzes?.find(q => q.id === selectedQuizId);
        const filtered = (allCards || []).filter(c => {
          if (!quiz) return false;
          const cat = (c.category || '').toLowerCase();
          const title = (quiz.title || '').toLowerCase();
          const code = (quiz.course_code || '').toLowerCase();
          return cat.includes(title) || cat.includes(code) ||
                 title.includes(cat) || code.includes(cat);
        });

        setView(filtered);
        setIndex(0);
        setFlipped(false);
        setHint("");
      } catch (err) {
        console.error(err);
        setView([]);
      } finally {
        setLoadingCards(false);
      }
    }
    loadFlashcards();
  }, [selectedQuizId, quizzes, user]);

  if (quizzes === null) {
    return (
      <div className="flex justify-center pt-24">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  // No quizzes at all
  if (quizzes.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground">Flashcards</h2>
        <p className="text-sm text-muted-foreground text-center pt-10">
          No quizzes yet. Generate a quiz from the Create tab to get flashcards.
        </p>
      </div>
    );
  }

  // Quiz selection screen
  if (!selectedQuizId) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Choose a Study Set</h2>
          <p className="text-xs text-muted-foreground mt-1">Select a quiz to study its flashcards</p>
        </div>
        <div className="space-y-2.5">
          {quizzes.map((quiz) => (
            <button
              key={quiz.id}
              onClick={() => setSelectedQuizId(quiz.id)}
              className="w-full text-left rounded-2xl bg-card border border-border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/20"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                      {quiz.course_code}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{quiz.format}</span>
                  </div>
                  <h3 className="font-bold text-sm text-foreground mt-1.5 leading-snug">{quiz.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{quiz.question_count} questions</p>
                </div>
                <ChevronDown className="w-5 h-5 text-muted-foreground -rotate-90 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Loading flashcards
  if (loadingCards) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedQuizId(null)}
          className="text-sm text-primary font-medium flex items-center gap-1 hover:underline"
        >
          <ChevronDown className="w-4 h-4 rotate-90" /> Back to study sets
        </button>
        <div className="flex justify-center pt-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </div>
    );
  }

  // Empty flashcards for this quiz
  if (view.length === 0) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedQuizId(null)}
          className="text-sm text-primary font-medium flex items-center gap-1 hover:underline"
        >
          <ChevronDown className="w-4 h-4 rotate-90" /> Back to study sets
        </button>
        <p className="text-sm text-muted-foreground text-center pt-10">
          No flashcards found for this quiz. Try another study set.
        </p>
      </div>
    );
  }

  const selectedQuiz = quizzes.find(q => q.id === selectedQuizId);
  const current = view[index];
  const mastered = view.filter((c) => c.mastered).length;
  const pct = view.length ? Math.round((mastered / view.length) * 100) : 0;

  const updateLocal = (id, patch) =>
    setView((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const toggleStar = async () => {
    const card = view[index];
    if (!card) return;
    const next = !card.mastered;
    try {
      const { error } = await supabase
        .from('flashcards')
        .update({ mastered: next })
        .eq('id', card.id);
      if (error) throw error;
      updateLocal(card.id, { mastered: next });
      updateStreak();
      toast({ title: next ? "Card starred" : "Star removed" });
    } catch (err) {
      toast({ title: "Could not save", description: "Please try again later.", variant: "destructive" });
    }
  };

  const shuffle = () => {
    setIsShuffling(true);
    setTimeout(() => {
      setView((prev) => [...prev].sort(() => Math.random() - 0.5));
      setIndex(0);
      setFlipped(false);
      setHint("");
      setIsShuffling(false);
    }, 600);
  };

  const goNext = () => {
    setFlipped(false);
    setHint("");
    setIndex((i) => (i + 1) % view.length);
  };

  const generateHint = (answer) => {
    if (!answer) return '';
    const clean = answer.trim();
    const words = clean.split(/\s+/);

    // Strategy 1: Show first word with rest blanked
    if (words.length >= 3) {
      const firstWord = words[0];
      const blanked = words.slice(1).map(w => '_'.repeat(Math.min(w.length, 6))).join(' ');
      return `Starts with "${firstWord}" → ${firstWord} ${blanked}`;
    }

    // Strategy 2: Show first few characters
    if (clean.length > 10) {
      const prefix = clean.substring(0, Math.ceil(clean.length * 0.2));
      return `Hint: "${prefix}..." (${clean.length} characters)`;
    }

    // Strategy 3: Category hint for short answers
    return `This answer has ${words.length} word${words.length !== 1 ? 's' : ''} and starts with "${clean[0]}"`;
  };

  const goPrev = () => {
    setFlipped(false);
    setHint("");
    setIndex((i) => (i - 1 + view.length) % view.length);
  };

  const speak = () => {
    const card = view[index];
    if (!card || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(card.front));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setSelectedQuizId(null)}
          className="text-sm text-primary font-medium flex items-center gap-1 hover:underline"
        >
          <ChevronDown className="w-4 h-4 rotate-90" /> {selectedQuiz?.title || 'All Cards'}
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-medium text-foreground">Card {index + 1} of {view.length}</span>
          <span className="text-muted-foreground">{pct}% Mastered</span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <StudyCard
        card={current}
        flipped={flipped}
        onFlip={() => { setFlipped((f) => !f); setHint(""); }}
        onSpeak={speak}
        onToggleStar={toggleStar}
        hint={hint}
        swipeLeft={goNext}
        swipeRight={goPrev}
        isShuffling={isShuffling}
      />

      <div className="grid grid-cols-3 gap-2.5">
        <Button variant="outline" onClick={shuffle} className="h-11 rounded-2xl text-xs font-semibold">
          <Shuffle className="w-4 h-4 mr-1.5" /> Shuffle
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setHint(generateHint(current.back));
          }}
          className="h-11 rounded-2xl text-xs font-semibold"
        >
          <Lightbulb className="w-4 h-4 mr-1.5" /> Hint
        </Button>
        <Button
          variant="outline"
          onClick={toggleStar}
          className="h-11 rounded-2xl text-xs font-semibold"
        >
          <Star className={`w-4 h-4 mr-1.5 ${current.mastered ? "fill-primary text-primary" : ""}`} />
          Star
        </Button>
      </div>
    </div>
  );
}
