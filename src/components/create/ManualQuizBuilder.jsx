import React, { useState, useCallback } from "react";
import { Plus, Trash2, GripVertical, Check, X, ChevronDown, SquareCheck, Square, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const QUESTION_TYPES = [
  { value: "mc", label: "Multiple Choice" },
  { value: "tf", label: "True / False" },
  { value: "id", label: "Identification" },
  { value: "enum", label: "Enumeration" },
  { value: "match", label: "Matching" },
];

function emptyQuestion(type = "mc") {
  const base = { question: "", type, points: 1 };
  if (type === "mc") {
    return { ...base, options: ["", "", "", ""], correct: 0 };
  }
  if (type === "tf") {
    return { ...base, options: ["True", "False"], correct: 0 };
  }
  if (type === "id") {
    return { ...base, correct: "" };
  }
  if (type === "enum") {
    return { ...base, correct: ["", "", ""] };
  }
  if (type === "match") {
    return { ...base, options: ["", ""], matchOptions: ["", ""], correct: [0, 1] };
  }
  return base;
}

export default function ManualQuizBuilder({ questions, onChange }) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState(new Set());

  const toggleSelectMode = () => {
    setSelectMode(prev => !prev);
    setSelectedIndices(new Set());
  };

  const toggleSelect = (index) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIndices.size === questions.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(questions.map((_, i) => i)));
    }
  };

  const deleteSelected = () => {
    if (selectedIndices.size === 0) return;
    const updated = questions.filter((_, i) => !selectedIndices.has(i));
    onChange(updated);
    setSelectedIndices(new Set());
    setSelectMode(false);
    setExpandedIndex(null);
  };

  const addQuestion = (type = "mc") => {
    const newQ = emptyQuestion(type);
    onChange([...questions, newQ]);
    setExpandedIndex(questions.length);
  };

  const removeQuestion = (index) => {
    const updated = questions.filter((_, i) => i !== index);
    onChange(updated);
    if (expandedIndex === index) setExpandedIndex(null);
    else if (expandedIndex > index) setExpandedIndex(expandedIndex - 1);
  };

  const updateQuestion = (index, patch) => {
    const updated = questions.map((q, i) => i === index ? { ...q, ...patch } : q);
    onChange(updated);
  };

  const updateOption = (qIndex, oIndex, value) => {
    const q = questions[qIndex];
    const options = [...(q.options || [])];
    options[oIndex] = value;
    updateQuestion(qIndex, { options });
  };

  const addOption = (qIndex) => {
    const q = questions[qIndex];
    if (!q.options || q.options.length >= 6) return;
    updateQuestion(qIndex, { options: [...q.options, ""] });
  };

  const removeOption = (qIndex, oIndex) => {
    const q = questions[qIndex];
    if (!q.options || q.options.length <= 2) return;
    const options = q.options.filter((_, i) => i !== oIndex);
    const correct = q.correct >= options.length ? 0 : q.correct;
    updateQuestion(qIndex, { options, correct });
  };

  const updateEnumAnswer = (qIndex, aIndex, value) => {
    const q = questions[qIndex];
    const answers = [...(q.correct || [])];
    answers[aIndex] = value;
    updateQuestion(qIndex, { correct: answers });
  };

  const addEnumAnswer = (qIndex) => {
    const q = questions[qIndex];
    const answers = [...(q.correct || []), ""];
    updateQuestion(qIndex, { correct: answers });
  };

  const removeEnumAnswer = (qIndex, aIndex) => {
    const q = questions[qIndex];
    if (!q.correct || q.correct.length <= 1) return;
    const answers = q.correct.filter((_, i) => i !== aIndex);
    updateQuestion(qIndex, { correct: answers });
  };

  const renderQuestionEditor = (q, index) => {
    if (q.type === "mc") {
      return (
        <div className="space-y-3">
          <div className="space-y-2">
            {(q.options || []).map((opt, oIdx) => (
              <div key={oIdx} className="flex items-center gap-2">
                <div
                  onClick={() => updateQuestion(index, { correct: oIdx })}
                  className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold border-2 transition-all cursor-pointer ${
                    q.correct === oIdx
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {q.correct === oIdx ? <Check className="w-3.5 h-3.5" /> : String.fromCharCode(65 + oIdx)}
                </div>
                <Input
                  value={opt}
                  onChange={(e) => updateOption(index, oIdx, e.target.value)}
                  placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                  className="h-12 rounded-xl text-sm"
                />
                {(q.options || []).length > 2 && (
                  <button
                    onClick={() => removeOption(index, oIdx)}
                    className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {(q.options || []).length < 6 && (
            <button
              onClick={() => addOption(index)}
              className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add option
            </button>
          )}
          <p className="text-[11px] text-muted-foreground">Tap the letter circle to mark the correct answer</p>
        </div>
      );
    }

    if (q.type === "tf") {
      return (
        <div className="flex gap-3">
          {["True", "False"].map((label, i) => (
            <button
              key={label}
              onClick={() => updateQuestion(index, { correct: i })}
              className={`flex-1 h-12 rounded-xl font-semibold text-sm border-2 transition-all ${
                q.correct === i
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-border bg-card text-foreground hover:border-primary/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      );
    }

    if (q.type === "id") {
      return (
        <Input
          value={typeof q.correct === "string" ? q.correct : ""}
          onChange={(e) => updateQuestion(index, { correct: e.target.value })}
          placeholder="Correct answer (identification)"
          className="h-12 rounded-xl text-sm"
        />
      );
    }

    if (q.type === "enum") {
      const answers = Array.isArray(q.correct) ? q.correct : ["", "", ""];
      return (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">List all correct answers (one per line)</p>
          <div className="space-y-2">
            {answers.map((ans, aIdx) => (
              <div key={aIdx} className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground w-6 text-center">{aIdx + 1}.</span>
                <Input
                  value={ans}
                  onChange={(e) => updateEnumAnswer(index, aIdx, e.target.value)}
                  placeholder={`Answer ${aIdx + 1}`}
                  className="h-12 rounded-xl text-sm"
                />
                {answers.length > 1 && (
                  <button
                    onClick={() => removeEnumAnswer(index, aIdx)}
                    className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => addEnumAnswer(index)}
            className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> Add answer
          </button>
        </div>
      );
    }

    if (q.type === "match") {
      const leftItems = q.options || [];
      const rightItems = q.matchOptions || [];
      return (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">Add items to both columns. Left column (A) matches to Right column (B) in order.</p>
          <div className="grid grid-cols-2 gap-3">
            {/* Left column */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Column A</p>
              {leftItems.map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">{String.fromCharCode(65 + oIdx)}.</span>
                  <Input
                    value={opt}
                    onChange={(e) => updateOption(index, oIdx, e.target.value)}
                    placeholder={`Item ${String.fromCharCode(65 + oIdx)}`}
                    className="h-10 rounded-xl text-sm"
                  />
                  {leftItems.length > 2 && (
                    <button
                      onClick={() => {
                        const q2 = questions[index];
                        const newLeft = q2.options.filter((_, i) => i !== oIdx);
                        const newRight = (q2.matchOptions || []).filter((_, i) => i !== oIdx);
                        const newCorrect = (q2.correct || []).filter((_, i) => i !== oIdx);
                        updateQuestion(index, { options: newLeft, matchOptions: newRight, correct: newCorrect });
                      }}
                      className="p-1 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* Right column */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Column B</p>
              {rightItems.map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">{String.fromCharCode(65 + oIdx)}.</span>
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const matchOpts = [...(q.matchOptions || [])];
                      matchOpts[oIdx] = e.target.value;
                      updateQuestion(index, { matchOptions: matchOpts });
                    }}
                    placeholder={`Item ${String.fromCharCode(65 + oIdx)}`}
                    className="h-10 rounded-xl text-sm"
                  />
                  {rightItems.length > 2 && (
                    <button
                      onClick={() => {
                        const newRight = rightItems.filter((_, i) => i !== oIdx);
                        updateQuestion(index, { matchOptions: newRight });
                      }}
                      className="p-1 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          {leftItems.length < 8 && (
            <button
              onClick={() => {
                const newLeft = [...leftItems, ""];
                const newRight = [...rightItems, ""];
                const newCorrect = [...(q.correct || []), leftItems.length];
                updateQuestion(index, { options: newLeft, matchOptions: newRight, correct: newCorrect });
              }}
              className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add pair
            </button>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Questions ({questions.length})
        </h3>
        <div className="flex items-center gap-2">
          {questions.length > 0 && (
            <>
              {selectMode && selectedIndices.size > 0 && (
                <button
                  onClick={deleteSelected}
                  className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
                >
                  <Trash className="w-3.5 h-3.5" />
                  Delete ({selectedIndices.size})
                </button>
              )}
              <button
                onClick={toggleSelectMode}
                className={`flex items-center gap-1 text-xs font-medium transition-colors ${
                  selectMode ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {selectMode ? (
                  <>
                    <SquareCheck className="w-3.5 h-3.5" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5" />
                    Select
                  </>
                )}
              </button>
              {selectMode && (
                <button
                  onClick={selectAll}
                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  {selectedIndices.size === questions.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => {
          const isExpanded = expandedIndex === i;
          const typeLabel = QUESTION_TYPES.find(t => t.value === q.type)?.label || q.type;
          return (
            <div
              key={i}
              className={`rounded-2xl border-2 overflow-hidden transition-all ${
                isExpanded ? "border-primary bg-card shadow-sm" : "border-border bg-card"
              }`}
            >
              <div className="w-full flex items-center gap-3 p-3.5">
                {selectMode ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(i); }}
                    className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center border-2 transition-all ${
                      selectedIndices.has(i)
                        ? "border-primary bg-primary text-white"
                        : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {selectedIndices.has(i) && <Check className="w-3.5 h-3.5" />}
                  </button>
                ) : (
                  <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => selectMode ? toggleSelect(i) : setExpandedIndex(isExpanded ? null : i)}
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {q.question || `Question ${i + 1}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{typeLabel}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!selectMode && (
                    <>
                      <button
                        onClick={() => removeQuestion(i)}
                        className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div
                        onClick={() => setExpandedIndex(isExpanded ? null : i)}
                        className="p-1.5 cursor-pointer"
                      >
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="px-3.5 pb-3.5 space-y-3 border-t border-border pt-3">
                  <div className="flex flex-wrap gap-2">
                    {QUESTION_TYPES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => updateQuestion(i, { ...emptyQuestion(t.value), question: q.question })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          q.type === t.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={q.question}
                    onChange={(e) => updateQuestion(i, { question: e.target.value })}
                    placeholder="Type your question..."
                    className="min-h-[80px] rounded-xl text-sm resize-none"
                    autoFocus
                  />
                  {renderQuestionEditor(q, i)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {QUESTION_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => addQuestion(t.value)}
            className="flex items-center justify-center gap-1.5 h-11 rounded-xl border-2 border-dashed border-border text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-all"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
