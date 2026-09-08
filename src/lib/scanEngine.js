// ---------------------------------------------------------------------------
// scanEngine.js – Parse OCR text into structured quiz questions
// Pattern-matching based (no AI) — supports common question formats
// ---------------------------------------------------------------------------

/**
 * Extract quiz questions from scanned text.
 * Handles: numbered questions, Q/A pairs, True/False, definitions, lists.
 */
export function parseQuestionsFromText(rawText) {
  if (!rawText || rawText.trim().length < 10) {
    throw new Error("Not enough text detected. Please try again with a clearer image.");
  }

  // Normalize text
  const text = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const questions = [];

  // Try multiple parsing strategies
  const parsed =
    parseNumberedQuestions(text) ||
    parseQAStyle(text) ||
    parseTrueFalse(text) ||
    parseDefinitions(text) ||
    parseBulletPoints(text) ||
    parseSentences(text);

  if (parsed && parsed.length > 0) {
    questions.push(...parsed);
  }

  // Deduplicate by question text
  const seen = new Set();
  const unique = questions.filter((q) => {
    const key = q.question.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, 50); // Cap at 50 questions
}

// ---- Parsers ----------------------------------------------------------------

/**
 * Parse numbered questions: "1. What is...? A) ... B) ... C) ... D) ..."
 */
function parseNumberedQuestions(text) {
  const questions = [];
  // Match: number + question text + optional options
  const qRegex = /(?:^|\n)\s*(\d{1,3})\s*[.)]\s*(.+?)(?=\n\s*\d{1,3}\s*[.)]\s|\n*$)/gs;
  let match;

  while ((match = qRegex.exec(text)) !== null) {
    const block = match[2].trim();
    if (block.length < 5) continue;

    // Check for MC options: A) B) C) D) or a. b. c. d.
    const optionRegex = /\b([A-Da-d])\s*[).:]\s*(.+?)(?=\s*[A-Da-d]\s*[).:]\s|\s*$)/g;
    const options = [];
    let optMatch;

    while ((optMatch = optionRegex.exec(block)) !== null) {
      options.push(optMatch[2].trim());
    }

    if (options.length >= 2) {
      // Multiple choice — extract question stem (everything before first option)
      const stemEnd = block.search(/\b[A-Da-d]\s*[).:]/);
      const stem = stemEnd > 0 ? block.substring(0, stemEnd).trim() : block;

      // Try to detect correct answer (underlined, bold, or marked with *)
      let correctIdx = 0;
      const lines = block.split("\n");
      for (let i = 0; i < options.length; i++) {
        const optLine = lines.find((l) => l.includes(options[i]));
        if (optLine && /(\*|✓|✔|correct|answer)/i.test(optLine)) {
          correctIdx = i;
          break;
        }
      }

      questions.push({
        type: "mc",
        question: cleanQuestion(stem),
        options: options.slice(0, 6),
        correct: correctIdx,
      });
    } else {
      // Not MC — check if it's a T/F or identification
      const lowerBlock = block.toLowerCase();
      if (/\b(true|false)\b/i.test(block) && block.length < 200) {
        questions.push({
          type: "tf",
          question: cleanQuestion(block.replace(/\b(true|false)\b/gi, "").trim()),
          options: ["True", "False"],
          correct: /\btrue\b/i.test(block) ? 0 : 1,
        });
      } else {
        questions.push({
          type: "id",
          question: cleanQuestion(block),
          options: [],
          correct: "",
        });
      }
    }
  }

  return questions.length > 0 ? questions : null;
}

/**
 * Parse Q/A style: "Q: What is...? A: The answer is..."
 */
