// ---------------------------------------------------------------------------
// bulkQuizParser.js — Parse pasted quiz text into structured questions
// Supports: MC, TF, Identification, Enumeration, Matching
// No AI needed — pure regex/pattern matching.
// ---------------------------------------------------------------------------

/**
 * Detect the question type from a block of text.
 */
function detectType(lines) {
  const text = lines.join("\n");

  // MC: has A.) B.) C.) D.) pattern
  const mcPattern = /[A-Da-d][\.\)]\)/;
  if (lines.some(l => mcPattern.test(l))) return "mc";

  // TF: only True/False options
  const tfPattern = /\b(true|false)\b/i;
  const optionLines = lines.filter(l => /^[A-Da-d][\.\)]\)/.test(l.trim()));
  if (optionLines.length === 2 && optionLines.every(l => tfPattern.test(l))) return "tf";

  // Enum: has numbered list items (1. 2. 3.) that are NOT option letters
  const enumPattern = /^\d+[\.\)]\s+/;
  const enumLines = lines.filter(l => enumPattern.test(l.trim()));
  if (enumLines.length >= 2) return "enum";

  // Match: has "Match Column A" / "Match Column B" or "matches" keyword
  if (/\bmatch(?:ing|es)?\b/i.test(text) && /\b(column|pair|left|right)\b/i.test(text)) {
    return "match";
  }

  // Default: Identification (question only, answer is separate)
  return "id";
}

/**
 * Parse a single question block into a structured question object.
 */
function parseQuestionBlock(block) {
  const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // Find the question line (first line that isn't an option/answer)
  let questionLine = "";
  let optionStartIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip option lines (A.) B.) etc.) and numbered answer lines
    if (/^[A-Da-d][\.\)]\)/.test(line)) {
      optionStartIdx = i;
      break;
    }
    if (/^\d+[\.\)]\s+/.test(line) && i > 0) {
      // This is an enum answer line
      optionStartIdx = i;
      break;
    }
    questionLine += (questionLine ? " " : "") + line.replace(/^\d+[\.\)]\s*/, "");
    optionStartIdx = i + 1;
  }

  if (!questionLine.trim()) return null;

  const optionLines = lines.slice(optionStartIdx);
  const type = detectType(lines);

  const base = {
    question: questionLine.trim(),
    type,
    points: 1,
  };

  // Parse based on type
  if (type === "mc") {
    const options = [];
    let correctIdx = 0;
    for (const line of optionLines) {
      const match = line.match(/^([A-Da-d])[\.\)]\)\s*(.+)/);
      if (match) {
        const text = match[2].trim();
        // Check if marked as correct with * or [correct] or (answer)
        const isCorrect = text.includes("*") || /\[correct\]|\(answer\)|✓|✔/i.test(text);
        options.push(text.replace(/\*|\[correct\]|\(answer\)|✓|✔/gi, "").trim());
        if (isCorrect) correctIdx = options.length - 1;
      }
    }
    return { ...base, options, correct: correctIdx };
  }

  if (type === "tf") {
    const options = ["True", "False"];
    let correctIdx = 0;
    for (const line of optionLines) {
      const match = line.match(/^([A-Da-d])[\.\)]\)\s*(.+)/);
      if (match) {
        const text = match[2].trim().toLowerCase();
        const isCorrect = line.includes("*") || /\[correct\]|\(answer\)|✓|✔/i.test(line);
        if (isCorrect) {
          correctIdx = text.startsWith("true") ? 0 : 1;
        }
      }
    }
    return { ...base, options, correct: correctIdx };
  }

  if (type === "id") {
    // Answer might be after a colon, dash, or "Answer:" keyword
    let answer = "";
    const fullText = lines.join(" ");
    const answerMatch = fullText.match(/(?:Answer|Ans|A)[:\s=]+(.+?)(?:\s*$)/i)
      || fullText.match(/[:\uff09\)]\s*(.+?)$/);
    if (answerMatch) {
      answer = answerMatch[1].trim();
    }
    return { ...base, correct: answer };
  }

  if (type === "enum") {
    const answers = [];
    for (const line of optionLines) {
      const match = line.match(/^\d+[\.\)]\s*(.+)/);
      if (match) {
        answers.push(match[1].trim());
      }
    }
    return { ...base, correct: answers.length > 0 ? answers : [""] };
  }

  if (type === "match") {
    // Match format: "Left -> Right" or "Left = Right" or tab-separated
    const left = [];
    const right = [];
    for (const line of optionLines) {
      const match = line.match(/^\d+[\.\)]\s*(.+?)\s*(?:->|→|=|—|-)\s*(.+)/);
      if (match) {
        left.push(match[1].trim());
        right.push(match[2].trim());
      }
    }
    return { ...base, options: left, matchOptions: right, correct: right.map((_, i) => i) };
  }

  return null;
}

/**
 * Split text into individual question blocks.
 * Handles numbered questions: 1.) 2.) 3.) etc.
 */
function splitIntoBlocks(text) {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Split on question numbers: "1.)" "2.)" "1." "2." etc.
  // But NOT on sub-items like "A.)" or "1. Answer" inside enum
  const blocks = [];
  const lines = normalized.split("\n");
  let currentBlock = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Check if this is a new question number (1.) 2.) etc.)
    if (/^\d+[\.\)]\)\s+/.test(trimmed) && currentBlock.length > 0) {
      blocks.push(currentBlock.join("\n"));
      currentBlock = [trimmed];
    } else if (/^\d+[\.\)]\)\s+/.test(trimmed) && currentBlock.length === 0) {
      currentBlock.push(trimmed);
    } else {
      currentBlock.push(trimmed);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join("\n"));
  }

  return blocks;
}

/**
 * Main parse function. Takes raw pasted text and returns structured questions.
 *
 * @param {string} text - The raw pasted quiz text
 * @returns {Array} Array of question objects
 */
export function parseBulkQuizText(text) {
  if (!text || !text.trim()) return [];

  const blocks = splitIntoBlocks(text);
  const questions = [];

  for (const block of blocks) {
    const question = parseQuestionBlock(block);
    if (question && question.question.trim()) {
      questions.push(question);
    }
  }

  return questions;
}

/**
 * Get a human-readable summary of parsed questions.
 */
export function getParsedSummary(questions) {
  const counts = { mc: 0, tf: 0, id: 0, enum: 0, match: 0 };
  for (const q of questions) {
    counts[q.type] = (counts[q.type] || 0) + 1;
  }

  const parts = [];
  if (counts.mc > 0) parts.push(`${counts.mc} Multiple Choice`);
  if (counts.tf > 0) parts.push(`${counts.tf} True/False`);
  if (counts.id > 0) parts.push(`${counts.id} Identification`);
  if (counts.enum > 0) parts.push(`${counts.enum} Enumeration`);
  if (counts.match > 0) parts.push(`${counts.match} Matching`);

  return parts.length > 0 ? parts.join(", ") : "No questions detected";
}
