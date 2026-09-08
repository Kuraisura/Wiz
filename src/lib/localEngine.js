/**
 * Local Extractive Engine v2 — Smart Quiz Generator
 * Produces high-quality MC, ID, TF, Matching, and Enumeration questions
 * from document text without any AI API calls.
 */

// ─── Utilities ───────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','shall','can',
  'this','that','these','those','it','its','he','she','they','them','their',
  'his','her','we','our','you','your','not','no','nor','as','if','then',
  'than','so','just','about','above','after','again','all','also','any',
  'because','before','between','both','each','few','more','most','other',
  'some','such','only','own','same','too','very','s','t','don','now','d',
  'll','m','o','re','ve','y','ain','aren','couldn','didn','doesn','hadn',
  'hasn','haven','isn','ma','mightn','mustn','needn','shan','shouldn',
  'wasn','weren','won','wouldn','using','used','use','ensure','includes',
  'including','provided','following','must','should','will','can','may',
  'per','via','etc','ie','eg','cf','vs','viz','et','al','ibid','op','cit',
]);

const HEADING_PATTERN = /^#{1,6}\s|^[A-Z][A-Z\s]{3,}$|^\d+\.\s|^[IVXLC]+[\.\)]\s|^[a-z]\)\s|^\([a-z]\)\s|^[•\-\*]\s|^Step\s+\d+/im;

// ─── Text Cleaning & Parsing ─────────────────────────────────

