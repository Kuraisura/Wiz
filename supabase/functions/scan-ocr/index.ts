// ---------------------------------------------------------------------------
// scan-ocr Edge Function — Server-side OCR via ocr.space (free, no key)
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();

    if (!image) {
      throw new Error("No image provided");
    }

    // Strip data URL prefix if present
    const base64 = image.includes("base64,") ? image.split("base64,")[1] : image;

    if (!base64 || base64.length < 100) {
      throw new Error("Invalid image data");
    }

    console.log("[scan-ocr] Processing image, base64 length:", base64.length);

    // Call ocr.space free API
    const formData = new URLSearchParams();
    formData.append("base64Image", `data:image/png;base64,${base64}`);
    formData.append("language", "eng");
    formData.append("isOverlayRequired", "false");
    formData.append("OCREngine", "2"); // Engine 2 is better for typed text

    const ocrResponse = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        apikey: "K85589584388957", // Free tier key (rate limited, OK for demo)
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    if (!ocrResponse.ok) {
      const errText = await ocrResponse.text();
      console.error("[scan-ocr] ocr.space error:", ocrResponse.status, errText);
      throw new Error(`OCR service error: ${ocrResponse.status}`);
    }

    const ocrResult = await ocrResponse.json();

    if (ocrResult.IsErroredOnProcessing) {
      const errMsg = ocrResult.ErrorMessage?.join(", ") || "OCR processing failed";
      console.error("[scan-ocr] Processing error:", errMsg);
      throw new Error(errMsg);
    }

    const parsed = ocrResult.ParsedResults?.[0];
    const text = parsed?.ParsedText || "";
    const confidence = parsed?.FileParseExitCode === 1 ? 85 : 50;

    console.log("[scan-ocr] Done:", text.length, "chars,", confidence, "% confidence");

    return new Response(
      JSON.stringify({
        text: text.trim(),
        confidence,
        source: "ocr-space",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[scan-ocr] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
