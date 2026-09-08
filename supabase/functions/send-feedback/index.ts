import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- Profanity Filter ---
const PROFANITY_LIST = [
  // Filipino/Tagalog
  "tangina", "tang ina", "potangina", "potang ina", "potanginaa", "pota", "putangina", "putang ina",
  "putanginang", "putanginamoo", "putanginamo", "gago", "gagoo", "gagu", "gagang",
  "tanga", "tangaa", "tangnamo", "tangnamoo", "bobo", "boboo", "bobs",
  "leche", "letche", "letse", "lchi",
  "pakshet", "pakshit", "pakyu", "pakyew", "pake", "pekpek",
  "bobita", "babitaaa", "bobo", "ulol", "ulool", "ulul",
  "tarantado", "tarantadong", "tadong",
  "hayop", "hayop ka", "hayupp", "haynaku",
  "punyeta", "punyetang", "pinaka",
  "kupal", "kupalmoo", "kupal ka",
  "tete", "pepe", "kiki",
  "shuta", "shutanginang", "shutangina",
  "annakputa", "anak ng puta", "anakputang",
  "demonyo", "demonyo ka",
  "siraULONG", "sira ulo", "siraulong",
  "buang", "buing", "baliw",
  "walanghiya", "walanghiyaaa",
  "linta", "lintik",
  "yawa", "yawa ka",
  "ampota", "ampotang", "amputa",
  "nengoy", "neng",
  "gunggong", "gonggong",
  "obob", "unggong",
  "tungaw", "atrasado",
  "bwesit", "bwisit", "puryahan",
  "chaka", "chakang",
  "lodid", "lodi",
  "petmalu", "werpa",
  "skl", "sanaol",

  // English
  "fuck", "fck", "fuk", "fckk", "fuc", "fucc", "fukk",
  "shit", "shyt", "sh1t", "sht",
  "bitch", "b1tch", "bicth",
  "ass", "asshole", "aswhole",
  "damn", "damnit",
  "crap", "cr@p",
  "dick", "d1ck",
  "bastard", "basterd",
  "cock", "c0ck",
  "pussy", "pusyy",
  "whore", "wh0re",
  "slut", "slutt",
  "nigger", "n1gger", "nigga", "n1gga",
  "retard", "retarded",
  "idiot", "idi0t",
  "moron", "moron",
  "stupid", "stuipd",
  "dumb", "dumbass",
  "loser", "lozer",
  "hate", "h8",
  "kill", "k1ll",
  "die", "d1e",
  "ugly", "ugli",

  // Spanish
  "puto", "puta", "pendejo", "pendeja", "cabron", "cabrona",
  "mierda", "chinga", "chingas", "pinche",
  "estupido", "estupida", "imbecil",

  // Japanese
  "baka", "kuso", "shimatta",

  // Korean
  "shibal", "sibal", "ssibal", "씨발", "개새끼", "병신",

  // Arabic
  "kalb", "ibn kalb",

  // Common bypass patterns
  "fk yu", "fuk yu", "fck you", "fuq you", "fukk you",
  "stfu", "gtfo", "kys",
];

// Gibberish detection: repeated characters (3+ of same char in a row)
const GIBBERISH_PATTERNS = [
  /(.)\1{2,}/g,           // "aaa", "zzzz", "111"
  /^[a-z]{1,2}$/i,        // single or double char
  /^(\w)\1+$/i,           // all same chars: "aaaaa"
];

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[\s\-_.!@#$%^&*()+=\[\]{}|\\:;"'<>?,/`~]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
    .replace(/!/g, "i")
    .replace(/\+/g, "t");
}

