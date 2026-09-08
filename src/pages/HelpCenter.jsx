import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, HelpCircle, BookOpen, Zap, CreditCard, Shield, Star } from "lucide-react";

const FAQ_SECTIONS = [
  {
    title: "About Wiz",
    icon: BookOpen,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    items: [
      {
        q: "What is Wiz?",
        a: "Wiz is an AI-powered study companion that transforms your lecture notes, syllabi, PDFs, and course materials into interactive practice quizzes and flashcards. It uses advanced NLP and multiple AI backends to generate high-quality questions tailored to your content, helping you study smarter and ace your exams.",
      },
      {
        q: "How does Wiz generate quizzes?",
        a: "Wiz uses a multi-layer approach: first, a local extractive NLP engine analyzes your document for key terms, definitions, and relationships. Then, if you're on the Pro plan, it enhances questions using AI models (Groq, Gemini, Cerebras, OpenRouter) in a fallback chain. This means you get great quizzes even without AI, and even better ones with it.",
      },
      {
        q: "What file types can I upload?",
        a: "Wiz supports PDF (.pdf), Microsoft Word (.docx), Microsoft PowerPoint (.pptx), and EPUB (.epub) files. All processing happens in your browser — your files are never sent to a server for quiz generation.",
      },
      {
        q: "Is my data safe?",
        a: "Yes. Your documents are processed entirely in your browser and are never uploaded to our servers for AI processing. Files stored in your library are encrypted and only accessible by you. We use Supabase for secure authentication and data storage.",
      },
    ],
  },
  {
    title: "Quizzes & Flashcards",
    icon: Zap,
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    items: [
      {
        q: "What question types are available?",
        a: "Wiz supports Multiple Choice, True/False, Identification (fill-in-the-blank), Enumeration (list answers), and Matching questions. You can use any combination when creating quizzes manually.",
      },
      {
        q: "Can I customize my quiz?",
        a: "Absolutely. You can set the number of questions (10, 20, 30, or 50), choose a difficulty level (Warmup/Easy, Standard/Med, Exam Ready), shuffle questions, shuffle answers, and set a countdown timer (5, 10, 15, 20, or 30 minutes).",
      },
      {
        q: "What are flashcards?",
        a: "Flashcards are auto-generated study cards with front (question/term) and back (answer/definition). They support tap-to-flip, swipe navigation, and a confidence rating system (Again, Hard, Good, Easy) to help you track what you need to review more.",
      },
      {
        q: "Can I edit AI-generated quizzes?",
        a: "Yes. After generating a quiz, you can review and edit individual questions, change answers, add or remove questions, and adjust the quiz settings before saving.",
      },
    ],
  },
  {
    title: "Subscription & Payment",
    icon: CreditCard,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    items: [
      {
        q: "What's the difference between Free and Pro?",
        a: "Free plan gives you unlimited manual quiz creation, flashcard study, quiz timer, and progress tracking. Pro plan (₱279/month) adds AI quiz generation from documents, auto-flashcard creation, smart question analysis, and priority support.",
      },
      {
        q: "Is there a free trial?",
        a: "Yes! Pro plan comes with a 3-day free trial. You'll need to enter your GCash details, but you won't be charged anything until the trial ends. Cancel anytime during the trial to avoid charges.",
      },
      {
        q: "Can I cancel my subscription?",
        a: "Yes, you can cancel anytime from the Subscription page in your Profile. After cancellation, you'll keep Pro access until the end of your current billing period (or trial period). You'll then be moved to the Free plan.",
      },
      {
        q: "Can I get a refund?",
        a: "We offer refunds within 7 days of purchase if you haven't used Pro features significantly. Contact us through the Send Feedback option in your Profile settings, and we'll process your request promptly. After 7 days, refunds are handled on a case-by-case basis.",
      },
      {
        q: "How do I pay?",
        a: "We use PayMongo for secure payments. You can pay using GCash — simply tap Subscribe or Start Free Trial, and you'll be redirected to the GCash payment page. All payment processing is handled securely by PayMongo.",
      },
    ],
  },
  {
    title: "Account & Support",
    icon: Shield,
    color: "text-purple-600",
    bg: "bg-purple-50 dark:bg-purple-950/30",
    items: [
      {
        q: "How do I create an account?",
        a: "You can sign up using your GitHub account. Just tap Sign In on the login page, select GitHub, and authorize the app. Your account is created automatically with your GitHub profile information.",
      },
      {
        q: "How do I reset my password?",
        a: "Since Wiz uses GitHub OAuth, your password is managed by GitHub. You can change it directly in your GitHub account settings. If you have any issues, use the Send Feedback option to contact us.",
      },
      {
        q: "How do I contact support?",
        a: "Go to Profile > Send Feedback to send us a message directly from the app. We typically respond within 24 hours on business days.",
      },
      {
        q: "Can I use Wiz on mobile?",
        a: "Yes! Wiz is a Progressive Web App (PWA) that works great on mobile browsers. You can add it to your home screen for a native app experience. A native Android app is also coming soon.",
      },
    ],
  },
];

function FAQItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        <HelpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <span className="flex-1 text-sm font-medium text-foreground">{item.q}</span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pl-11">
          <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
        </div>
      )}
    </div>
  );
}

export default function HelpCenter() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-30 bg-background border-b border-border" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="max-w-md mx-auto px-5 h-16 flex items-center justify-between relative">
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-foreground">Help Center</span>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-6 space-y-6" style={{ marginTop: "calc(4rem + var(--safe-top, 0px))" }}>
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <BookOpen className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">How can we help?</h1>
          <p className="text-sm text-muted-foreground">Browse frequently asked questions below</p>
        </div>

        {FAQ_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.title} className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl ${section.bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${section.color}`} />
                </div>
                <h2 className="text-sm font-bold text-foreground">{section.title}</h2>
              </div>
              <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
                {section.items.map((item, i) => (
                  <FAQItem key={i} item={item} />
                ))}
              </div>
            </div>
          );
        })}

        <div className="text-center py-4 space-y-1">
          <p className="text-xs text-muted-foreground">Still have questions?</p>
          <button
            onClick={() => navigate("/feedback")}
            className="text-sm text-primary font-semibold hover:underline"
          >
            Send us feedback
          </button>
        </div>
      </main>
    </div>
  );
}
