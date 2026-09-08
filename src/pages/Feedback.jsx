import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Loader2, CheckCircle2, MessageSquare, Image, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/supabaseClient";

const MAX_CHARS = 500;
const MAX_SUBJECT = 30;

const PROFANITY_PATTERNS = [
  // Filipino/Tagalog
  /tang\s*ina/i, /potang\s*ina/i, /putang\s*ina/i, /putangina/i,
  /\bpota\b/i, /\bgago\b/i, /\bgagoo\b/i, /\bgagu\b/i,
  /\btangaa\b/i, /tang\s*namo/i, /\bbobo\b/i, /\bboboo\b/i,
  /\bleche\b/i, /\bpletche\b/i, /\blelse\b/i,
  /\bpakshet\b/i, /\bpakshit\b/i, /\bpakyu\b/i, /\bpakyew\b/i,
  /\bulo[l]+\b/i, /\btarantado\b/i,
  /\bhayop\b/i, /\bhayupp\b/i,
  /\bpunyeta\b/i, /\bpunyetang\b/i,
  /\bkupal\b/i, /\bkupalmoo\b/i,
  /\bshuta\b/i, /shutangina/i,
  /anak\s*ng\s*puta/i, /anakputa/i,
  /\bdemonyo\b/i, /sira\s*ulo/i, /\bsiraulong\b/i,
  /\bbuang\b/i, /\bbaliw\b/i,
  /\bwalanghiya\b/i, /\blinta\b/i, /\blintik\b/i,
  /\byawa\b/i, /\bampota\b/i, /\bampotang\b/i,
  /\bgunggong\b/i, /\bunggong\b/i,
  /\bbwesit\b/i, /\bbwisit\b/i,
  // English
  /\bfu[c]+k/i, /\bfu[c]+k+/i, /\bfuk+/i, /\bfck+/i,
  /\bsh[i1]t/i, /\bsht\b/i,
  /\bb[i1]tch/i, /\bb1tch/i,
  /\ba[s]+h[o0]le/i, /\ba[s]+whole/i,
  /\bd[i1]ck/i, /\bc[o0]ck/i,
  /\bpuss[iy]+/i, /\bwh[o0]re/i, /\bsl[u]t/i,
  /\bn[i1]gg[e]?r/i, /\bn[i1]gg[a]/i,
  /\br[e3]t[a4]rd/i, /\bid[i1]o[t]+/i,
  /\bm[o0]r[o0]n/i, /\bstu[p]+id/i,
  /\bd[u]mb/i, /\bd[u]mbass/i,
  /\bl[o0]s[e]r/i, /\bh8\b/i, /\bstfu\b/i, /\bgtfo\b/i, /\bkys\b/i,
  // Spanish
  /\bputo\b/i, /\bputa\b/i, /\bpendejo/i, /\bcabron/i,
  /\bmierda\b/i, /\bchinga/i, /\bpinche\b/i, /\bimbecil/i,
  // Japanese
  /\bbaka\b/i, /\bkuso\b/i,
  // Korean
  /\bshibal\b/i, /\bsibal\b/i, /\bssibal\b/i,
  // Gibberish: 4+ repeated chars, or all same char
  /(.)\1{3,}/i,
  /^(\w)\1{2,}$/i,
  // Random键盘 smashing: consonant-heavy nonsense
  /^[bcdfghjklmnpqrstvwxyz]{4,}$/i,
  // Repeated word patterns
  /(\b\w+\b)\s+\1\s+\1/i,
];