function cleanText(raw) {
  return raw
    .replace(/={3,}/g, '')
    .replace(/-{3,}/g, '')
    .replace(/_{3,}/g, '')
    .replace(/\*{3,}/g, '')
    .replace(/Document\s+ID:.*$/gm, '')
    .replace(/Version:\s*\d+/gi, '')
    .replace(/Page\s+\d+\s+of\s+\d+/gi, '')
    .replace(/SOP-[A-Z]+-\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoSections(text) {
  const cleaned = cleanText(text);
  // Split on double newlines, headings, or numbered sections
  const sections = cleaned.split(/\n{2,}|(?=^[A-Z][A-Z\s]{4,}$)|(?=^\d+\.\s)|(?=^Step\s+\d+)/m)
    .map(s => s.trim())
    .filter(s => s.length > 30);
  return sections;
}

function getSentences(text) {
  const cleaned = cleanText(text);
  // Split on sentence-ending punctuation, but keep the content
  const raw = cleaned.split(/(?<=[.!?])\s+(?=[A-Z"])|(?<=\n)/);
  return raw
    .map(s => s.trim())
    .filter(s => {
      const words = s.split(/\s+/);
      return words.length >= 4 && words.length <= 60 && s.length >= 25 && s.length <= 300;
    });
}

function tokenize(text) {
  return cleanText(text).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function shorten(text, max = 120) {
  const t = cleanText(text);
  if (t.length <= max) return t;
  return t.substring(0, max).replace(/\s+\S*$/, '') + '...';
}

function pickRandom(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

// ─── Key Term Extraction (TF-IDF inspired) ───────────────────

function extractKeyTerms(text, topN = 30) {
  const words = tokenize(text);
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

  const total = words.length;
  const candidates = Object.entries(freq)
    .filter(([w, count]) => count >= 2 && w.length > 3)
    .map(([word, count]) => {
      const tf = count / total;
      const rarity = 1 - (count / total);
      const lengthBonus = word.length > 6 ? 1.4 : word.length > 4 ? 1.2 : 1;
      return { word, score: tf * rarity * lengthBonus * count, count };
    })
    .sort((a, b) => b.score - a.score);

  // Extract multi-word terms (bigrams)
  const bigrams = {};
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    bigrams[bg] = (bigrams[bg] || 0) + 1;
  }
  const topBigrams = Object.entries(bigrams)
    .filter(([bg, count]) => count >= 2 && bg.split(' ').every(w => w.length > 2))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([bg]) => bg);

  // Extract proper nouns (capitalized multi-word terms)
  const properNouns = [];
  const properRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let m;
  while ((m = properRegex.exec(text)) !== null) {
    const term = m[1].trim();
    if (term.length > 5 && !STOP_WORDS.has(term.toLowerCase())) {
      properNouns.push(term);
    }
  }

  // Single capitalized terms
  const singleCaps = [];
  const capRegex = /\b([A-Z][a-z]{3,})\b/g;
  while ((m = capRegex.exec(text)) !== null) {
    if (!STOP_WORDS.has(m[1].toLowerCase()) && freq[m[1].toLowerCase()] >= 2) {
      singleCaps.push(m[1]);
    }
  }

  return {
    terms: [...new Set([...candidates.slice(0, topN).map(c => c.word), ...topBigrams, ...singleCaps])],
    properNouns: [...new Set(properNouns)].slice(0, 15),
    termFreqs: freq,
  };
}

// ─── Pattern Matching ────────────────────────────────────────

function findDefinitions(sentences) {
  const definitions = [];
  const patterns = [
    /^(.+?)\s+(?:is|are|was|were)\s+(?:defined as|described as|known as|called|termed)\s+(.+)/i,
    /^(.+?)\s+refers?\s+to\s+(.+)/i,
    /^(.+?)\s+means?\s+(?:that\s+)?(.+)/i,
    /^(.+?)\s+is\s+the\s+(?:process|act|method|technique|principle|concept|practice|procedure|action|function|role|purpose|goal|objective|mechanism|system|approach|strategy|framework|model|standard|requirement|condition|state|property|attribute|characteristic|feature|aspect|element|component|part|section|phase|stage|step|level|type|kind|form|category|class|group|set|collection|series|sequence|pattern|structure|arrangement|organization|configuration|composition|makeup|constitution|formation|development|growth|evolution|change|transformation|modification|adjustment|adaptation|variation|difference|distinction|comparison|relationship|connection|association|link|bond|interaction|communication|exchange|transfer|movement|flow|direction|path|route|course|trend|tendency|pattern|behavior|function|operation|performance|activity|action|process|procedure|method|technique|approach|strategy|plan|program|project|initiative|effort|attempt|endeavor|venture|enterprise|operation|undertaking|task|job|work|duty|responsibility|obligation|commitment|promise|agreement|contract|deal|arrangement|understanding|accord|treaty|pact|protocol|convention|rule|regulation|policy|guideline|standard|criterion|measure|indicator|metric|benchmark|target|goal|objective|aim|purpose|intent|intention|plan|design|scheme|system|method|way|means|mode|manner|style|approach|technique|procedure|process|operation|activity|action|behavior|conduct|performance|execution|implementation|application|use|utilization|employment|exercise|practice|experience|skill|ability|capacity|capability|potential|talent|gift|aptitude|knack|flair|genius|brilliance|excellence|proficiency|expertise|mastery|competence|knowledge|understanding|comprehension|grasp|awareness|insight|perception|observation|recognition|identification|discovery|finding|conclusion|result|outcome|effect|consequence|impact|influence|power|authority|control|dominion|sovereignty|rule|governance|management|administration|direction|leadership|guidance|supervision|oversight|regulation|administration|operation|coordination|integration|synthesis|analysis|evaluation|assessment|appraisal|review|examination|inspection|investigation|study|research|inquiry|exploration|survey|analysis|interpretation|explanation|clarification|illustration|demonstration|proof|evidence|confirmation|verification|validation|authentication|certification|accreditation|endorsement|approval|sanction|authorization|permission|consent|agreement|concurrence|approval|acceptance|adoption|implementation|execution|performance|accomplishment|achievement|attainment|fulfillment|realization|actualization|manifestation|expression|representation|depiction|portrayal|description|explanation|interpretation|analysis|evaluation|assessment|appraisal|judgment|opinion|view|perspective|standpoint|position|attitude|approach|method|technique|procedure|process|system|strategy|plan|program|project|initiative|effort|attempt|endeavor|venture|enterprise|operation|undertaking|task|job|work|duty|responsibility|obligation|commitment|promise|agreement|contract|deal|arrangement|understanding|accord|treaty|pact|protocol|convention|rule|regulation|policy|guideline|standard|criterion|measure|indicator|metric|benchmark|target|goal|objective|aim|purpose|intent|intention|plan|design|scheme|system|method|way|means|mode|manner|style|approach|technique|procedure|process|operation|activity|action|behavior|conduct|performance|execution|implementation|application|use|utilization|employment|exercise|practice)\s+(?:of|for|in|on|at|by|with|to|from)\s+(.+)/i,
    /^(.+?)\s+involves?\s+(.+)/i,
    /^(.+?)\s+requires?\s+(.+)/i,
    /^(.+?)\s+consists?\s+of\s+(.+)/i,
  ];

  for (const sentence of sentences) {
    for (const pattern of patterns) {
      const match = sentence.match(pattern);
      if (match) {
        const term = match[1].trim();
        const def = match[2].trim();
        if (term.length > 3 && term.length < 80 && def.length > 10 && def.length < 200) {
          // Avoid matching on very common words
          const termWords = term.toLowerCase().split(/\s+/);
          if (termWords.every(w => !STOP_WORDS.has(w) || w.length > 3)) {
            definitions.push({ term, definition: def, sentence });
            break;
          }
        }
      }
    }
  }
  return definitions;
}

function findLists(text) {
  const lines = text.split('\n');
  const lists = [];
  let currentList = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[•\-\*]\s|^\d+[\.\)]\s|^[a-z][\.\)]\s|^\([a-z]\)\s|^Step\s+\d+/i.test(trimmed)) {
      const item = trimmed.replace(/^[•\-\*]\s|\d+[\.\)]\s|[a-z][\.\)]\s|\([a-z]\)\s|Step\s+\d+[\.\:]*\s*/i, '').trim();
      if (item.length > 5) {
        currentList.push(item);
      }
    } else {
      if (currentList.length >= 2) {
        lists.push([...currentList]);
      }
      currentList = [];
    }
  }
  if (currentList.length >= 2) lists.push(currentList);
  return lists;
}

