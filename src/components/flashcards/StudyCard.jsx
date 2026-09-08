import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Volume2, Bookmark, Lightbulb, Sparkles, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";

export default function StudyCard({ card, flipped, onFlip, onSpeak, onToggleStar, hint, swipeLeft, swipeRight, isShuffling }) {
  const [showHintAnim, setShowHintAnim] = useState(false);
  const isDragging = useRef(false);
  const dragStartTime = useRef(0);
  const isAnimating = useRef(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateZ = useTransform(x, [-300, 0, 300], [-12, 0, 12]);
  const rotateX = useTransform(y, [-300, 0, 300], [12, 0, -12]);
  const indicatorLeft = useTransform(x, [-200, 0], [1, 0]);
  const indicatorRight = useTransform(x, [0, 200], [0, 1]);
  const indicatorUp = useTransform(y, [-200, 0], [1, 0]);
  const indicatorDown = useTransform(y, [0, 200], [0, 1]);

  useEffect(() => {
    x.set(0);
    y.set(0);
  }, [card?.id, x, y]);

  useEffect(() => {
    if (hint) {
      setShowHintAnim(true);
      const timer = setTimeout(() => setShowHintAnim(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [hint]);

  const handleDragStart = useCallback(() => {
    isDragging.current = true;
    dragStartTime.current = Date.now();
  }, []);

  const handleDragEnd = useCallback((_, info) => {
    const elapsed = Date.now() - dragStartTime.current;
    const offsetX = info.offset.x;
    const offsetY = info.offset.y;
    const vx = info.velocity.x;
    const vy = info.velocity.y;
    const totalMovement = Math.abs(offsetX) + Math.abs(offsetY);

    // Determine dominant direction
    const isHorizontal = Math.abs(offsetX) >= Math.abs(offsetY);

    // Lower thresholds for easier swiping on mobile
    if (elapsed > 60 && totalMovement > 15) {
      if (isHorizontal && (Math.abs(offsetX) > 15 || Math.abs(vx) > 100)) {
        isAnimating.current = true;
        if (offsetX > 0) swipeRight?.();
        else swipeLeft?.();
        animate(x, 0, { duration: 0.3 });
        animate(y, 0, { duration: 0.3 });
        setTimeout(() => { isAnimating.current = false; }, 300);
      } else if (!isHorizontal && (Math.abs(offsetY) > 15 || Math.abs(vy) > 100)) {
        isAnimating.current = true;
        if (offsetY > 0) swipeRight?.();
        else swipeLeft?.();
        animate(x, 0, { duration: 0.3 });
        animate(y, 0, { duration: 0.3 });
        setTimeout(() => { isAnimating.current = false; }, 300);
      }
    }

    setTimeout(() => { isDragging.current = false; }, 50);
  }, [swipeLeft, swipeRight, x, y]);

  // Tap anywhere on the card always flips — no conditions
  const handlePointerUp = useCallback((e) => {
    if (isAnimating.current) return;
    // If it was a tap (not a drag), flip
    if (!isDragging.current) {
      isAnimating.current = true;
      onFlip?.();
      setTimeout(() => { isAnimating.current = false; }, 400);
    }
  }, [onFlip]);

  return (
    <div className="relative select-none" style={{ perspective: 1200 }}>
      <motion.div
        className="absolute -left-10 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10"
        style={{ opacity: indicatorLeft }}
      >
        <ChevronLeft className="w-5 h-5 text-primary" />
      </motion.div>
      <motion.div
        className="absolute -right-10 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10"
        style={{ opacity: indicatorRight }}
      >
        <ChevronRight className="w-5 h-5 text-primary" />
      </motion.div>
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 -top-10 z-20 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10"
        style={{ opacity: indicatorUp }}
      >
        <ChevronUp className="w-5 h-5 text-primary" />
      </motion.div>
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 -bottom-10 z-20 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10"
        style={{ opacity: indicatorDown }}
      >
        <ChevronDown className="w-5 h-5 text-primary" />
      </motion.div>

      <motion.div
        drag
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0.5}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onPointerUp={handlePointerUp}
        style={{ x, y, rotateZ, rotateX }}
        className="relative w-full h-[22rem] cursor-grab active:cursor-grabbing rounded-3xl"
      >
        <div
          className="relative w-full h-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{
            transform: isShuffling ? 'scale(0.85) rotateY(180deg)' : 'scale(1) rotateY(0deg)',
            opacity: isShuffling ? 0.5 : 1,
          }}
        >
          <div
            className="relative w-full h-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{
              transformStyle: 'preserve-3d',
              transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            {/* Front face */}
            <div
              className="absolute inset-0 rounded-3xl bg-card border border-border shadow-xl shadow-primary/5 p-5 flex flex-col"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-bold tracking-wider text-primary bg-accent px-2.5 py-1 rounded-full">
                  STUDY
                </span>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onSpeak(); }}
                    className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground transition-transform active:scale-90 hover:text-foreground"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
                    className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground transition-transform active:scale-90 hover:text-foreground"
                  >
                    <Bookmark className={`w-4 h-4 ${card?.mastered ? "fill-primary text-primary" : ""}`} />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center text-center px-1 relative">
                {showHintAnim && (
                  <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    <div className="relative animate-hint-glow">
                      <div className="absolute -inset-6 rounded-full bg-yellow-400/30 animate-ping" />
                      <div className="absolute -inset-3 rounded-full bg-yellow-300/20 animate-pulse" />
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-200 to-yellow-400 flex items-center justify-center shadow-lg shadow-yellow-400/30 animate-bounce">
                        <Lightbulb className="w-8 h-8 text-yellow-700" />
                      </div>
                    </div>
                  </div>
                )}

                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-4">
                  <Sparkles className="w-7 h-7 text-primary" />
                </div>
                <p className="text-lg font-semibold text-foreground leading-snug">{card?.front}</p>

                {hint && !showHintAnim && (
                  <div className="mt-3 text-xs text-muted-foreground italic bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800/30 rounded-xl px-3 py-2 max-w-[260px] animate-in fade-in slide-in-from-bottom-2">
                    <Lightbulb className="w-3 h-3 text-yellow-500 inline mr-1.5" />
                    {hint}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium text-primary animate-bounce">Tap to flip</span>
              </div>
            </div>

            {/* Back face */}
            <div
              className="absolute inset-0 rounded-3xl bg-gradient-to-br from-accent to-accent/80 border border-border shadow-xl p-5 flex flex-col"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <span className="self-start text-[10px] font-bold tracking-wider text-primary bg-card px-2.5 py-1 rounded-full shadow-sm">
                ANSWER
              </span>
              <div className="flex-1 flex items-center justify-center text-center px-2">
                <p className="text-base font-medium text-foreground leading-relaxed">{card?.back}</p>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs font-medium text-primary animate-bounce">Tap to flip back</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
