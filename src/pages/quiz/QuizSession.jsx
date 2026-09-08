import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ChevronLeft, CheckCircle2, XCircle, Clock, Shuffle, Timer, ToggleLeft, ToggleRight, Lock, Play } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { Preferences as CapPreferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

let Preferences = null;
function getPreferences() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!Preferences) Preferences = CapPreferences;
  return Preferences;
}

function cleanDisplayText(text) {
  if (!text) return '';
  return String(text)
    .replace(/={3,}/g, '')
    .replace(/-{3,}/g, '')
    .replace(/_{3,}/g, '')
    .replace(/Document\s+ID:.*$/gm, '')
    .replace(/Version:\s*\d+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 150);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const TIMER_PRESETS = [
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '20 min', seconds: 1200 },
  { label: '30 min', seconds: 1800 },
  { label: 'No limit', seconds: 0 },
];

async function saveQuizProgress(quizId, data) {
  try {
    const P = getPreferences();
    if (P) {
      await P.set({ key: `quiz-progress-${quizId}`, value: JSON.stringify(data) });
    } else {
      localStorage.setItem(`quiz-progress-${quizId}`, JSON.stringify(data));
    }
  } catch {}
}

async function loadQuizProgress(quizId) {
  try {
    const P = getPreferences();
    let raw;
    if (P) {
      const result = await P.get({ key: `quiz-progress-${quizId}` });
      raw = result?.value;
    } else {
      raw = localStorage.getItem(`quiz-progress-${quizId}`);
    }
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function clearQuizProgress(quizId) {
  try {
    const P = getPreferences();
    if (P) {
      await P.remove({ key: `quiz-progress-${quizId}` });
    } else {
      localStorage.removeItem(`quiz-progress-${quizId}`);
    }
  } catch {}
}

function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);
}

