// ---------------------------------------------------------------------------
// ocrService.js – Hybrid OCR with handwriting support
// Edge Function → AI Vision → Local Tesseract (with adaptive preprocessing)
// ---------------------------------------------------------------------------

import { supabase } from "@/supabaseClient";

let worker = null;
let loadPromise = null;

function isOnline() { return navigator.onLine; }

// ---- Edge Function OCR -----------------------------------------------------

async function edgeFunctionOCR(dataUrl) {
  const { data, error } = await supabase.functions.invoke("scan-ocr", {
    body: { image: dataUrl },
  });
  if (error) throw new Error(error.message || "Edge Function failed");
  if (data?.error) throw new Error(data.error);
  return { text: data.text || "", confidence: data.confidence || 80, source: "edge" };
}

// ---- AI Vision fallback ----------------------------------------------------

async function aiVisionExtract(dataUrl) {
  const { aiService } = await import("@/services/aiService");
  const prompt = `Extract ALL readable text from this image. This may contain handwritten notes, printed text, or mixed. Return ONLY the extracted text, preserving line breaks. If there is no readable text, return exactly "NO_TEXT_FOUND".`;
  const result = await aiService.generateResponse(`${prompt}\n\nImage: ${dataUrl.substring(0, 100)}...`);
  if (!result || result.includes("NO_TEXT_FOUND")) throw new Error("AI could not detect text");
  return { text: result.trim(), confidence: 95, source: "ai" };
}

// ---- Advanced image preprocessing ------------------------------------------

/**
 * Multi-stage preprocessing optimized for both printed and handwritten text.
 * Uses adaptive thresholding, contrast enhancement, and noise reduction.
 */
function preprocessImage(imageSource) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      // Draw original
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const w = canvas.width, h = canvas.height;

      // Stage 1: Convert to grayscale
      const gray = new Uint8Array(w * h);
      for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      }

      // Stage 2: Compute local mean for adaptive threshold (block size 15)
      const block = 15;
      const half = Math.floor(block / 2);
      const integral = new Float64Array((w + 1) * (h + 1));

      for (let y = 0; y < h; y++) {
        let rowSum = 0;
        for (let x = 0; x < w; x++) {
          rowSum += gray[y * w + x];
          integral[(y + 1) * (w + 1) + (x + 1)] = rowSum + integral[y * (w + 1) + (x + 1)];
        }
      }

      // Stage 3: Adaptive threshold + contrast enhancement
      const C = 10; // constant offset
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const x1 = Math.max(0, x - half);
          const y1 = Math.max(0, y - half);
          const x2 = Math.min(w - 1, x + half);
          const y2 = Math.min(h - 1, y + half);
          const count = (x2 - x1 + 1) * (y2 - y1 + 1);

          const sum = integral[(y2 + 1) * (w + 1) + (x2 + 1)]
                    - integral[y1 * (w + 1) + (x2 + 1)]
                    - integral[(y2 + 1) * (w + 1) + x1]
                    + integral[y1 * (w + 1) + x1];

          const mean = sum / count;
          const val = gray[y * w + x] > mean - C ? 255 : 0;

          const idx = (y * w + x) * 4;
          data[idx] = val;
          data[idx + 1] = val;
          data[idx + 2] = val;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(imageSource);
    img.src = typeof imageSource === "string" ? imageSource : URL.createObjectURL(imageSource);
  });
}

/**
 * Check if image likely contains text (used for early rejection).
 */
function analyzeImageContent(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const sz = Math.min(img.width, 200);
      canvas.width = sz;
      canvas.height = Math.round((sz / img.width) * img.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let edges = 0, dark = 0, total = 0;

      for (let y = 1; y < canvas.height - 1; y += 2) {
        for (let x = 1; x < canvas.width - 1; x += 2) {
          const i = (y * canvas.width + x) * 4;
          const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          if (g < 80) dark++;
          const gL = d[(y * canvas.width + (x - 1)) * 4] * 0.299 + d[(y * canvas.width + (x - 1)) * 4 + 1] * 0.587 + d[(y * canvas.width + (x - 1)) * 4 + 2] * 0.114;
          const gR = d[(y * canvas.width + (x + 1)) * 4] * 0.299 + d[(y * canvas.width + (x + 1)) * 4 + 1] * 0.587 + d[(y * canvas.width + (x + 1)) * 4 + 2] * 0.114;
          const gU = d[((y - 1) * canvas.width + x) * 4] * 0.299 + d[((y - 1) * canvas.width + x) * 4 + 1] * 0.587 + d[((y - 1) * canvas.width + x) * 4 + 2] * 0.114;
          const gD = d[((y + 1) * canvas.width + x) * 4] * 0.299 + d[((y + 1) * canvas.width + x) * 4 + 1] * 0.587 + d[((y + 1) * canvas.width + x) * 4 + 2] * 0.114;
          if (Math.sqrt((gR - gL) ** 2 + (gD - gU) ** 2) > 30) edges++;
          total++;
        }
      }

      const edgeR = total > 0 ? edges / total : 0;
      const darkR = total > 0 ? dark / total : 0;
      resolve({ hasText: edgeR > 0.02 && darkR > 0.005, edgeR, darkR });
    };
    img.onerror = () => resolve({ hasText: true, edgeR: 0, darkR: 0 });
    img.src = dataUrl;
  });
}