function parseQAStyle(text) {
  const questions = [];
  const qaRegex = /(?:Q|Question|Ques)[.:]\s*(.+?)(?:(?:A|Answer|Ans)[.:]\s*(.+?))?(?=(?:Q|Question|Ques)[.:]|\n*$)/gis;
  let match;

  while ((match = qaRegex.exec(text)) !== null) {
    const question = match[1]?.trim();
    const answer = match[2]?.trim();
    if (!question || question.length < 5) continue;

    if (answer) {
      // Check if answer contains options
      const options = answer.split(/[,;|]/).map((o) => o.trim()).filter(Boolean);
      if (options.length >= 2 && options.length <= 6) {
        questions.push({
          type: "mc",
          question: cleanQuestion(question),
          options,
          correct: 0,
        });
      } else {
        questions.push({
          type: "id",
          question: cleanQuestion(question),
          options: [],
          correct: answer,
        });
      }
    } else {
      questions.push({
        type: "id",
        question: cleanQuestion(question),
        options: [],
        correct: "",
      });
    }
  }

  return questions.length > 0 ? questions : null;
}

/**
 * Parse True/False statements
 */
function parseTrueFalse(text) {
  const lines = text.split("\n").filter((l) => l.trim().length > 10);
  const questions = [];

  for (const line of lines) {
    const clean = line.trim();
    // Detect T/F patterns
    if (/\b(true|false)\s*[|.]\s*(true|false)\b/i.test(clean)) continue;
    if (/\b(circle|encircle|tick|check)\b/i.test(clean)) continue;

    // Check if line is a statement (not a question)
    if (!clean.endsWith("?") && !clean.startsWith("Q") && clean.length > 15 && clean.length < 300) {
      // Likely a T/F statement
      const hasTrueFalse = /\b(is|are|was|were|has|have|had|can|will|does|do|did|should|must|may)\b/i.test(clean);
      if (hasTrueFalse) {
        questions.push({
          type: "tf",
          question: cleanQuestion(clean),
          options: ["True", "False"],
          correct: 0,
        });
      }
    }
  }

  return questions.length >= 2 ? questions : null;
}

/**
 * Parse definitions / key terms: "Term - definition" or "Term: definition"
 */
function parseDefinitions(text) {
  const lines = text.split("\n").filter((l) => l.trim().length > 5);
  const questions = [];
  const defRegex = /^(.+?)\s*[-–—:]\s*(.+)$/;

  for (const line of lines) {
    const match = line.trim().match(defRegex);
    if (match) {
      const term = match[1].trim();
      const definition = match[2].trim();

      if (term.length > 2 && term.length < 100 && definition.length > 5 && definition.length < 500) {
        // "What is X?" style
        questions.push({
          type: "id",
          question: `What is ${term}?`,
          options: [],
          correct: definition,
        });
      }
    }
  }

  return questions.length >= 2 ? questions : null;
}

/**
 * Parse bullet-pointed items as questions
 */
function parseBulletPoints(text) {
  const lines = text.split("\n").filter((l) => l.trim().length > 5);
  const questions = [];
  const bulletRegex = /^[\s]*[•●○▪▸►‣⁃]\s*(.+)/;

  for (const line of lines) {
    const match = line.trim().match(bulletRegex);
    if (match) {
      const content = match[1].trim();
      if (content.length > 10 && content.length < 300) {
        questions.push({
          type: "id",
          question: cleanQuestion(content),
          options: [],
          correct: "",
        });
      }
    }
  }

  return questions.length >= 2 ? questions : null;
}

/**
 * Fallback: treat each substantial sentence as an identification question
 */
function parseSentences(text) {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && s.length < 300);

  const questions = [];
  for (const sentence of sentences.slice(0, 30)) {
    // Create a "fill in the blank" style question
    const words = sentence.split(/\s+/);
    if (words.length >= 4) {
      // Remove a key word and make it the answer
      const keyIdx = Math.floor(words.length / 2);
      const answer = words[keyIdx];
      const question = [...words.slice(0, keyIdx), "______", ...words.slice(keyIdx + 1)].join(" ");
      questions.push({
        type: "id",
        question: cleanQuestion(question),
        options: [],
        correct: answer,
      });
    }
  }

  return questions.length >= 2 ? questions : null;
}

// ---- Helpers ----------------------------------------------------------------

function cleanQuestion(text) {
  return text
    .replace(/^\d{1,3}\s*[.)]\s*/, "")
    .replace(/^(Q|Question|Ques)[.:]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