function findEnumerations(sentences) {
  const enums = [];
  const patterns = [
    /^(.+?)\s+(?:includes?|contains?|comprises?|consists?\s+of|has|have)\s+(?:the\s+)?(?:following\s+)?(?:three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:main\s+)?(?:types?|kinds?|forms?|categories?|classes?|groups?|parts?|components?|elements?|aspects?|factors?|principles?|steps?|stages?|phases?|levels?|methods?|techniques?|approaches?|strategies?|practices?|procedures?|processes?|activities?|operations?|functions?|roles?|purposes?|goals?|objectives?|benefits?|advantages?|features?|characteristics?|properties?|attributes?|requirements?|conditions?|criteria?|standards?|measures?|indicators?|metrics?|benchmarks?|targets?|methods?|ways?|means?|modes?|manners?|styles?):?\s*(.+)/i,
    /^(?:The|There)\s+(?:are|is)\s+(?:three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:main\s+)?(?:types?|kinds?|forms?|categories?|classes?|groups?|parts?|components?|elements?|aspects?|factors?|principles?|steps?|stages?|phases?|levels?|methods?|techniques?|approaches?|strategies?|practices?|procedures?|processes?|activities?|operations?|functions?|roles?|purposes?|goals?|objectives?|benefits?|advantages?|features?|characteristics?|properties?|attributes?|requirements?|conditions?|criteria?|standards?|measures?|indicators?|metrics?|benchmarks?|targets?)\s+(?:of|in|for|related\s+to|associated\s+with)\s+(.+?):?\s*(.+)/i,
  ];

  for (const sentence of sentences) {
    for (const pattern of patterns) {
      const match = sentence.match(pattern);
      if (match) {
        enums.push({ context: match[1]?.trim() || match[2]?.trim(), sentence });
        break;
      }
    }
  }
  return enums;
}

// ─── Question Generators ─────────────────────────────────────

function generateMCFromDefinitions(definitions, count) {
  const questions = [];
  const used = new Set();

  for (const { term, definition, sentence } of definitions) {
    if (questions.length >= count) break;
    if (used.has(term.toLowerCase())) continue;
    used.add(term.toLowerCase());

    // Find other definitions for distractors
    const distractors = definitions
      .filter(d => d.term.toLowerCase() !== term.toLowerCase() && !used.has(d.term.toLowerCase()))
      .map(d => shorten(d.definition, 80))
      .slice(0, 3);

    if (distractors.length < 2) continue;

    const correctAnswer = shorten(definition, 80);
    const options = [correctAnswer, ...distractors].sort(() => Math.random() - 0.5);

    questions.push({
      question: `What is "${capitalize(term)}"?`,
      options: options.slice(0, 4),
      correct: options.indexOf(correctAnswer),
      type: 'mc',
    });
  }
  return questions;
}

