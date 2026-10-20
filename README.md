# ⚡ Wiz

**AI-Powered Quiz & Study Platform** · `Websites`

AI-driven quiz creation and study platform with photo scanning, bulk paste, AI generation, flashcards, and performance analytics.

## Why This Project

Students in the Philippines accumulate study material in fragments — photographed textbook pages, photocopied reviewers, PDF lecture modules, and blocks of old exam questions copied into chat threads. Turning that pile into something testable usually means retyping questions by hand the night before an exam, exactly when time is scarcest. General study tools either ignore how this material actually arrives (a phone camera, a paste buffer), lock their best features behind pricing that doesn't match local budgets, or treat finishing a quiz as the end of the loop instead of the start of a real review cycle.

Wiz was built solo by Mark Crysler Baddo to close that gap for Filipino students: every ingestion path a student actually uses — manual entry, bulk paste, photo scan with OCR, and AI generation from uploaded course documents — leads to the same destination of timed quizzes, flashcards with mastery tracking, and measurable progress. Beyond the learning loop, it is built as a production system rather than a demo: Supabase auth with Google/GitHub sync, server-side Pro verification, PayMongo freemium billing, multi-provider AI fallback, and offline resilience so a dropped connection mid-commute doesn't erase a study session.

## How It Works

Mariel is a second-year college student in Manila, three days out from her general chemistry midterm. She has a 60-page lecturer PDF and a camera roll full of textbook photos from the library. She signs in with Google — Wiz provisions her profile from her OAuth metadata and drops her on an empty dashboard that shows zeroed stats, nudging her toward the first quiz. She opens **Create**, uploads the PDF, scopes generation to "Chapter 3 — Stoichiometry," selects 20 questions mixing multiple choice and identification, sets difficulty to Exam Ready, and generates. The document parser extracts the text, the AI service routes the prompt through its provider chain, and a quiz plus a matching flashcard deck land in her library.

The next morning she opens the Quiz Library, configures a 15-minute timed attempt with shuffled questions, and works through it on the jeepney ride to campus. She scores 14/20. The results screen shows every miss with correct-answer feedback; she stars the hardest flashcards and flips through the deck on the ride home. Her daily streak ticks up and her mastery percentage climbs. Later that week she photographs a reviewer page she borrowed from a classmate, runs the photo-scan pipeline, and folds the parsed questions into the same library — material in from any source, one consistent loop of quiz, review, and retention out.

## Modules

### Authentication & Profiles

Handles email/password and third-party sign-in (Google/GitHub) through Supabase, seeds each new account's profile from OAuth metadata, enforces protected routes, and persists theme and subscription state — including a local cache on Capacitor builds so native launches resolve entitlements without a round-trip.

**Scenario:** Mariel taps "Continue with Google" on her phone. Supabase authenticates her, Wiz creates her profile row from her name and avatar, and the app lands on her personalized dashboard with her streak, plan, and quiz library already scoped to her account — the same account syncs when she later logs in on a lab desktop.

### AI Quiz & Flashcard Generation

The core value pipeline: upload a PDF or DOCX, define scope, question formats, count, and difficulty (Warmup / Standard / Exam Ready), and the generator extracts document text, builds a structured prompt, and parses the AI's response into quiz questions and flashcards saved to Supabase. AI access is Pro-gated by a server-side `verify-pro` check, and the client-side AI service fails over across multiple providers (Groq, Gemini, Cerebras, OpenRouter) so one provider outage doesn't kill generation.

**Scenario:** With her lecturer's PDF uploaded, Mariel scopes generation to Chapter 3, picks 20 mixed-format Exam Ready questions, and confirms. Within moments her library shows a new "AI Generated Study Set" with a companion flashcard deck categorized under the same title — no question was typed by hand.

### Photo Scan to Quiz (OCR)

A capture-to-quiz pipeline for printed and handwritten material: photos come from the native Capacitor camera or gallery upload, and a hybrid OCR chain tries the `scan-ocr` Supabase edge function first, then AI vision, then local Tesseract with adaptive preprocessing as offline fallback. Extracted text is shown with confidence and source, is fully editable, and is parsed into structured questions before saving.

**Scenario:** Mariel photographs a borrowed review handout with her phone camera. Wiz runs OCR, shows her the extracted text with a confidence indicator, she corrects a smudged term in the editor, and the parsed questions save as a new quiz she can take the same evening — no retyping of the handout.

### Bulk Paste Importer

A pure pattern-matching parser — no AI required — that ingests pasted blocks of questions and auto-detects multiple choice, true/false, identification, enumeration, and matching formats. A built-in format guide teaches the syntax so imports parse cleanly, with a live summary of what was recognized before committing.