function containsProfanity(text) {
  const normalized = normalizeText(text);

  // Check gibberish patterns
  for (const pattern of GIBBERISH_PATTERNS) {
    if (pattern.test(normalized) && normalized.length <= 4) {
      return { match: true, word: "(gibberish)" };
    }
  }

  // Check each profanity word
  for (const word of PROFANITY_LIST) {
    const cleanWord = normalizeText(word);
    if (normalized.includes(cleanWord)) {
      return { match: true, word };
    }
  }

  // Check for evasion: consonant clusters that don't form real words
  // Simple heuristic: if text has 4+ repeated consonant patterns
  const repeated = normalized.match(/([^aeiou])\1{2,}/g);
  if (repeated && repeated.length > 1) {
    return { match: true, word: "(suspicious pattern)" };
  }

  return { match: false };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, userEmail, userName, subject, message, attachmentUrl } = await req.json();

    if (!subject || !message) {
      throw new Error("Missing required fields: subject, message");
    }

    if (subject.length > 30) {
      throw new Error("Subject must be 30 characters or less");
    }

    if (message.length > 500) {
      throw new Error("Message must be 500 characters or less");
    }

    // Filter subject and message for profanity
    const subjectCheck = containsProfanity(subject);
    const messageCheck = containsProfanity(message);

    if (subjectCheck.match || messageCheck.match) {
      return new Response(
        JSON.stringify({
          error: "inappropriate_content",
          message: "Your feedback contains inappropriate language. Please keep your message respectful.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    // Extract client info from headers
    const forwarded = req.headers.get("x-forwarded-for");
    const realIp = req.headers.get("x-real-ip");
    const cfIp = req.headers.get("cf-connecting-ip");
    const ip = cfIp || realIp || (forwarded ? forwarded.split(",")[0].trim() : "Unknown");

    const userAgent = req.headers.get("user-agent") || "Unknown";
    const acceptLang = req.headers.get("accept-language") || "Unknown";

    let deviceType = "Desktop";
    const ua = userAgent.toLowerCase();
    if (/mobile|android|iphone|ipad/.test(ua)) {
      deviceType = /ipad/.test(ua) ? "Tablet" : "Mobile";
    }

    let browser = "Unknown";
    if (/chrome/.test(ua) && !/edg/.test(ua)) browser = "Chrome";
    else if (/firefox/.test(ua)) browser = "Firefox";
    else if (/safari/.test(ua) && !/chrome/.test(ua)) browser = "Safari";
    else if (/edg/.test(ua)) browser = "Edge";

    let os = "Unknown";
    if (/windows/.test(ua)) os = "Windows";
    else if (/mac os/.test(ua)) os = "macOS";
    else if (/linux/.test(ua)) os = "Linux";
    else if (/android/.test(ua)) os = "Android";
    else if (/iphone|ipad/.test(ua)) os = "iOS";

    let city = "Unknown";
    let country = "Unknown";
    try {
      const geoRes = await fetch(`https://ipapi.co/${ip}/json/`);
      if (geoRes.ok) {
        const geo = await geoRes.json();
        if (geo.city) city = geo.city;
        if (geo.country_name) country = geo.country_name;
      }
    } catch {}

    const now = new Date();
    const timestamp = now.toLocaleString("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const attachmentSection = attachmentUrl ? `
      <div style="padding: 20px 28px; border-bottom: 1px solid #f1f5f9;">
        <div style="display: inline-block; background: #f1f5f9; border-radius: 8px; padding: 4px 10px; margin-bottom: 10px;">
          <span style="font-size: 11px; font-weight: 600; color: #10b981; text-transform: uppercase; letter-spacing: 0.05em;">Screenshot</span>
        </div>
        <div>
          <img src="${escapeHtml(attachmentUrl)}" alt="User attachment" style="max-width: 100%; border-radius: 12px; border: 1px solid #e2e8f0;" />
        </div>
      </div>
    ` : "";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 520px; margin: 0 auto; padding: 32px 16px;">
          <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%); border-radius: 20px 20px 0 0; padding: 32px 28px 24px; text-align: center;">
            <div style="width: 56px; height: 56px; background: rgba(255,255,255,0.2); border-radius: 14px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M16 2L4 8v8c0 7.2 5.12 13.92 12 16 6.88-2.08 12-8.8 12-16V8L16 2z" fill="white" fill-opacity="0.9"/><path d="M12 16l3 3 5-6" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700;">New Feedback Received</h1>
            <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 13px;">from Wiz Study Companion</p>
          </div>
          <div style="background: #ffffff; border-radius: 0 0 20px 20px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
            <div style="padding: 24px 28px 20px; border-bottom: 1px solid #f1f5f9;">
              <div style="display: inline-block; background: #f1f5f9; border-radius: 8px; padding: 4px 10px; margin-bottom: 10px;"><span style="font-size: 11px; font-weight: 600; color: #6366f1; text-transform: uppercase; letter-spacing: 0.05em;">Subject</span></div>
              <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">${escapeHtml(subject)}</h2>
            </div>
            <div style="padding: 20px 28px; border-bottom: 1px solid #f1f5f9;">
              <div style="display: inline-block; background: #f1f5f9; border-radius: 8px; padding: 4px 10px; margin-bottom: 10px;"><span style="font-size: 11px; font-weight: 600; color: #8b5cf6; text-transform: uppercase; letter-spacing: 0.05em;">Message</span></div>
              <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.7; white-space: pre-wrap;">${escapeHtml(message)}</p>
            </div>
            ${attachmentSection}
            <div style="padding: 20px 28px; border-bottom: 1px solid #f1f5f9;">
              <div style="display: inline-block; background: #f1f5f9; border-radius: 8px; padding: 4px 10px; margin-bottom: 12px;"><span style="font-size: 11px; font-weight: 600; color: #0ea5e9; text-transform: uppercase; letter-spacing: 0.05em;">User Info</span></div>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 4px 0; font-size: 12px; color: #94a3b8; width: 90px;">Name</td><td style="padding: 4px 0; font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHtml(userName || "Anonymous")}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 12px; color: #94a3b8;">Email</td><td style="padding: 4px 0; font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHtml(userEmail || "N/A")}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 12px; color: #94a3b8;">User ID</td><td style="padding: 4px 0; font-size: 11px; color: #64748b; font-family: monospace;">${escapeHtml(userId || "N/A")}</td></tr>
              </table>
            </div>
            <div style="padding: 20px 28px; border-bottom: 1px solid #f1f5f9;">
              <div style="display: inline-block; background: #f1f5f9; border-radius: 8px; padding: 4px 10px; margin-bottom: 12px;"><span style="font-size: 11px; font-weight: 600; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.05em;">Device & Location</span></div>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 4px 0; font-size: 12px; color: #94a3b8; width: 90px;">IP</td><td style="padding: 4px 0; font-size: 13px; color: #1e293b; font-weight: 500; font-family: monospace;">${escapeHtml(ip)}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 12px; color: #94a3b8;">Location</td><td style="padding: 4px 0; font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHtml(city)}, ${escapeHtml(country)}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 12px; color: #94a3b8;">Device</td><td style="padding: 4px 0; font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHtml(deviceType)} / ${escapeHtml(os)}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 12px; color: #94a3b8;">Browser</td><td style="padding: 4px 0; font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHtml(browser)}</td></tr>
                <tr><td style="padding: 4px 0; font-size: 12px; color: #94a3b8;">Language</td><td style="padding: 4px 0; font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHtml(acceptLang)}</td></tr>
              </table>
            </div>
            <div style="padding: 16px 28px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">${escapeHtml(timestamp)} (Philippine Time)</p>
            </div>
          </div>
          <div style="text-align: center; padding: 20px 0 0;">
            <p style="margin: 0; font-size: 11px; color: #475569;">Sent from <strong style="color: #6366f1;">Wiz</strong> &mdash; AI Study Companion</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Wiz Feedback <onboarding@resend.dev>",
        to: ["kuraisler.dev@gmail.com"],
        reply_to: userEmail || undefined,
        subject: `[Wiz Feedback] ${subject}`,
        html: htmlContent,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Resend error:", JSON.stringify(data));
      throw new Error(data.message || "Failed to send email");
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