function generateMCFromContext(sentences, keyTerms, count) {
  const questions = [];
  const used = new Set();

  for (const sentence of sentences) {
    if (questions.length >= count) break;
    const words = tokenize(sentence);
    const keyWord = words.find(w => keyTerms.terms.includes(w) && !used.has(w));
    if (!keyWord) continue;

    used.add(keyWord);

    // Find sentences that also contain this key term for distractors
    const related = sentences
      .filter(s => s !== sentence && tokenize(s).includes(keyWord))
      .map(s => shorten(s, 80))
      .slice(0, 3);

    if (related.length < 2) continue;

    const correctAnswer = shorten(sentence, 80);
    const options = [correctAnswer, ...related].sort(() => Math.random() - 0.5);

    questions.push({
      question: `Which of the following best describes "${capitalize(keyWord)}"?`,
      options: options.slice(0, 4),
      correct: options.indexOf(correctAnswer),
      type: 'mc',
    });
  }
  return questions;
}

function generateTrueFalse(sentences, count) {
  const questions = [];
  const used = new Set();
  const negations = [
    [/\bis\b/i, 'is not'], [/\bare\b/i, 'are not'], [/\bwas\b/i, 'was not'],
    [/\bcan\b/i, 'cannot'], [/\bwill\b/i, 'will not'], [/\bmust\b/i, 'must not'],
    [/\brequires?\b/i, 'does not require'], [/\binvolves?\b/i, 'does not involve'],
    [/\bcreates?\b/i, 'does not create'], [/\bprovides?\b/i, 'does not provide'],
    [/\benables?\b/i, 'does not enable'], [/\bensures?\b/i, 'does not ensure'],
    [/\bincreases?\b/i, 'decreases'], [/\bimproves?\b/i, 'reduces'],
    [/\bsupports?\b/i, 'opposes'], [/\ballows?\b/i, 'prevents'],
  ];

  const swaps = {
    'before': 'after', 'above': 'below', 'increase': 'decrease',
    'enable': 'prevent', 'support': 'oppose', 'create': 'destroy',
    'include': 'exclude', 'start': 'end', 'join': 'separate',
    'always': 'never', 'all': 'none', 'every': 'no',
    'primary': 'secondary', 'major': 'minor', 'first': 'last',
  };

  for (const sentence of sentences) {
    if (questions.length >= count) break;
    const cleaned = cleanText(sentence);
    if (used.has(cleaned)) continue;
    if (cleaned.endsWith('?') || cleaned.endsWith(':')) continue;

    used.add(cleaned);
    const isTrue = Math.random() > 0.45;

    if (isTrue) {
      questions.push({
        question: cleaned,
        options: ['True', 'False'],
        correct: 0,
        type: 'tf',
      });
    } else {
      let falseVersion = cleaned;
      let negated = false;

      for (const [from, to] of negations) {
        if (from.test(falseVersion)) {
          falseVersion = falseVersion.replace(from, to);
          negated = true;
          break;
        }
      }

      if (!negated) {
        const words = falseVersion.split(' ');
        for (let i = 0; i < words.length; i++) {
          const w = words[i].toLowerCase().replace(/[^a-z]/g, '');
          if (swaps[w]) {
            words[i] = words[i].replace(new RegExp(w, 'i'), swaps[w]);
            negated = true;
            break;
          }
        }
        if (negated) falseVersion = words.join(' ');
      }

      if (!negated) {
        falseVersion = `It is incorrect that ${cleaned.charAt(0).toLowerCase() + cleaned.slice(1)}`;
      }

      questions.push({
        question: falseVersion,
        options: ['True', 'False'],
        correct: 1,
        type: 'tf',
      });
    }
  }
  return questions;
}

function generateIdentification(sentences, keyTerms, count) {
  const questions = [];
  const used = new Set();

  for (const sentence of sentences) {
    if (questions.length >= count) break;
    const cleaned = cleanText(sentence);
    if (used.has(cleaned)) continue;

    const words = tokenize(cleaned).filter(w => w.length > 4);
    const importantWord = words.find(w => keyTerms.terms.includes(w) && !used.has(w)) || words[0];
    if (!importantWord) continue;

    used.add(importantWord);
    used.add(cleaned);

    const blanked = cleaned.replace(new RegExp(`\\b${importantWord}\\b`, 'i'), '________');
    if (blanked.includes('________')) {
      questions.push({
        question: blanked,
        options: [],
        correct: capitalize(importantWord),
        type: 'id',
      });
    }
  }
  return questions;
}