**Scenario:** Mariel copies twenty questions from an old reviewer thread in her class group chat, pastes them into the importer, sees the summary confirm "12 multiple choice, 5 identification, 3 true/false," and saves the quiz in one tap without spending AI credits.

### Manual Quiz Builder

Question-by-question authoring for material a student already knows cold — educators and students set difficulty and question count up front, then add questions in the chosen formats through a guided form flow.

**Scenario:** As a peer tutor, Mariel hand-crafts a 10-question review set for her study group's weakest topic, choosing Standard difficulty and multiple choice only, then shares the quiz by having group members import it into their own libraries.

### Quiz Session Engine

The timed testing environment: preset limits from 5 to 30 minutes (or no limit), shuffled question order to prevent memorizing answer positions across retakes, per-question navigation, and automatic progress persistence via Capacitor Preferences on native or localStorage on web — so an interrupted session can resume. Submission produces an immediate score, time taken, and a question-by-question breakdown with correct/incorrect indicators.

**Scenario:** On exam-eve Mariel starts a 15-minute shuffled attempt, gets a call mid-quiz, and reopens the session later to find her answers intact. She submits, reviews every miss with feedback, and goes to bed knowing exactly which Chapter 3 concepts to re-read.

### Flashcard Study Mode

Decks are derived from a student's quizzes; each card flips on tap with shuffle, hint, and star controls, and mastery is tracked per card so long-term retention is measured separately from one-time quiz scores. Mastery percentages feed directly into the profile.

**Scenario:** Between classes Mariel opens her stoichiometry deck, flips through twenty cards, stars the three mole-ratio definitions she keeps missing, and marks the rest mastered — her deck mastery climbs from 60% to 85% over the week.

### Library & Cloud Sync

The student's file cabinet: folders for organizing source material, local and cloud-backed files with search, sort, and move operations, and status indicators for quizzes not yet taken or needing review — the central hub for ongoing study.

**Scenario:** Mariel creates a "Chem 101" folder, moves her AI-generated set and scanned reviewer into it, and sorts by newest to see this week's additions first — everything for the midterm sits in one place instead of scattered across devices.

### Profile & Gamification

Aggregates flashcards mastered, mastery percentage, and daily streak into a learner profile, with streaks leveraging loss aversion so students return daily rather than reset their count. Settings expose theme and account controls.

**Scenario:** Six days into her streak, Mariel opens the app just to keep it alive, ends up doing one flashcard deck, and watches her mastery tick up — the habit loop built into the profile screen doing its job.

### Subscriptions & Billing (PayMongo)

A freemium model with a Free tier (manual creation, quizzes, flashcards, timer) and Pro at ₱279/month (unlimited AI generation, auto-flashcards, priority support). Checkout runs through the `paymongo-checkout` edge function, webhooks confirm payment via `paymongo-webhook`, and `activate-subscription` / `cancel-subscription` manage the lifecycle. `verify-pro` re-checks entitlement server-side on every AI call, and an IP-based trial guard prevents free-trial abuse.

**Scenario:** After a month of free manual quizzes, Mariel upgrades to Pro for finals week. She completes PayMongo checkout on her phone, the webhook activates her plan, and the AI generation lock disappears — she generates five course-document quizzes that afternoon. When finals end, she cancels from the subscription page and keeps her library on the Free tier.

### Offline Resilience & Anti-Abuse

A local storage layer (local store, local DB, local engine), an offline banner, rate limiting, and quiz-progress recovery keep the app usable through spotty connectivity — common on student commutes — while anti-abuse guards protect AI and trial entitlements.

**Scenario:** The jeepney loses signal in a tunnel mid-quiz. An offline banner appears, her in-progress answers continue to persist locally, and when connectivity returns the app resumes syncing without losing a single response.

## Features

- Create quizzes manually, by bulk paste, by photo scan, or via AI generation
- Upload course documents and auto-generate questions
- Timed quizzes with shuffle and instant results
- Answer review with correct/incorrect feedback
- Flashcard study mode with mastery tracking
- Profile with streak, mastery stats, and subscription plans

## Tech Stack

- React
- Vite
- Tailwind CSS
- Supabase
- OpenAI API

## Screenshots

### Account gate — users authenticate via email/password or third-party providers (Google/GitHub) to sync their quizzes and study progress across devices.

![Account gate — users authenticate via email/password or third-party providers (Google/GitHub) to sync their quizzes and study progress across devices.](screenshots/1.png)

