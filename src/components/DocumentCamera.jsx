// ---------------------------------------------------------------------------
// DocumentCamera.jsx — Clean scanner-style camera with document detection
// ---------------------------------------------------------------------------

import React, { useRef, useState, useEffect, useCallback } from "react";
import { X, Camera, RotateCcw, Zap, ZapOff, Sun } from "lucide-react";

function analyzeFrame(canvas, ctx) {
  const { width, height } = canvas;
  if (width === 0 || height === 0) return { isDocument: false, confidence: 0, reason: "No frame" };

  const sampleW = Math.min(width, 320);
  const sampleH = Math.round((sampleW / width) * height);
  canvas.width = sampleW;
  canvas.height = sampleH;
  ctx.drawImage(canvas, 0, 0, sampleW, sampleH);

  const imageData = ctx.getImageData(0, 0, sampleW, sampleH);
  const data = imageData.data;

  let edgeCount = 0, darkPixels = 0, lightPixels = 0, totalPixels = 0;

  for (let y = 2; y < sampleH - 2; y += 2) {
    for (let x = 2; x < sampleW - 2; x += 2) {
      const idx = (y * sampleW + x) * 4;
      const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;

      if (gray < 80) darkPixels++;
      else if (gray > 200) lightPixels++;
      totalPixels++;

      const gL = data[(y * sampleW + (x - 1)) * 4] * 0.299 + data[(y * sampleW + (x - 1)) * 4 + 1] * 0.587 + data[(y * sampleW + (x - 1)) * 4 + 2] * 0.114;
      const gR = data[(y * sampleW + (x + 1)) * 4] * 0.299 + data[(y * sampleW + (x + 1)) * 4 + 1] * 0.587 + data[(y * sampleW + (x + 1)) * 4 + 2] * 0.114;
      const gU = data[((y - 1) * sampleW + x) * 4] * 0.299 + data[((y - 1) * sampleW + x) * 4 + 1] * 0.587 + data[((y - 1) * sampleW + x) * 4 + 2] * 0.114;
      const gD = data[((y + 1) * sampleW + x) * 4] * 0.299 + data[((y + 1) * sampleW + x) * 4 + 1] * 0.587 + data[((y + 1) * sampleW + x) * 4 + 2] * 0.114;

      const mag = Math.sqrt((gR - gL) ** 2 + (gD - gU) ** 2);
      if (mag > 25) edgeCount++;
    }
  }

  const edgeRatio = totalPixels > 0 ? edgeCount / totalPixels : 0;
  const darkRatio = totalPixels > 0 ? darkPixels / totalPixels : 0;
  const lightRatio = totalPixels > 0 ? lightPixels / totalPixels : 0;

  let score = 0;
  let reason = "";

  if (edgeRatio >= 0.04 && edgeRatio <= 0.35) score += 35;
  else if (edgeRatio < 0.02) reason = "Point at text";
  else reason = "Too complex";

  if (lightRatio > 0.15) score += 30;
  else reason = reason || "Needs more light";

  if (darkRatio > 0.01 && darkRatio < 0.45) score += 35;
  else if (darkRatio < 0.01) reason = reason || "No text visible";
  else reason = reason || "Too dark";

  const confidence = Math.min(100, score);
  return { isDocument: confidence >= 45, confidence, reason: confidence >= 45 ? "Ready to scan" : reason };
}

