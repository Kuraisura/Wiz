import { supabase } from '@/supabaseClient';
import { extractTextFromFile } from '@/lib/documentParser';
import { generateFromText } from '@/lib/localEngine';

// Lazy-load AI service only when needed
let aiService = null;

async function getAiService() {
  if (!aiService) {
    try {
      aiService = await import('@/services/aiService');
    } catch {
      return null;
    }
  }
  return aiService;
}

// Server-side Pro verification — cannot be bypassed by client mods
export async function verifyProAccess(userId) {
  if (!userId) return false;
  try {
    const { data, error } = await supabase.functions.invoke('verify-pro', {
      body: { userId },
    });
    if (error) return false;
    return data?.isPro === true;
  } catch {
    return false;
  }
}

function buildAiPrompt(documentText, fileName, totalPages, options) {
  const { scope, formats, count, difficulty } = options;

  const formatInstructions = formats.map(f => {
    switch(f) {
      case 'Multiple Choice':
        return `- Multiple Choice: 4 options (A-D), one correct. "type": "mc", "options": [...], "correct": 0-3`;
      case 'Identification':
        return `- Identification: fill-in-the-blank. "type": "id", "options": [], "correct": "exact answer"`;
      case 'True or False':
        return `- True/False: statement-based. "type": "tf", "options": ["True","False"], "correct": 0 or 1`;
      case 'Matching Type':
        return `- Matching: pair related items. "type": "match", "options": ["Left A","Left B","Left C"], "matchOptions": ["Right D","Right E","Right F"], "correct": [0,1,2] (left index → right index mapping)`;
      default:
        return `- ${f}`;
    }
  }).join('\n');

  const difficultyGuide = {
    'Warmup': 'Generate EASY questions. Use straightforward definitions, basic recall, and simple true/false. Focus on surface-level understanding. Questions should test memorization of key terms and simple facts.',
    'Standard': 'Generate MEDIUM difficulty questions. Mix recall with comprehension. Include questions that require understanding context, comparing concepts, or applying knowledge to familiar scenarios.',
    'Exam Ready': 'Generate HARD questions. Focus on analysis, application, and critical thinking. Include scenario-based questions, tricky distractors, questions requiring synthesis of multiple concepts, and edge cases.'
  };

  return `You are an expert educator. Generate study materials from this document.

DOCUMENT: ${fileName} (${totalPages} pages)

CONTENT:
${documentText}

Generate exactly ${count} questions and ${Math.min(count, 10)} flashcards.
SCOPE: ${scope || 'All topics'}
DIFFICULTY LEVEL: ${difficulty}
${difficultyGuide[difficulty] || difficultyGuide['Standard']}
FORMATS (distribute evenly across all):
${formatInstructions}

RULES:
1. Questions must be answerable from the document only
2. MC: realistic wrong answers that sound plausible${difficulty === 'Exam Ready' ? ', with subtle differences between options' : ''}
3. ID: answer is an exact term from the document
4. TF: false statements should be plausible but wrong
5. Match: logical pairs from the document
6. Flashcards: key terms with full definitions
7. Avoid overly trivial questions — every question should require genuine understanding

Return ONLY valid JSON (no markdown, no backticks):
{
  "quiz": {
    "questions": [
      { "question": "...", "options": ["A","B","C","D"], "correct": 0, "type": "mc" }
    ],
    "flashcards": [
      { "front": "Term", "back": "Definition" }
    ]
  }
}`;
}

export const generateStudyContent = async (file, options, userId) => {
  let documentText, totalPages, fileName;
  try {
    const result = await extractTextFromFile(file);
    documentText = result.text;
    totalPages = result.totalPages;
    fileName = result.fileName;
  } catch (e) {
    const msg = e.message || 'Could not read this file.';
    if (msg.includes('too large')) throw new Error(msg);
    if (msg.includes('Unsupported')) throw new Error(msg);
    if (msg.includes('encrypted') || msg.includes('corrupted') || msg.includes('invalid')) throw new Error(msg);
    throw new Error('Could not read this file. Please try a different document.');
  }

  if (!documentText || documentText.trim().length < 50) {
    throw new Error('Not enough readable text in this file. Please try a document with more text content.');
  }

  const truncatedText = documentText.length > 12000
    ? documentText.substring(0, 12000) + '\n\n[Document truncated due to length...]'
    : documentText;

  // Step 1: Always generate locally (instant, no API limits)
  console.log('[Generator] Running local extractive engine...');
  const localResult = generateFromText(documentText, options);

  // Step 2: Verify Pro access server-side before attempting AI enhancement
  const isPro = await verifyProAccess(userId);
  if (!isPro) {
    console.log('[Generator] Not Pro — using local result only');
    return localResult;
  }

  // Step 3: Try AI enhancement (Pro only, server-verified)
  try {
    const aiModule = await getAiService();
    if (aiModule?.aiService) {
      console.log('[Generator] Attempting AI enhancement (Pro verified)...');
      const prompt = buildAiPrompt(truncatedText, fileName, totalPages, options);
      const rawResponse = await aiModule.aiService.generateResponse(prompt);

      let cleanedJson = rawResponse.trim();
      cleanedJson = cleanedJson.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      const jsonMatch = cleanedJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanedJson = jsonMatch[0];

      const aiResult = JSON.parse(cleanedJson);

      if (aiResult.quiz?.questions?.length > 0) {
        const hasRealContent = aiResult.quiz.questions.some(q =>
          q.question && !q.question.includes('Sample Question') &&
          !q.question.includes('core concept of section')
        );
        if (hasRealContent) {
          console.log('[Generator] AI enhancement successful');
          aiResult.quiz.questions = aiResult.quiz.questions.map(q => ({
            ...q,
            type: q.type || 'mc',
            options: q.options || []
          }));
          return aiResult;
        }
      }
      console.warn('[Generator] AI returned generic content, using local result');
    }
  } catch (e) {
    console.warn('[Generator] AI unavailable, using local result:', e.message);
  }

  // Fallback: return local result
  console.log('[Generator] Using local extractive result');
  return localResult;
};