### Manual quiz builder — lets educators and students hand-craft quizzes question by question. Setting difficulty and question count upfront shapes the learning experience before content is added.

![Manual quiz builder — lets educators and students hand-craft quizzes question by question. Setting difficulty and question count upfront shapes the learning experience before content is added.](screenshots/2.png)

### Fresh account state — the empty dashboard shows zeroed stats to motivate new users. Seeing "0 completed" creates a psychological drive to take the first quiz and start filling the dashboard.

![Fresh account state — the empty dashboard shows zeroed stats to motivate new users. Seeing "0 completed" creates a psychological drive to take the first quiz and start filling the dashboard.](screenshots/3.png)

### Learner profile — tracks individual progress (flashcards mastered, day streak, mastery percentage) to gamify studying. Streaks leverage loss aversion: users return daily to avoid resetting their count.

![Learner profile — tracks individual progress (flashcards mastered, day streak, mastery percentage) to gamify studying. Streaks leverage loss aversion: users return daily to avoid resetting their count.](screenshots/4.png)

### Monetization page — presents the freemium tiers clearly. The Pro plan at ₱279/month unlocks unlimited AI generation and advanced features, converting power users into paying subscribers.

![Monetization page — presents the freemium tiers clearly. The Pro plan at ₱279/month unlocks unlimited AI generation and advanced features, converting power users into paying subscribers.](screenshots/5.png)

### Camera-to-quiz pipeline — students photograph textbook pages or lecture slides and Wiz converts them into quiz questions. Eliminates manual transcription of study material.

![Camera-to-quiz pipeline — students photograph textbook pages or lecture slides and Wiz converts them into quiz questions. Eliminates manual transcription of study material.](screenshots/6.png)

### Bulk paste importer — for students who already have questions in text form (from past exams, study guides, etc.). The format guide teaches the syntax so imports parse correctly.

![Bulk paste importer — for students who already have questions in text form (from past exams, study guides, etc.). The format guide teaches the syntax so imports parse correctly.](screenshots/7.png)

### AI generation setup — users upload their course materials (PDFs, DOCX) and Wiz's AI reads them to auto-generate relevant quiz questions. This is the platform's core value proposition.

![AI generation setup — users upload their course materials (PDFs, DOCX) and Wiz's AI reads them to auto-generate relevant quiz questions. This is the platform's core value proposition.](screenshots/8.png)

### Generation confirmation — shows the uploaded file is ready, lets users name the quiz and choose question count/difficulty, then confirms successful generation with a toast notification.

![Generation confirmation — shows the uploaded file is ready, lets users name the quiz and choose question count/difficulty, then confirms successful generation with a toast notification.](screenshots/9.png)

### Quiz library — the student's personal dashboard of all created quizzes with status indicators (Not Taken, needs review) and aggregate performance stats. The central hub for ongoing study.

![Quiz library — the student's personal dashboard of all created quizzes with status indicators (Not Taken, needs review) and aggregate performance stats. The central hub for ongoing study.](screenshots/10.png)

### Pre-quiz configuration — lets students customize each quiz attempt: time limit, shuffle order, and question selection. Shuffling prevents memorization of answer positions across retakes.

![Pre-quiz configuration — lets students customize each quiz attempt: time limit, shuffle order, and question selection. Shuffling prevents memorization of answer positions across retakes.](screenshots/11.png)

### Active testing environment — the timed quiz interface with question navigation, answer selection, and countdown timer. The pressure of the clock simulates real exam conditions.

![Active testing environment — the timed quiz interface with question navigation, answer selection, and countdown timer. The pressure of the clock simulates real exam conditions.](screenshots/12.png)

### Results & review — immediately after submission, students see their score, time taken, and a question-by-question breakdown with correct/incorrect indicators. The review loop is where actual learning happens.

![Results & review — immediately after submission, students see their score, time taken, and a question-by-question breakdown with correct/incorrect indicators. The review loop is where actual learning happens.](screenshots/13.png)

### Spaced repetition flashcards — cards flip on tap with shuffle, hint, and star (favorite) controls. Mastery percentage tracks long-term retention, not just one-time quiz scores.

![Spaced repetition flashcards — cards flip on tap with shuffle, hint, and star (favorite) controls. Mastery percentage tracks long-term retention, not just one-time quiz scores.](screenshots/14.png)

## About

A full-featured study platform that lets students create quizzes from photos, pasted text, or AI-generated content from uploaded course materials. Includes timed testing, flashcards, performance analytics, and a freemium subscription model.

---

Built by [Mark Crysler Baddo](https://github.com/Kuraisura) · [Portfolio](https://kuraisler.xyz)
