# Synapse - Real-Time Collaborative Study Rooms & AI Mentors

Synapse is a collaborative study platform designed to keep students focused, disciplined, and consistent. It features real-time study rooms, synchronized countdown timers, custom AI character mentors, interactive mindmaps and flashcards, and an anti-cheat assessment engine with personalized habits reporting.

---

## 🚀 Tech Stack Used

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, TypeScript)
- **Database / Real-Time**: [Supabase](https://supabase.com/) (PostgreSQL, Realtime subscriptions, Supabase client)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) (Vanilla Tailwind, curated dark themes, glassmorphism, responsive grid layouts)
- **AI Engine (Primary)**: Google Gemini API (`gemini-1.5-flash` for high-speed analysis and assessment)
- **AI Engine (Secondary / Fallback)**: Local [Ollama](https://ollama.com/) running `gemma3:4b`
- **Diagrams**: [Mermaid.js](https://mermaid.js.org/) (dynamically styled mindmap diagrams rendering cleanly on dark themes)
- **Components**: [Lucide React](https://lucide.dev/) (icon system), modern CSS micro-animations, and 3D card flips.

---

## ✨ Features Implemented

### 1. Collaborative Study Rooms
- Create or join persistent study rooms with target milestones, durations, and content materials.
- Real-time peer collaboration with auto-updating member list.

### 2. Synchronized Peer Timers
- Global count-down timers synchronized in real-time across all connected peers.
- Automated session checkpoints (e.g. 15-minute countdown reminders, study duration status, and final quiz triggers).

### 3. Custom AI Character Mentors
- Choose from 6 different AI character mentors: **Loki** (sarcastic and mischievous), **Tai Lung** (disciplined Kung Fu master), **L** (quiet, sweet-eating detective), **Gojo Satoru** (confident jujutsu sorcerer), **Illuminati** (mysterious all-seeing collective), or **Doctor Strange** (mystic arts guardian).
- Custom characters have individual prompts, color-themed frames, custom avatar indicators, and specific styling for their taglines.
- Chat moderation scans all messages in real time, alerting users if they go off-topic, with character-persona warning messages.

### 4. Resilient Multi-Tier AI fallback
- **Tier 1 (Cloud)**: Google Gemini API runs all quiz, flashcard, mindmap, and report generations.
- **Tier 2 (Local)**: If the Gemini API key lacks quota, fails, or is missing, the system seamlessly routes prompts to a local **Ollama** instance (`gemma3:4b`) using standard fetch queries.
- **Tier 3 (Static Fallback)**: If both cloud and local models are unavailable, a rule-based smart mock generator generates context-rich study content based on keyword analysis of study materials.
- **Resilient JSON Parser**: Extracts valid JSON blocks from AI responses, stripping out markdown wraps (` ```json `) or pre/post conversational chatter to prevent parsing failures.

### 5. Automated Mindmaps & Interactive Flashcards
- **Intelligent Heading Targeting**: If uploaded study content contains `# Mind Map`, `# Flashcards`, or `# Quiz` headings, the AI targets only the relevant portions, making processing exceptionally fast.
- **Bulletproof Mermaid Mindmap Sanitization**: Automatically reconstructs outlines, bullet points, or raw strings into syntactically valid Mermaid.js diagrams (wrapping labels, removing forbidden tokens, and mapping depth levels).
- **3D Flipping Flashcards**: Generates interactive 5-flashcard study decks that flip on hover/click for quick memory retrieval.

### 6. Anti-Cheat Monitoring & Personal Focus Reports
- Real-time tab-activity tracking monitors when a student switches tabs.
- Distraction tracking counts tab-switches and issues warnings.
- Completing a study session opens a custom quiz based strictly on the uploaded text.
- Generates a **Personal Report** showing key focus strengths, areas of growth, and habit summaries.

---

## 🌟 Additional Features

### 1. 🤖 AI-Powered Learning Assistance
- unique AI mentor characters with distinct personalities.
- AI-powered study guidance and motivational feedback.
- Real-time chat moderation to keep discussions focused.

### 2. 🧠 AI-Generated Learning Resources
- Automatic **flashcard generation** from study materials.
- AI-generated visual mindmaps using Mermaid.js.
- Interactive 3D flashcard experience.

### 3. 🛡️ Resilient AI Architecture
- Google Gemini as the primary AI engine.
- Automatic Ollama fallback for uninterrupted service.
- Rule-based fallback generation when AI services are unavailable.

### 4. 📊 Focus Tracking & Analytics
- Tab-switch monitoring to detect distractions.
- Focus warnings during study sessions.
- Personalized study habit and productivity reports.

### 5. 🎯 Automated Assessments
- AI-generated quizzes based on uploaded content.
- Post-session performance evaluation and feedback.

### 6. 🎨 Enhanced User Experience
- Modern glassmorphism-based UI.
- Responsive design for multiple screen sizes.
- Smooth animations and real-time visual updates.

---

## 🛠️ Project Setup Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.x or later)
- [Supabase CLI](https://supabase.com/docs/guides/cli) or a free Supabase cloud project
- (Optional) [Ollama](https://ollama.com/) running locally with `gemma3:4b` pulled:
  ```bash
  ollama pull gemma3:4b
  ```

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd group_stuudy_app
npm install
```

### 2. Configure Environment Variables
Create a file named `.env.local` in the root directory:
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# AI API Configurations
GEMINI_API_KEY=your-gemini-api-key
```

### 3. Database Setup (Supabase)
Run the queries in `schema.sql` inside your Supabase SQL Editor. This will provision the necessary database tables:
- `rooms` (study room data)
- `chats` (chat messages and system notifications)
- `members` (connected study partners)
- `mindmaps` (generated Mermaid diagrams)
- `flashcards` (saved interactive decks)
- `quizzes` (final quiz results)

### 4. Running the Development Server
Start the development server locally:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your web browser.

### 5. Production Compilation
To build the application for production:
```bash
npm run build
npm run start
```
