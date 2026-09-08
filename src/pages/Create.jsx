import React, { useState, useEffect, useCallback } from "react";
import { Sparkles, ArrowRight, Loader2, CheckCircle2, Pen, Zap, Crown, Lock, ScanLine, ClipboardPaste, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { generateStudyContent } from "@/lib/generator";
import { parseBulkQuizText, getParsedSummary } from "@/lib/bulkQuizParser";

import UploadZone from "@/components/create/UploadZone";
import ScopeSection from "@/components/create/ScopeSection";
import FormatSelector from "@/components/create/FormatSelector";
import QuizSettings from "@/components/create/QuizSettings";
import ManualQuizBuilder from "@/components/create/ManualQuizBuilder";

export default function Create() {
  const { toast } = useToast();
  const { user, profile, updateStreak } = useAuth();
  const navigate = useNavigate();
  const isPro = profile?.subscription_plan === "pro" || profile?.subscription_plan === "pro_trial";

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [mode, setMode] = useState("manual");
  const [scope, setScope] = useState("");
  const [formats, setFormats] = useState(["Multiple Choice", "Identification"]);
  const [count, setCount] = useState(20);
  const [difficulty, setDifficulty] = useState("Standard");
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [manualQuestions, setManualQuestions] = useState([]);
  const [quizTitle, setQuizTitle] = useState("");

  const [bulkText, setBulkText] = useState("");
  const [bulkQuestions, setBulkQuestions] = useState([]);
  const [bulkSummary, setBulkSummary] = useState("");

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  const aiDisabled = !isPro || !isOnline;

  useEffect(() => {
    if (mode === "ai" && aiDisabled) setMode("manual");
  }, [aiDisabled, mode]);

  const handleFileUpload = async ({ url, file }) => {
    setUploadedFile({ url, file });
  };

  const handleGenerateAI = async () => {
    if (formats.length === 0) {
      toast({ title: "Select at least one question format", variant: "destructive" });
      return;
    }
    if (!uploadedFile) {
      toast({ title: "Please upload a document first", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const content = await generateStudyContent(uploadedFile.file, { scope, formats, count, difficulty }, user?.id);
      const { error } = await supabase.from('quizzes').insert({
        title: quizTitle || "AI Generated Study Set",
        format: formats.join(", "),
        question_count: count,
        difficulty,
        completion_status: "Not Taken",
        generated_date: new Date().toISOString(),
        user_id: user?.id,
        questions: content.quiz.questions,
      });
      if (error) throw error;
      if (content.quiz.flashcards) {
        await supabase.from('flashcards').insert(
          content.quiz.flashcards.map(card => ({ ...card, user_id: user?.id, category: "AI Generated" }))
        );
      }
      setGenerating(false);
      setDone(true);
      updateStreak();
      toast({ title: "Study Set generated!", description: `${count} questions ready.` });
      setTimeout(() => { setDone(false); navigate('/quizzes'); }, 2000);
    } catch (err) {
      setGenerating(false);
      const msg = err.message || "Generation failed. Please try again.";
      toast({ title: "Generation failed", description: msg, variant: "destructive" });
    }
  };

  const handleParseBulk = useCallback(() => {
    if (!bulkText.trim()) {
      toast({ title: "Paste your quiz text first", variant: "destructive" });
      return;
    }
    const parsed = parseBulkQuizText(bulkText);
    if (parsed.length === 0) {
      toast({ title: "No questions detected", description: "Check the format and try again.", variant: "destructive" });
      return;
    }
    setBulkQuestions(parsed);
    setBulkSummary(getParsedSummary(parsed));
    toast({ title: `${parsed.length} questions parsed!`, description: getParsedSummary(parsed) });
  }, [bulkText, toast]);

  const handleBulkImport = useCallback(() => {
    if (bulkQuestions.length === 0) return;
    setManualQuestions(bulkQuestions);
    setBulkText("");
    setBulkQuestions([]);
    setBulkSummary("");
    setMode("manual");
    toast({ title: "Imported to Manual", description: `${bulkQuestions.length} questions ready to edit and save.` });
  }, [bulkQuestions, toast]);

  const handleSaveManual = async () => {
    if (manualQuestions.length === 0) {
      toast({ title: "Add at least one question", variant: "destructive" });
      return;
    }
    if (!quizTitle.trim()) {
      toast({ title: "Enter a quiz title", variant: "destructive" });
      return;
    }
    const incomplete = manualQuestions.find(q => !q.question.trim());
    if (incomplete) {
      toast({ title: "All questions must have text", variant: "destructive" });
      return;
    }
    const mcIncomplete = manualQuestions.find(q => q.type === "mc" && q.options?.some(o => !o.trim()));
    if (mcIncomplete) {
      toast({ title: "All MC options must be filled", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const { error } = await supabase.from('quizzes').insert({
        title: quizTitle,
        format: [...new Set(manualQuestions.map(q => {
          if (q.type === "mc") return "Multiple Choice";
          if (q.type === "tf") return "True/False";
          if (q.type === "id") return "Identification";
          if (q.type === "enum") return "Enumeration";
          return "Matching";
        }))].join(", "),
        question_count: manualQuestions.length,
        difficulty,
        completion_status: "Not Taken",
        generated_date: new Date().toISOString(),
        user_id: user?.id,
        questions: manualQuestions,
      });
      if (error) throw error;
      setGenerating(false);
      setDone(true);
      updateStreak();
      toast({ title: "Quiz saved!", description: `${manualQuestions.length} questions created.` });
      setTimeout(() => { setDone(false); navigate('/quizzes'); }, 2000);
    } catch (err) {
      setGenerating(false);
      toast({ title: "Save failed", description: "Please try again later.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 pb-2">
      <section className="pt-2">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Ready to ace your review?</h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Turn your syllabi, lecture slides, or PDF notes into practice quizzes.
        </p>
      </section>

      {/* Offline indicator */}
      {!isOnline && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/30 animate-in fade-in slide-in-from-top-1">
          <Zap className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            You're offline — AI generation unavailable
          </p>
        </div>
      )}

      {/* Mode tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-secondary rounded-2xl">
        <button
          onClick={() => setMode("manual")}
          className={`flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-all ${
            mode === "manual"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Pen className="w-4 h-4" />
          Manual
        </button>
        <button
          onClick={() => navigate("/scan")}
          className="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground transition-all"
        >
          <ScanLine className="w-4 h-4" />
          Scan
        </button>
        <button
          onClick={() => setMode("bulk")}
          className={`flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-all ${
            mode === "bulk"
              ? "bg-card shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ClipboardPaste className="w-4 h-4" />
          Bulk Paste
        </button>
        <button
          onClick={aiDisabled ? null : () => setMode("ai")}
          disabled={aiDisabled}
          className={`flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-all ${
            mode === "ai"
              ? "bg-primary text-primary-foreground shadow-sm"
              : aiDisabled
                ? "text-muted-foreground/40 cursor-not-allowed bg-card"
                : "text-muted-foreground hover:text-foreground hover:bg-card"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          AI Generate
          {aiDisabled && <Lock className="w-3 h-3" />}
        </button>
      </div>

      {/* AI mode */}
      {mode === "ai" && (
        <div className="space-y-6">
          <UploadZone onUploadSuccess={handleFileUpload} />
          <ScopeSection scope={scope} setScope={setScope} />

          <div className="space-y-3">
            <Input
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              placeholder="Quiz title (optional)"
              className="h-11 rounded-xl text-sm"
            />
          </div>

          <FormatSelector selected={formats} setSelected={setFormats} />
          <QuizSettings count={count} setCount={setCount} difficulty={difficulty} setDifficulty={setDifficulty} />

          <Button
            onClick={handleGenerateAI}
            disabled={generating || aiDisabled}
            className="w-full h-12 py-3.5 rounded-2xl text-base font-semibold shadow-lg shadow-primary/25"
          >
            {generating ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating...</>
            ) : done ? (
              <><CheckCircle2 className="w-5 h-5 mr-2" /> Study Set Ready!</>
            ) : (
              <><Sparkles className="w-5 h-5 mr-2" /> Generate Study Set <ArrowRight className="w-5 h-5 ml-2" /></>
            )}
          </Button>
        </div>
      )}

      {/* === MANUAL MODE === */}
      {mode === "manual" && (
        <div className="space-y-5">
          <div className="space-y-3">
            <Input
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              placeholder="Quiz title (e.g. Biology Midterm)"
              className="h-11 rounded-xl text-sm"
            />
          </div>

          <QuizSettings count={count} setCount={setCount} difficulty={difficulty} setDifficulty={setDifficulty} />

          <ManualQuizBuilder questions={manualQuestions} onChange={setManualQuestions} />

          <Button
            onClick={handleSaveManual}
            disabled={generating || manualQuestions.length === 0}
            className="w-full h-12 py-3.5 rounded-2xl text-base font-semibold shadow-lg shadow-primary/25"
          >
            {generating ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Saving...</>
            ) : done ? (
              <><CheckCircle2 className="w-5 h-5 mr-2" /> Quiz Saved!</>
            ) : (
              <>Save Quiz <ArrowRight className="w-5 h-5 ml-2" /></>
            )}
          </Button>
        </div>
      )}

      {/* === BULK PASTE MODE === */}
      {mode === "bulk" && (
        <div className="space-y-5">
          <div className="space-y-3">
            <Input
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              placeholder="Quiz title (e.g. Biology Midterm)"
              className="h-11 rounded-xl text-sm"
            />
          </div>

          <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/30 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Paste Format Guide</span>
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400 space-y-2 font-mono bg-blue-100/50 dark:bg-blue-900/20 rounded-xl p-3">
              <p className="font-sans font-semibold text-blue-700 dark:text-blue-300">Multiple Choice:</p>
              <p>{"1.) Question text"}</p>
              <p>{"A.) Option A"}</p>
              <p>{"B.) Option B *"}</p>
              <p>{"C.) Option C"}</p>
              <p>{"D.) Option D"}</p>
              <p className="font-sans font-semibold text-blue-700 dark:text-blue-300 pt-1">True/False:</p>
              <p>{"2.) Question text"}</p>
              <p>{"A.) True *"}</p>
              <p>{"B.) False"}</p>
              <p className="font-sans font-semibold text-blue-700 dark:text-blue-300 pt-1">Identification:</p>
              <p>{"3.) What is the capital of France?"}</p>
              <p className="font-sans font-semibold text-blue-700 dark:text-blue-300 pt-1">Enumeration:</p>
              <p>{"4.) Name the 3 branches of government:"}</p>
              <p>{"1. Executive"}</p>
              <p>{"2. Legislative"}</p>
              <p>{"3. Judicial"}</p>
              <p className="text-[10px] text-blue-500 pt-1">* Mark correct answer with asterisk (*)</p>
            </div>
          </div>

          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="Paste your quiz text here..."
            className="min-h-[250px] rounded-2xl text-sm font-mono resize-y"
          />

          {bulkQuestions.length > 0 && (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/30 p-4 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    {bulkQuestions.length} Questions Parsed
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">{bulkSummary}</p>
                </div>
                <button
                  onClick={() => { setBulkQuestions([]); setBulkSummary(""); }}
                  className="p-1.5 text-emerald-600 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {bulkQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">{i + 1}.</span>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{q.question}</p>
                      <p className="text-muted-foreground capitalize">{q.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {bulkQuestions.length === 0 ? (
              <Button
                onClick={handleParseBulk}
                disabled={!bulkText.trim()}
                className="flex-1 h-12 rounded-2xl text-base font-semibold"
              >
                <ClipboardPaste className="w-5 h-5 mr-2" />
                Parse Questions
              </Button>
            ) : (
              <Button
                onClick={handleBulkImport}
                className="flex-1 h-12 rounded-2xl text-base font-semibold shadow-lg shadow-primary/25"
              >
                <ArrowRight className="w-5 h-5 mr-2" />
                Import to Manual & Save
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