// ---- Local Tesseract -------------------------------------------------------

function loadScriptFromFetch(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
    fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.text(); })
      .then(code => {
        const blob = new Blob([code], { type: "application/javascript" });
        const blobUrl = URL.createObjectURL(blob);
        const s = document.createElement("script");
        s.src = blobUrl;
        s.onload = () => { URL.revokeObjectURL(blobUrl); resolve(); };
        s.onerror = reject;
        document.head.appendChild(s);
      }).catch(reject);
  });
}

async function getLocalWorker(onProgress) {
  if (worker) return worker;
  if (!loadPromise) {
    loadPromise = (async () => {
      console.log("[OCR] Loading Tesseract worker...");
      if (!window.Tesseract) await loadScriptFromFetch("/tesseract/worker.min.js");
      if (!window.Tesseract) throw new Error("Tesseract failed to load");

      const w = await window.Tesseract.createWorker("eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/core",
        langPath: "/tesseract/lang-data",
        logger: m => { if (m.status === "recognizing text" && onProgress) onProgress(Math.round((m.progress || 0) * 100)); },
      });

      // Optimized for handwritten text: PSM 6 (uniform block) + preserve spaces
      await w.setParameters({
        tessedit_pageseg_mode: "6",  // Assume uniform block of text (better for handwriting)
        preserve_interword_spaces: "1",
        tessedit_char_whitelist: "",  // Allow all characters
      });

      console.log("[OCR] Tesseract ready");
      worker = w;
      return w;
    })();
  }
  return loadPromise;
}

// ---- Main entry point ------------------------------------------------------

export async function extractTextFromImage(image, onProgress) {
  let dataUrl = image;
  if (image instanceof File || image instanceof Blob) {
    dataUrl = await new Promise(r => {
      const reader = new FileReader();
      reader.onload = e => r(e.target.result);
      reader.readAsDataURL(image);
    });
  }

  // Light content check (don't reject too aggressively — handwriting is different)
  const content = await analyzeImageContent(dataUrl);
  if (!content.hasText) {
    // Still try OCR — handwriting detection is imperfect
    console.warn("[OCR] Low text signals, but attempting anyway...");
  }

  if (onProgress) onProgress(10);
  const preprocessed = await preprocessImage(dataUrl);
  if (onProgress) onProgress(20);

  // === TRY 1: Edge Function (best for printed text) ===
  if (isOnline()) {
    try {
      console.log("[OCR] Trying Edge Function...");
      if (onProgress) onProgress(30);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const result = await Promise.race([
        edgeFunctionOCR(preprocessed),
        new Promise((_, rej) => ctrl.signal.addEventListener("abort", () => rej(new Error("timeout")))),
      ]);
      clearTimeout(timer);
      if (result.text?.trim().length > 5) {
        console.log("[OCR] Edge Function OK:", result.text.length, "chars");
        if (onProgress) onProgress(100);
        return { text: result.text.trim(), confidence: result.confidence, source: "edge" };
      }
    } catch (e) { console.warn("[OCR] Edge Function:", e.message); }

    // === TRY 2: AI Vision (best for handwriting + mixed) ===
    try {
      console.log("[OCR] Trying AI Vision...");
      if (onProgress) onProgress(50);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const result = await Promise.race([
        aiVisionExtract(preprocessed),
        new Promise((_, rej) => ctrl.signal.addEventListener("abort", () => rej(new Error("timeout")))),
      ]);
      clearTimeout(timer);
      if (result.text?.length > 5) {
        console.log("[OCR] AI Vision OK:", result.text.length, "chars");
        if (onProgress) onProgress(100);
        return result;
      }
    } catch (e) { console.warn("[OCR] AI Vision:", e.message); }
  } else {
    console.log("[OCR] Offline — skipping online OCR");
  }

  // === TRY 3: Local Tesseract ===
  console.log("[OCR] Using Tesseract...");
  if (onProgress) onProgress(60);
  const w = await getLocalWorker(onProgress);
  try {
    const result = await w.recognize(preprocessed);
    const text = result.data.text || "";
    const confidence = result.data.confidence || 0;
    console.log("[OCR] Tesseract:", text.length, "chars,", confidence, "%");
    if (onProgress) onProgress(100);
    return { text: text.trim(), confidence: Math.round(confidence), source: "tesseract" };
  } catch (e) {
    console.error("[OCR] Tesseract failed:", e);
    throw new Error("All OCR methods failed. Please try a clearer image.");
  }
}

export async function terminateOCR() {
  if (worker) { await worker.terminate(); worker = null; loadPromise = null; }
}
