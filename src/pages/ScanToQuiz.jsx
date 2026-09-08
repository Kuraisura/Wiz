import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  Upload,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  RotateCcw,
  FileText,
  Eye,
  Edit3,
  Sparkles,
  ScanLine,
  AlertCircle,
  Zap,
  Lock,
  Crown,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";

function isNative() {
  return window.Capacitor?.isNativePlatform?.() || false;
}
import { extractTextFromImage } from "@/lib/ocrService";
import { parseQuestionsFromText } from "@/lib/scanEngine";

const STEPS = {
  CAPTURE: "capture",
  PREVIEW: "preview",
  SCANNING: "scanning",
  EDIT: "edit",
  QUIZ: "quiz",
  DONE: "done",
};

export default function ScanToQuiz() {
  const navigate = useNavigate();
  const { user, profile, updateStreak } = useAuth();
  const { toast } = useToast();
  const isPro = profile?.subscription_plan === "pro" || profile?.subscription_plan === "pro_trial";
  const fileInputRef = useRef(null);

  const [step, setStep] = useState(STEPS.CAPTURE);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [ocrSource, setOcrSource] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [questions, setQuestions] = useState([]);
  const [quizTitle, setQuizTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cameraLoading, setCameraLoading] = useState(false);

  // Open native camera using Capacitor Camera plugin
  const handleCameraClick = useCallback(async () => {
    setCameraLoading(true);
    setError("");
    try {
      const { Camera: CapCamera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        width: 1200,
      });

      if (photo?.dataUrl) {
        fetch(photo.dataUrl).then(res => res.blob()).then(blob => {
          const file = new File([blob], "camera-photo.jpg", { type: "image/jpeg" });
          setImageFile(file);
          setImagePreview(photo.dataUrl);
          setStep(STEPS.PREVIEW);
        });
      }
    } catch (err) {
      // User cancelled or error
      if (err?.message?.includes('cancel') || err?.message?.includes('User')) {
        // Silently ignore cancel
      } else {
        console.error('[Scan] Camera error:', err);
        setError("Could not open camera. Please try uploading an image instead.");
      }
    } finally {
      setCameraLoading(false);
    }
  }, []);

  // Handle image selection (from file picker)
  const handleImageSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPG, PNG, etc.)");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image is too large. Maximum size is 10MB.");
      return;
    }

    setError("");
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target.result);
      setStep(STEPS.PREVIEW);
    };
    reader.readAsDataURL(file);
  }, []);

  // Run OCR on the image
  const handleScan = async () => {
    if (!imageFile) return;

    setStep(STEPS.SCANNING);
    setOcrProgress(0);
    setError("");

    try {
      const result = await extractTextFromImage(imageFile, (progress) => {
        setOcrProgress(progress);
      });

      if (!result.text || result.text.trim().length < 10) {
        setError("No text detected. Please try with a clearer image containing text.");
        setStep(STEPS.PREVIEW);
        return;
      }

      setExtractedText(result.text);
      setOcrConfidence(result.confidence);
      setOcrSource(result.source || "tesseract");
      setStep(STEPS.EDIT);
    } catch (err) {
      console.error("[Scan] OCR failed:", err);
      setError(err.message || "Text recognition failed. Please try again with a clearer image.");
      setStep(STEPS.PREVIEW);
    }
  };

  // Parse edited text into questions
  const handleParseQuestions = () => {
    if (!extractedText.trim()) {
      setError("Please enter some text to generate questions.");
      return;
    }

    try {
      const parsed = parseQuestionsFromText(extractedText);
      if (parsed.length === 0) {
        setError("Could not detect quiz questions from this text. Try editing the text to include numbered questions (1. 2. 3.) or Q/A format.");
        return;
      }
      setQuestions(parsed);
      setStep(STEPS.QUIZ);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to parse questions. Please try again.");
    }
  };

  // Save quiz to database
  const handleSaveQuiz = async () => {
    if (!quizTitle.trim()) {
      setError("Please enter a quiz title.");
      return;
    }
    if (questions.length === 0) {
      setError("No questions to save.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const { error: dbError } = await supabase.from("quizzes").insert({
        title: quizTitle,
        course_code: courseCode || "SCAN",
        format: [...new Set(questions.map((q) => {
          if (q.type === "mc") return "Multiple Choice";
          if (q.type === "tf") return "True or False";
          return "Identification";
        }))].join(", "),
        question_count: questions.length,
        difficulty: "Standard",
        completion_status: "Not Taken",
        generated_date: new Date().toISOString(),
        user_id: user?.id,
        questions: questions,
      });

      if (dbError) throw dbError;

      setStep(STEPS.DONE);
      updateStreak();
      toast({
        title: "Quiz saved!",
        description: `${questions.length} questions created from scan.`,
      });

      setTimeout(() => navigate("/quizzes"), 2000);
    } catch (err) {
      console.error("[Scan] Save failed:", err);
      setError("Failed to save quiz. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Reset to start
  const handleReset = () => {
    setStep(STEPS.CAPTURE);
    setImageFile(null);
    setImagePreview(null);
    setExtractedText("");
    setQuestions([]);
    setQuizTitle("");
    setCourseCode("");
    setError("");
    setOcrProgress(0);
    setOcrConfidence(0);
  };

  // Update a question
  const updateQuestion = (index, patch) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  // Delete a question
  const deleteQuestion = (index) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-background">

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-background border-b border-border" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="max-w-md mx-auto px-5 h-16 flex items-center justify-between relative">
          <button
            onClick={() => (step === STEPS.CAPTURE ? navigate(-1) : handleReset())}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-foreground">Scan to Quiz</span>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-6 space-y-6" style={{ marginTop: "calc(4rem + var(--safe-top, 0px))" }}>
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5">
          {[STEPS.CAPTURE, STEPS.PREVIEW, STEPS.EDIT, STEPS.QUIZ].map((s, i) => {
            const stepOrder = [STEPS.CAPTURE, STEPS.PREVIEW, STEPS.EDIT, STEPS.QUIZ];
            const currentIdx = stepOrder.indexOf(step);
            const isActive = i <= currentIdx;
            return (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  isActive ? "bg-primary w-8" : "bg-border w-4"
                }`}
              />
            );
          })}
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 animate-in fade-in slide-in-from-top-1 duration-300">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400 font-medium leading-snug">{error}</p>
          </div>
        )}

        {/* STEP: Capture */}
        {step === STEPS.CAPTURE && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="text-center space-y-2 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <ScanLine className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-xl font-bold">Scan Your Notes</h1>
              <p className="text-sm text-muted-foreground">
                Take a photo or upload an image of your study materials to generate quiz questions.
              </p>
            </div>

            {/* Camera button */}
            <button
              onClick={handleCameraClick}
              disabled={cameraLoading}
              className="w-full rounded-2xl border-2 border-dashed border-primary/30 bg-accent/40 hover:bg-accent/60 transition-all p-8 flex flex-col items-center text-center cursor-pointer group disabled:opacity-50"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                {cameraLoading ? (
                  <Loader2 className="w-7 h-7 text-primary animate-spin" />
                ) : (
                  <Camera className="w-7 h-7 text-primary" />
                )}
              </div>
              <p className="font-semibold text-foreground text-sm">{cameraLoading ? "Opening camera..." : "Take a Photo"}</p>
              <p className="text-xs text-muted-foreground mt-1">{cameraLoading ? "Please wait" : "Use your camera to scan notes"}</p>
            </button>

            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed border-border bg-card hover:bg-secondary/50 transition-all p-8 flex flex-col items-center text-center cursor-pointer group"
            >
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-7 h-7 text-muted-foreground" />
              </div>
              <p className="font-semibold text-foreground text-sm">Upload Image</p>
              <p className="text-xs text-muted-foreground mt-1">Select from your gallery</p>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />

            {/* Tips */}
            <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/30 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Tips for best results</span>
              </div>
              <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1 ml-6">
                <li>Use well-lit, clear images</li>
                <li>Hold camera steady and parallel</li>
                <li>Works with printed text, not handwriting</li>
              </ul>
            </div>
          </div>
        )}

        {/* STEP: Preview */}
        {step === STEPS.PREVIEW && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <h2 className="text-lg font-bold text-center">Preview Image</h2>
            {imagePreview && (
              <div className="rounded-2xl overflow-hidden border border-border bg-card">
                <img
                  src={imagePreview}
                  alt="Scanned"
                  className="w-full max-h-80 object-contain"
                />
              </div>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl"
                onClick={handleReset}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Retake
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl shadow-lg shadow-primary/25"
                onClick={handleScan}
              >
                <ScanLine className="w-4 h-4 mr-2" />
                Scan Text
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Scanning */}
        {step === STEPS.SCANNING && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
              <h2 className="text-lg font-bold">Scanning Text...</h2>
              <p className="text-sm text-muted-foreground">
                {ocrProgress < 30
                  ? "Loading OCR engine..."
                  : ocrProgress < 70
                  ? "Analyzing image..."
                  : "Recognizing text..."}
              </p>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
              <p className="text-center text-xs text-muted-foreground">{ocrProgress}%</p>
            </div>

            {imagePreview && (
              <div className="rounded-2xl overflow-hidden border border-border opacity-60">
                <img src={imagePreview} alt="Scanning" className="w-full max-h-48 object-contain" />
              </div>
            )}
          </div>
        )}

        {/* STEP: Edit extracted text */}
        {step === STEPS.EDIT && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Extracted Text</h2>
              <div className="flex items-center gap-2">
                {ocrSource && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 uppercase">
                    {ocrSource === "ai" ? "AI Vision" : "Local OCR"}
                  </span>
                )}
                {ocrConfidence > 0 && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    ocrConfidence >= 70
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : ocrConfidence >= 40
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  }`}>
                    {ocrConfidence}%
                  </span>
                )}
              </div>
            </div>

            <Textarea
              value={extractedText}
              onChange={(e) => setExtractedText(e.target.value)}
              className="min-h-[250px] rounded-xl text-sm font-mono resize-y"
              placeholder="Edit the scanned text here..."
            />

            <div className="rounded-xl bg-secondary/50 border border-border p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Tip:</strong> Edit the text to improve quiz accuracy. Remove extra lines, fix typos, or reformat as numbered questions (1. 2. 3.).
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl"
                onClick={() => setStep(STEPS.PREVIEW)}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Rescan
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl shadow-lg shadow-primary/25"
                onClick={handleParseQuestions}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Quiz
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Quiz preview */}
        {step === STEPS.QUIZ && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Generated Questions</h2>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                {questions.length} questions
              </span>
            </div>

            {/* Quiz metadata */}
            <div className="space-y-3">
              <Input
                value={quizTitle}
                onChange={(e) => setQuizTitle(e.target.value)}
                placeholder="Quiz title (e.g. Biology Midterm)"
                className="h-11 rounded-xl text-sm"
              />
              <Input
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="Course code (e.g. BIO101)"
                className="h-11 rounded-xl text-sm"
              />
            </div>

            {/* Questions list */}
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {questions.map((q, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-card p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                      Q{idx + 1} · {q.type === "mc" ? "MC" : q.type === "tf" ? "TF" : "ID"}
                    </span>
                    <button
                      onClick={() => deleteQuestion(idx)}
                      className="text-xs text-red-500 hover:text-red-700 shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="text-sm font-medium text-foreground">{q.question}</p>
                  {q.type === "mc" && q.options.length > 0 && (
                    <div className="space-y-1">
                      {q.options.map((opt, oi) => (
                        <div
                          key={oi}
                          className={`text-xs px-2.5 py-1.5 rounded-lg ${
                            oi === q.correct
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {String.fromCharCode(65 + oi)}) {opt}
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type === "id" && q.correct && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      Answer: {q.correct}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Edit text link */}
            <button
              onClick={() => setStep(STEPS.EDIT)}
              className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
            >
              <Edit3 className="w-3 h-3" />
              Edit extracted text
            </button>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12 rounded-xl"
                onClick={handleReset}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Start Over
              </Button>
              <Button
                className="flex-1 h-12 rounded-xl shadow-lg shadow-primary/25"
                onClick={handleSaveQuiz}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                )}
                Save Quiz
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Done */}
        {step === STEPS.DONE && (
          <div className="text-center space-y-4 py-8 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold">Quiz Created!</h2>
            <p className="text-sm text-muted-foreground">
              {questions.length} questions saved. Redirecting to your quizzes...
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