function containsProfanity(text) {
  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

export default function Feedback() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [filterError, setFilterError] = useState("");

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Only image files are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }
    setAttachment(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAttachmentPreview(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachmentPreview(null);
  };

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) return;

    setFilterError("");

    if (containsProfanity(subject) || containsProfanity(message)) {
      setFilterError("Your feedback contains inappropriate language. Please keep your message respectful.");
      return;
    }

    setSending(true);
    try {
      let attachmentUrl = null;

      if (attachment) {
        setUploadingImage(true);
        const timestamp = Date.now();
        const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `feedback/${user?.id}/${timestamp}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("study-materials")
          .upload(filePath, attachment, { cacheControl: "3600", upsert: false });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("study-materials")
          .getPublicUrl(filePath);

        attachmentUrl = urlData?.publicUrl;
        setUploadingImage(false);
      }

      const { error } = await supabase.functions.invoke("send-feedback", {
        body: {
          userId: user?.id,
          userEmail: user?.email,
          userName: user?.user_metadata?.full_name || user?.email,
          subject: subject.trim(),
          message: message.trim(),
          attachmentUrl,
        },
      });
      if (error) throw error;
      setSending(false);
      setSent(true);
    } catch (err) {
      console.error(err);
      setSending(false);
      setUploadingImage(false);
      const msg = err?.message || "";
      if (msg.includes("inappropriate")) {
        setFilterError("Your feedback contains inappropriate language. Please keep your message respectful.");
      } else {
        alert("Failed to send feedback. Please try again.");
      }
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="fixed top-0 left-0 right-0 z-30 bg-background border-b border-border" style={{ paddingTop: "var(--safe-top)" }}>
          <div className="max-w-md mx-auto px-5 h-16 flex items-center justify-center relative">
            <span className="font-semibold text-foreground">Feedback</span>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-5" style={{ marginTop: "calc(4rem + var(--safe-top, 0px))" }}>
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Thank you!</h2>
              <p className="text-sm text-muted-foreground mt-1">Your feedback has been sent. We'll get back to you soon.</p>
            </div>
            <Button
              onClick={() => navigate("/")}
              className="rounded-xl px-6"
            >
              Back to Home
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const charsLeft = MAX_CHARS - message.length;
  const isOverLimit = charsLeft < 0;
  const subjectCharsLeft = MAX_SUBJECT - subject.length;

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-30 bg-background border-b border-border" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="max-w-md mx-auto px-5 h-16 flex items-center justify-between relative">
          <button
            onClick={() => navigate("/")}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-foreground">Feedback</span>
          <div className="w-9" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 py-6 space-y-6" style={{ marginTop: "calc(4rem + var(--safe-top, 0px))" }}>
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <MessageSquare className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Send Feedback</h1>
          <p className="text-sm text-muted-foreground">Report bugs, suggest features, or share concerns.</p>
        </div>

        {filterError && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/30 p-3 text-center">
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">{filterError}</p>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Subject</label>
              <span className={`text-xs font-medium ${subjectCharsLeft < 0 ? "text-red-500" : subjectCharsLeft < 5 ? "text-amber-500" : "text-muted-foreground"}`}>
                {subjectCharsLeft} chars left
              </span>
            </div>
            <Input
              value={subject}
              onChange={(e) => {
                if (e.target.value.length <= MAX_SUBJECT + 5) {
                  setSubject(e.target.value);
                  setFilterError("");
                }
              }}
              placeholder="Bug report, feature request, etc."
              className="h-11 rounded-xl text-sm"
              maxLength={MAX_SUBJECT + 5}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Message</label>
              <span className={`text-xs font-medium ${isOverLimit ? "text-red-500" : charsLeft < 50 ? "text-amber-500" : "text-muted-foreground"}`}>
                {charsLeft} chars left
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => {
                if (e.target.value.length <= MAX_CHARS + 20) {
                  setMessage(e.target.value);
                  setFilterError("");
                }
              }}
              placeholder="Describe your feedback..."
              rows={5}
              className={`w-full rounded-xl bg-secondary border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:bg-card transition-colors resize-none ${
                isOverLimit ? "border-red-500 focus:ring-red-500/30" : "border-transparent focus:ring-primary/30"
              }`}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Screenshot (optional)</label>
            {attachmentPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img
                  src={attachmentPreview}
                  alt="Attachment"
                  className="w-full max-h-48 object-cover"
                />
                <button
                  onClick={removeAttachment}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full h-24 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              >
                <Image className="w-6 h-6" />
                <span className="text-xs font-medium">Tap to attach image</span>
                <span className="text-[10px] text-muted-foreground/70">PNG, JPG up to 5MB</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
          </div>

          <Button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !message.trim() || isOverLimit || subjectCharsLeft < 0}
            className="w-full h-12 rounded-2xl text-base font-semibold"
          >
            {sending ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> {uploadingImage ? "Uploading..." : "Sending..."}</>
            ) : (
              <><Send className="w-5 h-5 mr-2" /> Send Feedback</>
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
