import React, { useEffect, useState, useRef } from "react";
import { Search, SlidersHorizontal, Loader2, ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/lib/AuthContext";

import StatsRow from "@/components/quizzes/StatsRow";
import QuizCard from "@/components/quizzes/QuizCard";

const tabs = ["All", "Not Started", "In Progress", "Completed"];

const sortOptions = [
  { label: "Newest First", key: "date-desc" },
  { label: "Oldest First", key: "date-asc" },
  { label: "Score: High to Low", key: "score-desc" },
  { label: "Score: Low to High", key: "score-asc" },
];

export default function Quizzes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState(null);
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");
  const [showSort, setShowSort] = useState(false);
  const sortRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (sortRef.current && !sortRef.current.contains(e.target)) setShowSort(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const load = async () => {
    try {
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('user_id', user?.id)
        .order('generated_date', { ascending: false });
      if (error) throw error;
      setQuizzes(data);
    } catch (err) {
      console.error(err);
      setQuizzes([]);
    }
  };

  const handleDelete = async (id) => {
    try {
      const quiz = quizzes.find(q => q.id === id);
      if (quiz) {
        const { error: flashErr } = await supabase
          .from('flashcards')
          .delete()
          .eq('user_id', user?.id)
          .or(`category.ilike.%${quiz.title}%,category.ilike.%${quiz.course_code}%,category.eq.AI Generated,category.eq.Local Generated`);
        if (flashErr) console.warn('Flashcard delete error:', flashErr);
      }
      const { error } = await supabase.from('quizzes').delete().eq('id', id);
      if (error) throw error;
      await load();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  useEffect(() => {
    load();
  }, [user]);

  if (!quizzes) {
    return (
      <div className="flex justify-center pt-24">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const scored = quizzes.filter((q) => typeof q.score === "number");
  const completed = quizzes.filter((q) => q.completion_status === "Completed").length;
  const avg = scored.length
    ? Math.round(scored.reduce((s, q) => s + q.score, 0) / scored.length)
    : 0;
  const focus = quizzes.reduce((s, q) => s + (q.study_time_hours || 0), 0).toFixed(1);

  let visible = quizzes;
  const q = search.trim().toLowerCase();
  if (q) {
    visible = visible.filter(
      (x) =>
        (x.title || "").toLowerCase().includes(q) ||
        (x.course_code || "").toLowerCase().includes(q)
    );
  }
  if (tab === "Not Started") visible = visible.filter(q => !q.completion_status || q.completion_status === "Not Taken" || q.completion_status === "Pending");
  if (tab === "In Progress") visible = visible.filter(q => q.completion_status === "In Progress");
  if (tab === "Completed") visible = visible.filter(q => q.completion_status === "Completed");

  visible = [...visible].sort((a, b) => {
    switch (sortBy) {
      case "date-asc":
        return new Date(a.generated_date || 0) - new Date(b.generated_date || 0);
      case "score-desc":
        return (b.score ?? -1) - (a.score ?? -1);
      case "score-asc":
        return (a.score ?? 999) - (b.score ?? 999);
      default:
        return new Date(b.generated_date || 0) - new Date(a.generated_date || 0);
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your quizzes..."
            className="w-full h-11 rounded-2xl bg-secondary border border-transparent pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-card transition-colors"
          />
        </div>
        <div className="relative" ref={sortRef}>
          <button
            onClick={() => setShowSort(!showSort)}
            className="w-11 h-11 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors active:scale-95"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          {showSort && (
            <div className="absolute right-0 top-12 z-50 w-52 bg-card border border-border rounded-2xl shadow-xl p-1.5">
              {sortOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setSortBy(opt.key); setShowSort(false); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    sortBy === opt.key
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-foreground hover:bg-secondary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <StatsRow completed={completed} avg={avg} focus={focus} />

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold transition-all duration-200 active:scale-95 hover:shadow-sm ${
              tab === t
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center pt-10">
            No quizzes found
          </p>
        ) : (
          visible.map((quiz, i) => (
            <QuizCard
              key={quiz.id}
              quiz={quiz}
              index={i}
              onUpdated={load}
              onDelete={() => handleDelete(quiz.id)}
            />
          ))
        )}
      </div>

    </div>
  );
}