export default function DocumentCamera({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [detection, setDetection] = useState({ isDocument: false, confidence: 0, reason: "Starting camera..." });
  const [facing, setFacing] = useState("environment");

  const start = useCallback(async (facingMode) => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode || facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    } catch (e) {
      console.error("[Camera]", e);
      setDetection({ isDocument: false, confidence: 0, reason: "Camera unavailable" });
    }
  }, [facing]);

  useEffect(() => { start(); return () => { streamRef.current?.getTracks().forEach(t => t.stop()); animRef.current && cancelAnimationFrame(animRef.current); }; }, []);

  useEffect(() => {
    if (!ready) return;
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    let last = 0;

    const loop = (ts) => {
      if (ts - last > 400 && v.readyState >= 2) {
        c.width = v.videoWidth; c.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        setDetection(analyzeFrame(c, ctx));
        last = ts;
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => animRef.current && cancelAnimationFrame(animRef.current);
  }, [ready]);

  const capture = useCallback(() => {
    if (!detection.isDocument) return;
    const v = videoRef.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    streamRef.current?.getTracks().forEach(t => t.stop());
    onCapture(c.toDataURL("image/jpeg", 0.95));
  }, [detection, onCapture]);

  const flip = useCallback(() => {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    setReady(false);
    start(next);
  }, [facing, start]);

  const green = detection.isDocument;

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[calc(var(--safe-top,0px)+12px)] pb-3 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
          <X className="w-5 h-5 text-white" />
        </button>
        <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold ${green ? "bg-emerald-500/90 text-white" : "bg-white/10 text-white/70"}`}>
          <div className={`w-2 h-2 rounded-full ${green ? "bg-white animate-pulse" : "bg-white/40"}`} />
          {green ? "Document found" : detection.reason}
        </div>
        <button onClick={flip} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
          <RotateCcw className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Camera viewfinder */}
      <div className="flex-1 relative overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scanner frame overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top/bottom dim areas */}
          <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-black/50 to-transparent" />
          <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />

          {/* Scanner rectangle */}
          <div className="absolute inset-x-6 top-16 bottom-24">
            {/* Animated scan line */}
            {green && (
              <div className="absolute inset-x-0 top-0 bottom-0 overflow-hidden">
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-[scanLine_2s_ease-in-out_infinite]" />
              </div>
            )}

            {/* Corner brackets */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {/* Top-left */}
              <path d="M 5 20 L 5 5 L 20 5" fill="none" stroke={green ? "#22c55e" : "#ffffff80"} strokeWidth="1.5" strokeLinecap="round" />
              {/* Top-right */}
              <path d="M 80 5 L 95 5 L 95 20" fill="none" stroke={green ? "#22c55e" : "#ffffff80"} strokeWidth="1.5" strokeLinecap="round" />
              {/* Bottom-left */}
              <path d="M 5 80 L 5 95 L 20 95" fill="none" stroke={green ? "#22c55e" : "#ffffff80"} strokeWidth="1.5" strokeLinecap="round" />
              {/* Bottom-right */}
              <path d="M 80 95 L 95 95 L 95 80" fill="none" stroke={green ? "#22c55e" : "#ffffff80"} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 bg-black/90 backdrop-blur-sm px-6 pb-[calc(var(--safe-bottom,0px)+24px)] pt-5">
        {/* Confidence bar */}
        <div className="mb-4 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${green ? "bg-emerald-500" : "bg-white/30"}`}
            style={{ width: `${detection.confidence}%` }}
          />
        </div>

        <div className="flex items-center justify-center gap-10">
          {/* Hint text */}
          <div className="flex-1 text-center">
            <p className="text-[11px] text-white/50 leading-tight">
              {green ? "Tap capture below" : "Hold steady over document"}
            </p>
          </div>

          {/* Capture button */}
          <button
            onClick={capture}
            disabled={!green}
            className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center transition-transform active:scale-95"
          >
            {/* Outer ring */}
            <div className={`absolute inset-0 rounded-full border-[3px] transition-colors ${green ? "border-emerald-400" : "border-white/20"}`} />
            {/* Inner circle */}
            <div className={`w-[58px] h-[58px] rounded-full transition-colors ${green ? "bg-white" : "bg-white/10"}`} />
            {/* Camera icon */}
            <Camera className={`absolute w-6 h-6 transition-colors ${green ? "text-emerald-600" : "text-white/30"}`} />
          </button>

          <div className="flex-1" />
        </div>
      </div>

      <style>{`
        @keyframes scanLine {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(calc(100% - 2px)); }
        }
      `}</style>
    </div>
  );
}