function generateMatching(sentences, keyTerms, count) {
  const questions = [];
  const used = new Set();

  // Find definition pairs for matching
  const definitions = findDefinitions(sentences);
  for (const { term, definition } of definitions) {
    if (questions.length >= count) break;
    const key = term.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);

    // Find other terms for distractor matches
    const otherTerms = definitions
      .filter(d => d.term.toLowerCase() !== key && !used.has(d.term.toLowerCase()))
      .slice(0, 3);

    if (otherTerms.length < 2) continue;

    const correctDef = shorten(definition, 50);
    const leftItems = [capitalize(term), ...otherTerms.map(d => capitalize(d.term))];
    const rightItems = [correctDef, ...otherTerms.map(d => shorten(d.definition, 50))];

    // Shuffle right side for the quiz
    const shuffledRight = [...rightItems].sort(() => Math.random() - 0.5);
    // Build correct mapping: left 0 -> index of correctDef in shuffled right
    const correctMap = leftItems.map((_, li) => {
      if (li === 0) return shuffledRight.indexOf(correctDef);
      return shuffledRight.indexOf(shorten(otherTerms[li - 1].definition, 50));
    });

    questions.push({
      question: 'Match each term with its correct definition:',
      options: leftItems,
      matchOptions: shuffledRight,
      correct: correctMap,
      type: 'match',
    });
  }
  return questions;
}

function generateEnumeration(sentences, lists, count) {
  const questions = [];
  const used = new Set();

  for (const list of lists) {
    if (questions.length >= count) break;
    const key = list.join('|').toLowerCase();
    if (used.has(key)) continue;
    used.add(key);

    // Pick one item as the answer, show others as options
    const correctItem = list[Math.floor(Math.random() * list.length)];
    const otherItems = list.filter(item => item !== correctItem);

    if (otherItems.length < 2) continue;

    const question = `Which of the following is NOT one of the items listed?`;
    const options = [correctItem, ...otherItems.slice(0, 3)].sort(() => Math.random() - 0.5);

    questions.push({
      question,
      options: options.slice(0, 4),
      correct: options.indexOf(correctItem),
      type: 'mc',
    });
  }
  return questions;
}

function generateFlashcards(sentences, keyTerms, definitions, count) {
  const flashcards = [];
  const used = new Set();

  // From definitions
  for (const { term, definition, sentence } of definitions) {
    if (flashcards.length >= count) break;
    const key = term.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    flashcards.push({
      front: capitalize(term),
      back: cleanText(sentence).substring(0, 250),
    });
  }

  // From key terms with context
  for (const term of keyTerms.terms) {
    if (flashcards.length >= count) break;
    if (used.has(term.toLowerCase())) continue;
    const context = sentences.find(s => tokenize(s).includes(term));
    if (context) {
      used.add(term.toLowerCase());
      flashcards.push({
        front: capitalize(term),
        back: cleanText(context).substring(0, 250),
      });
    }
  }

  // From proper nouns
  for (const noun of keyTerms.properNouns) {
    if (flashcards.length >= count) break;
    if (used.has(noun.toLowerCase())) continue;
    const context = sentences.find(s => s.toLowerCase().includes(noun.toLowerCase()));
    if (context) {
      used.add(noun.toLowerCase());
      flashcards.push({
        front: noun,
        back: cleanText(context).substring(0, 250),
      });
    }
  }

  return flashcards;
}

// ─── Quality Scoring ─────────────────────────────────────────

function scoreQuestion(q) {
  let score = 0;
  const allText = [q.question, ...(q.options || [])].join(' ');

  // Penalize gibberish
  if (/[=\-\*_]{4,}/.test(allText)) score -= 10;
  if (/Document\s+ID|Version:\s*\d/i.test(allText)) score -= 10;
  if (allText.length > 500) score -= 5;

  // Reward good structure
  if (q.question.length >= 20 && q.question.length <= 200) score += 2;
  if (q.question.endsWith('?') || q.type === 'tf' || q.type === 'id') score += 1;
  if (q.options && q.options.length >= 2 && q.options.length <= 5) score += 1;

  // Check for unique options
  if (q.options) {
    const unique = new Set(q.options.map(o => o.toLowerCase().substring(0, 30)));
    if (unique.size >= q.options.length) score += 2;
    else score -= 3;
  }

  // Penalize very short or very long answers
  if (q.options) {
    const avgLen = q.options.reduce((s, o) => s + o.length, 0) / q.options.length;
    if (avgLen >= 20 && avgLen <= 100) score += 1;
  }

  return score;
}