export default function QuizSession() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, updateStreak } = useAuth();
  const isPro = profile?.subscription_plan === "pro" || profile?.subscription_plan === "pro_trial";
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [started, setStarted] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const offlineRef = useRef(!navigator.onLine);

  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleAnswers, setShuffleAnswers] = useState(true);
  const [timerPreset, setTimerPreset] = useState(TIMER_PRESETS[1]);
  const timerEnabled = timerPreset.seconds > 0;

  useEffect(() => {
    if (!isPro) setShuffleAnswers(false);
  }, [isPro]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    const handleOnline = () => { setOffline(false); offlineRef.current = false; };
    const handleOffline = () => { setOffline(true); offlineRef.current = true; };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadQuiz() {
      try {
        const { data, error } = await withTimeout(
          supabase.from('quizzes').select('*').eq('id', id).single(),
          8000
        );
        if (error) throw error;
        if (!cancelled) {
          setQuiz(data);
          const saved = await loadQuizProgress(id);
          if (saved && saved.started && !saved.isSubmitted && data?.questions?.length > 0) {
            setQuestions(saved.questions || []);
            setCurrentIndex(saved.currentIndex || 0);
            setAnswers(saved.answers || {});
            setStarted(true);
            setElapsed(saved.elapsed || 0);
            setTimeLeft(saved.timeLeft || 0);
            setShuffleQuestions(saved.shuffleQuestions ?? true);
            setShuffleAnswers(saved.shuffleAnswers ?? true);
            if (saved.timerPreset) setTimerPreset(saved.timerPreset);
          }
        }
      } catch (err) {
        console.error('Load quiz error:', err);
        if (!cancelled) {
          if (err.message === 'TIMEOUT' || offlineRef.current) {
            toast({ title: "Offline", description: "Check your connection and try again.", variant: "destructive" });
          } else {
            toast({ title: "Failed to load quiz", description: "Please try again later.", variant: "destructive" });
          }
          navigate('/quizzes');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadQuiz();
    return () => { cancelled = true; };
  }, [id, navigate, toast]);

  // Auto-save progress
  useEffect(() => {
    if (!started || isSubmitted || !id) return;
    const timer = setTimeout(() => {
      saveQuizProgress(id, {
        started, isSubmitted, questions, currentIndex, answers,
        elapsed, timeLeft, shuffleQuestions, shuffleAnswers, timerPreset,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [id, started, isSubmitted, questions, currentIndex, answers, elapsed, timeLeft, shuffleQuestions, shuffleAnswers, timerPreset]);

  useEffect(() => {
    if (!started || isSubmitted) return;
    timerRef.current = setInterval(() => {
      setElapsed(e => e + 1);
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [started, isSubmitted]);

  const handleStart = useCallback(() => {
    if (!quiz || !quiz.questions || quiz.questions.length === 0) {
      toast({ title: "No questions", description: "This quiz has no questions. Try scanning or generating one.", variant: "destructive" });
      return;
    }
    let qs = quiz.questions;
    if (shuffleQuestions) qs = shuffleArray(qs);
    if (shuffleAnswers && isPro) {
      qs = qs.map(q => {
        if (q.options && q.options.length > 0) {
          const correctText = q.options[q.correct];
          const shuffledOpts = shuffleArray(q.options);
          const newCorrect = shuffledOpts.indexOf(correctText);
          return { ...q, options: shuffledOpts, correct: newCorrect };
        }
        return q;
      });
    }
    setQuestions(qs);
    setStarted(true);
    setElapsed(0);
    setTimeLeft(timerPreset.seconds);
  }, [quiz, shuffleQuestions, shuffleAnswers, timerPreset, isPro, toast]);

  const calculateScore = useCallback(() => {
    let correct = 0;
    questions.forEach((q, i) => {
      const userAnswer = answers[i];
      const qType = q.type || 'mc';
      if (userAnswer === undefined || userAnswer === null) return;
      if (qType === 'mc' || qType === 'tf') {
        if (userAnswer === q.correct) correct++;
      } else if (qType === 'match') {
        const correctMap = q.correct || [];
        const userMap = userAnswer || {};
        let allCorrect = correctMap.length > 0;
        for (let mi = 0; mi < correctMap.length; mi++) {
          if (userMap[mi] !== correctMap[mi]) { allCorrect = false; break; }
        }
        if (allCorrect) correct++;
      } else if (qType === 'id') {
        const u = String(userAnswer).trim().toLowerCase();
        const c = String(q.correct).trim().toLowerCase();
        if (u === c || c.includes(u) || u.includes(c)) correct++;
      }
    });
    return Math.round((correct / questions.length) * 100);
  }, [questions, answers]);

  const submitQuiz = useCallback(async () => {
    if (saving || isSubmitted) return;
    const score = calculateScore();
    setSaving(true);
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const { error } = await withTimeout(
        supabase.from('quizzes').update({ completion_status: "Completed", score }).eq('id', quiz.id),
        8000
      );
      if (error) throw error;
      setQuiz(prev => ({ ...prev, completion_status: "Completed", score }));
      setIsSubmitted(true);
      clearQuizProgress(id);
      updateStreak();
      const timeMsg = timerEnabled ? ` in ${formatTime(timerPreset.seconds - timeLeft)}` : ` in ${formatTime(elapsed)}`;
      toast({ title: "Quiz submitted!", description: `You scored ${score}%${timeMsg}` });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to save score", description: "Please try again later.", variant: "destructive" });
      setIsSubmitted(true);
    } finally {
      setSaving(false);
    }
  }, [saving, isSubmitted, calculateScore, quiz, id, timerPreset, timeLeft, elapsed, toast]);

  const submitQuizRef = useRef(submitQuiz);
  submitQuizRef.current = submitQuiz;

  useEffect(() => {
    if (timerEnabled && timeLeft <= 0 && started && !isSubmitted) {
      if (timerRef.current) clearInterval(timerRef.current);
      submitQuizRef.current();
    }
  }, [timerEnabled, timeLeft, timerPreset.seconds, started, isSubmitted]);

  if (loading) return <div className="flex justify-center pt-24"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>;
  if (!quiz || !quiz.questions || quiz.questions.length === 0) return <div className="text-center pt-24">Quiz not found</div>;

  if (!started) {
    return (
      <div className="max-w-md mx-auto px-5 py-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Play className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Ready to Start?</h1>
          <p className="text-sm text-muted-foreground">{quiz.questions?.length || 0} questions</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Time Limit</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TIMER_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setTimerPreset(p)}
                  className={`h-9 rounded-xl text-xs font-semibold transition-all ${
                    timerPreset.label === p.label
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-secondary text-foreground hover:bg-secondary/80'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <div className="space-y-3">
              <button
                onClick={() => setShuffleQuestions(!shuffleQuestions)}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Shuffle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Shuffle Questions</span>
                </div>
                {shuffleQuestions
                  ? <ToggleRight className="w-8 h-8 text-primary" />
                  : <ToggleLeft className="w-8 h-8 text-muted-foreground" />
                }
              </button>
              <button
                onClick={() => isPro ? setShuffleAnswers(!shuffleAnswers) : null}
                className={`w-full flex items-center justify-between ${!isPro ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Shuffle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Shuffle Answers</span>
                  {!isPro && <Lock className="w-3 h-3 text-amber-500" />}
                </div>
                {shuffleAnswers
                  ? <ToggleRight className="w-8 h-8 text-primary" />
                  : <ToggleLeft className="w-8 h-8 text-muted-foreground" />
                }
              </button>
            </div>
          </div>
        </div>

        <Button onClick={handleStart} className="w-full h-12 rounded-xl text-base font-semibold">
          Start Quiz
        </Button>
        <Button variant="outline" onClick={() => navigate('/quizzes')} className="w-full h-12 rounded-xl">
          Back to Quizzes
        </Button>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const questionType = currentQuestion?.type || 'mc';

  const handleAnswer = (value) => {
    if (isSubmitted) return;
    setAnswers({ ...answers, [currentIndex]: value });
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      submitQuiz();
    }
  };

  const handleRetake = async () => {
    try {
      await withTimeout(
        supabase.from('quizzes').update({ completion_status: "Not Taken", score: null }).eq('id', quiz.id),
        8000
      );
      setQuiz(prev => ({ ...prev, completion_status: "Not Taken", score: null }));
    } catch (err) {
      console.error(err);
      // Still allow retake even if Supabase fails (offline)
      setQuiz(prev => prev ? { ...prev, completion_status: "Not Taken", score: null } : prev);
    }
    await clearQuizProgress(id);
    setAnswers({});
    setCurrentIndex(0);
    setIsSubmitted(false);
    setStarted(false);
    setElapsed(0);
    setTimeLeft(0);
  };

  const renderAnswerInput = () => {
    if (questionType === 'id') {
      return (
        <div className="space-y-3">
          <Textarea
            placeholder="Type your answer..."
            value={answers[currentIndex] || ''}
            onChange={(e) => handleAnswer(e.target.value)}
            disabled={isSubmitted}
            className="min-h-[80px] rounded-xl text-base resize-none"
            rows={2}
            autoFocus
          />
        </div>
      );
    }

    if (questionType === 'match') {
      const leftItems = currentQuestion.options || [];
      const rightItems = currentQuestion.matchOptions || [];
      if (leftItems.length === 0 || rightItems.length === 0) {
        return (
          <div className="p-4 rounded-2xl bg-secondary text-center">
            <p className="text-sm text-muted-foreground">No matching pairs available for this question.</p>
          </div>
        );
      }

      const userAnswers = answers[currentIndex] || {};
      const correctMap = currentQuestion.correct || [];

      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-medium mb-1">Match each item on the left with its pair on the right:</p>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-2 items-center">
            {leftItems.map((item, i) => {
              const selectedIdx = userAnswers[i];
              const isCorrectMatch = isSubmitted && selectedIdx === correctMap[i];
              const isWrongMatch = isSubmitted && selectedIdx !== undefined && selectedIdx !== correctMap[i];

              return (
                <React.Fragment key={i}>
                  {/* Left item */}
                  <div className={`p-3 rounded-xl border-2 text-sm font-medium ${
                    isSubmitted
                      ? isCorrectMatch ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : isWrongMatch ? "border-red-400 bg-red-50 text-red-800"
                        : "border-border bg-card text-foreground"
                      : "border-border bg-card text-foreground"
                  }`}>
                    <span className="font-bold text-xs text-muted-foreground mr-1.5">{String.fromCharCode(65 + i)}.</span>
                    {cleanDisplayText(item)}
                  </div>

                  {/* Arrow */}
                  <span className="text-muted-foreground text-lg">→</span>

                  {/* Right item — dropdown */}
                  <div>
                    {isSubmitted ? (
                      <div className={`p-3 rounded-xl border-2 text-sm ${
                        isCorrectMatch ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                          : isWrongMatch ? "border-red-400 bg-red-50 text-red-800"
                          : "border-border bg-card text-foreground"
                      }`}>
                        {cleanDisplayText(rightItems[selectedIdx] ?? "—")}
                        {isCorrectMatch && <CheckCircle2 className="w-4 h-4 text-emerald-600 inline ml-1.5 shrink-0" />}
                        {isWrongMatch && <XCircle className="w-4 h-4 text-red-500 inline ml-1.5 shrink-0" />}
                      </div>
                    ) : (
                      <select
                        value={selectedIdx ?? ""}
                        onChange={(e) => {
                          const val = e.target.value === "" ? undefined : parseInt(e.target.value);
                          setAnswers({ ...answers, [currentIndex]: { ...userAnswers, [i]: val } });
                        }}
                        className="w-full p-3 rounded-xl border-2 border-border bg-card text-sm text-foreground focus:border-primary focus:outline-none transition-colors appearance-none cursor-pointer"
                      >
                        <option value="">Select match...</option>
                        {rightItems.map((r, ri) => (
                          <option key={ri} value={ri}>{String.fromCharCode(65 + ri)}. {cleanDisplayText(r)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      );
    }

    const options = currentQuestion.options || (questionType === 'tf' ? ['True', 'False'] : []);

    if (options.length === 0) {
      return (
        <div className="p-4 rounded-2xl bg-secondary text-center">
          <p className="text-sm text-muted-foreground">No options available for this question.</p>
        </div>
      );
    }

    return (
      <div className="grid gap-3">
        {options.map((opt, i) => {
          const isSelected = answers[currentIndex] === i;
          const isCorrectOption = i === currentQuestion.correct;
          let optionStyle = "border-border bg-card hover:border-primary/50";
          if (isSubmitted) {
            if (isCorrectOption) optionStyle = "border-emerald-500 bg-emerald-50 text-emerald-800";
            else if (isSelected && !isCorrectOption) optionStyle = "border-red-400 bg-red-50 text-red-800";
          } else if (isSelected) {
            optionStyle = "border-primary bg-primary/5 text-primary font-semibold";
          }
          return (
            <button
              key={i}
              onClick={() => handleAnswer(i)}
              disabled={isSubmitted}
              className={`w-full p-4 text-left rounded-2xl border-2 transition-all ${optionStyle}`}
            >
              <span className="font-medium mr-2">{String.fromCharCode(65 + i)}.</span>
              {cleanDisplayText(opt)}
              {isSubmitted && isCorrectOption && <CheckCircle2 className="w-4 h-4 text-emerald-600 inline ml-2" />}
              {isSubmitted && isSelected && !isCorrectOption && <XCircle className="w-4 h-4 text-red-500 inline ml-2" />}
            </button>
          );
        })}
      </div>
    );
  };

  const questionTypeLabel = { mc: 'Multiple Choice', id: 'Identification', tf: 'True or False', match: 'Matching' };
  const displayTime = timerEnabled ? timeLeft : elapsed;
  const timeWarning = timerEnabled && timeLeft <= 30 && timeLeft > 0;

  if (isSubmitted) {
    const score = calculateScore();
    const finalTime = timerEnabled ? timerPreset.seconds - timeLeft : elapsed;
    return (
      <div className="max-w-md mx-auto px-5 py-6 space-y-5">
        <div className="text-center space-y-4">
          <div className={`w-24 h-24 ${score >= 85 ? 'bg-primary/10 text-primary' : score >= 70 ? 'bg-cyan-100 text-cyan-700' : 'bg-amber-100 text-amber-700'} rounded-full flex items-center justify-center text-3xl font-bold mx-auto`}>
            {score}%
          </div>
          <div>
            <h1 className="text-2xl font-bold">Quiz Completed!</h1>
            <p className="text-muted-foreground mt-1">Time: {formatTime(finalTime)} · {score >= 85 ? "Great job!" : score >= 70 ? "Good effort!" : "Keep studying!"}</p>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Answer Review</h2>
          {questions.map((q, i) => {
            const userAnswer = answers[i];
            const qType = q.type || 'mc';
            let isCorrect = false;
            if (userAnswer !== undefined && userAnswer !== null) {
              if (qType === 'mc' || qType === 'tf') {
                isCorrect = userAnswer === q.correct;
              } else if (qType === 'match') {
                const correctMap = q.correct || [];
                const userMap = userAnswer || {};
                isCorrect = correctMap.length > 0 && correctMap.every((c, mi) => userMap[mi] === c);
              } else if (qType === 'id') {
                const u = String(userAnswer).trim().toLowerCase();
                const c = String(q.correct).trim().toLowerCase();
                isCorrect = u === c || c.includes(u) || u.includes(c);
              }
            }

            let correctLabel, userLabel;
            if (qType === 'match') {
              const correctMap = q.correct || [];
              const leftItems = q.options || [];
              const rightItems = q.matchOptions || [];
              correctLabel = correctMap.map((ci, li) => `${String.fromCharCode(65 + li)}→${String.fromCharCode(65 + ci)}`).join(', ');
              const userMap = userAnswer || {};
              userLabel = Object.keys(userMap).map(li => `${String.fromCharCode(65 + parseInt(li))}→${String.fromCharCode(65 + userMap[li])}`).join(', ') || 'No answer';
            } else if (qType === 'mc' || qType === 'tf') {
              correctLabel = q.options?.[q.correct] ?? String(q.correct);
              userLabel = userAnswer === undefined || userAnswer === null ? 'No answer' : (q.options?.[userAnswer] ?? String(userAnswer));
            } else {
              correctLabel = String(q.correct);
              userLabel = userAnswer === undefined || userAnswer === null ? 'No answer' : String(userAnswer);
            }
            return (
              <div key={i} className={`rounded-2xl border-2 p-4 ${isCorrect ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-red-400 bg-red-50/50 dark:bg-red-950/20'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                    {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-snug">{cleanDisplayText(q.question)}</p>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs">
                        <span className="text-muted-foreground">Your answer: </span>
                        <span className={isCorrect ? 'text-emerald-700 font-medium' : 'text-red-600 font-medium'}>{cleanDisplayText(userLabel)}</span>
                      </p>
                      {!isCorrect && (
                        <p className="text-xs">
                          <span className="text-muted-foreground">Correct: </span>
                          <span className="text-emerald-700 font-medium">{cleanDisplayText(correctLabel)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Button onClick={handleRetake} className="w-full h-12 rounded-xl">Retake Quiz</Button>
          <Button variant="outline" onClick={() => navigate('/quizzes')} className="w-full h-12 rounded-xl">Back to Quizzes</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-5 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/quizzes')} className="p-2 hover:bg-secondary rounded-full transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="text-center">
          <div className="text-sm font-medium text-muted-foreground">
            Question {currentIndex + 1} of {questions.length}
          </div>
          <div className="text-[11px] text-primary font-semibold mt-0.5">
            {questionTypeLabel[questionType] || 'Multiple Choice'}
          </div>
        </div>
        <div className={`flex items-center gap-1 text-sm font-mono ${timeWarning ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}`}>
          <Clock className="w-4 h-4" />
          {formatTime(displayTime)}
        </div>
      </div>

      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
      </div>

      <div className="space-y-6">
        <h2 className="text-xl font-bold leading-tight">{cleanDisplayText(currentQuestion.question)}</h2>
        {renderAnswerInput()}
      </div>

      <Button
        onClick={handleNext}
        disabled={answers[currentIndex] === undefined || answers[currentIndex] === '' || saving}
        className="w-full h-12 rounded-xl font-semibold"
      >
        {saving ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
        ) : currentIndex === questions.length - 1 ? (
          "Finish Quiz"
        ) : (
          "Next Question"
        )}
      </Button>
    </div>
  );
}