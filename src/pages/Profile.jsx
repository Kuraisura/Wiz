import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/supabaseClient";

import { useAuth } from "@/lib/AuthContext";
import ProfileCard from "@/components/profile/ProfileCard";
import ProfileSettingsList from "@/components/profile/ProfileSettingsList";

export default function Profile() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [stats, setStats] = useState({ flashcards: 0, mastery: 0, daily_streak: 0 });

  useEffect(() => {
    async function loadStats() {
      if (!user?.id) return;
      try {
        const { data: userQuizzes } = await supabase
          .from('quizzes')
          .select('title, course_code')
          .eq('user_id', user?.id);
        const quizTerms = (userQuizzes || []).flatMap(q => [
          (q.title || '').toLowerCase(),
          (q.course_code || '').toLowerCase(),
        ]).filter(Boolean);

        const { data: cards, error: cardsErr } = await supabase
          .from('flashcards')
          .select('*')
          .eq('user_id', user?.id);
        if (cardsErr) throw cardsErr;
        const relevant = quizTerms.length > 0
          ? (cards || []).filter(c => {
              const cat = (c.category || '').toLowerCase();
              return quizTerms.some(t => cat.includes(t) || t.includes(cat));
            })
          : [];
        const mastered = relevant.filter((c) => c.mastered).length;
        const total = relevant.length || 1;
        setStats({
          flashcards: relevant.length,
          mastery: relevant.length ? Math.round((mastered / total) * 100) : 0,
          daily_streak: profile?.daily_streak || 0,
        });
      } catch (err) {
        console.error('Failed to load stats:', err);
      }
    }
    loadStats();
  }, [user, profile]);

  const name = profile?.full_name || user?.email?.split("@")[0] || "Student";
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-30 bg-background border-b border-border" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="max-w-md mx-auto px-5 h-16 flex items-center justify-between relative">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-foreground">Profile</span>
          <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
            {initials}
          </div>
        </div>
      </header>
      <main className="max-w-md mx-auto px-5 py-5 pb-10" style={{ marginTop: "calc(4rem + var(--safe-top, 0px))" }}>
        <div className="space-y-6 animate-fade-in">
          <ProfileCard user={user} profile={profile} stats={stats} />
          <ProfileSettingsList user={user} profile={profile} />
        </div>
      </main>
    </div>
  );
}