function filterAndRank(questions, targetCount, minScore = -3) {
  return questions
    .map(q => ({ ...q, _score: scoreQuestion(q) }))
    .filter(q => q._score > minScore)
    .sort((a, b) => b._score - a._score)
    .slice(0, targetCount)
    .map(({ _score, ...q }) => q);
}

// ─── Main Export ─────────────────────────────────────────────

export function generateFromText(text, options = {}) {
  const { count = 10, difficulty = 'Standard', formats = ['Multiple Choice'] } = options;

  const cleaned = cleanText(text);
  const sentences = getSentences(text);
  const sections = splitIntoSections(text);
  const keyTerms = extractKeyTerms(text, 30);
  const definitions = findDefinitions(sentences);
  const lists = findLists(text);
  const enumerations = findEnumerations(sentences);

  if (sentences.length < 3) {
    throw new Error('Could not extract enough readable content from the document. The text may be too short or contain mostly non-text elements (images, tables, diagrams).');
  }

  // Adjust format distribution based on difficulty
  let adjustedFormats = [...formats];
  if (difficulty === 'Easy') {
    if (!adjustedFormats.includes('True or False')) adjustedFormats.push('True or False');
    if (!adjustedFormats.includes('Identification')) adjustedFormats.push('Identification');
  } else if (difficulty === 'Hard') {
    if (!adjustedFormats.includes('Multiple Choice')) adjustedFormats.push('Multiple Choice');
    if (!adjustedFormats.includes('Matching Type')) adjustedFormats.push('Matching Type');
  }

  // Difficulty multipliers for quality filtering
  const minScore = difficulty === 'Hard' ? 0 : difficulty === 'Easy' ? -2 : -1;

  const formatCounts = {};
  adjustedFormats.forEach(f => {
    formatCounts[f] = Math.ceil(count / adjustedFormats.length);
  });

  const allQuestions = [];

  // Multiple Choice
  if (formatCounts['Multiple Choice']) {
    const mcCount = formatCounts['Multiple Choice'];
    allQuestions.push(...generateMCFromDefinitions(definitions, Math.ceil(mcCount * 0.5)));
    allQuestions.push(...generateMCFromContext(sentences, keyTerms, Math.ceil(mcCount * 0.5)));
  }

  // True or False
  if (formatCounts['True or False']) {
    allQuestions.push(...generateTrueFalse(sentences, formatCounts['True or False']));
  }

  // Identification
  if (formatCounts['Identification']) {
    allQuestions.push(...generateIdentification(sentences, keyTerms, formatCounts['Identification']));
  }

  // Matching Type
  if (formatCounts['Matching Type']) {
    allQuestions.push(...generateMatching(sentences, keyTerms, formatCounts['Matching Type']));
  }

  // Enumeration (bonus if lists found)
  if (lists.length > 0) {
    allQuestions.push(...generateEnumeration(sentences, lists, Math.min(3, lists.length)));
  }

  const finalQuestions = filterAndRank(allQuestions, count, minScore);

  // Flashcards
  const flashcardCount = Math.min(10, Math.max(5, Math.floor(count * 0.5)));
  const flashcards = generateFlashcards(sentences, keyTerms, definitions, flashcardCount);

  // Fallbacks
  if (finalQuestions.length === 0) {
    const firstSentence = sentences[0] ? cleanText(sentences[0]) : '';
    finalQuestions.push({
      question: `Which topic is covered in this document?`,
      options: ['Document procedures and guidelines', 'Technical specifications', 'Historical analysis', 'Mathematical formulas'],
      correct: 0,
      type: 'mc',
    });
  }

  if (flashcards.length === 0 && sentences.length > 0) {
    flashcards.push({
      front: 'Document Summary',
      back: cleanText(sentences[0]).substring(0, 200),
    });
  }

  return {
    quiz: {
      questions: finalQuestions,
      flashcards,
    },
  };
}
