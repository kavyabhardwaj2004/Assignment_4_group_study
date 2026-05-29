'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || '';
const isAiMock = !apiKey || apiKey.includes('your_gemini_api_key');

import { MENTORS } from '@/lib/mentors';

// Initialize Gemini API client if key is present
const getGeminiClient = () => {
  if (isAiMock) return null;
  return new GoogleGenerativeAI(apiKey);
};

// Local Ollama client fallback
async function generateWithOllama(prompt: string, expectJson: boolean = false): Promise<string> {
  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemma3:4b',
      prompt: prompt,
      stream: false,
      format: expectJson ? 'json' : undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: status ${response.status}`);
  }

  const data = await response.json();
  return data.response || '';
}


// Helper to extract content under a specific markdown heading (e.g. # Mind Map, # Flashcards, # Quiz)
function extractSectionContent(fullText: string, sectionHeading: string): string | null {
  if (!fullText) return null;
  const normalizedText = fullText.replace(/\r\n/g, '\n');
  // Match heading like "# Mind Map", "## Mind Map", "# Mindmap", etc. case insensitively
  const headingRegex = new RegExp(`^(?:#+\\s*)${sectionHeading.replace(/\\s+/g, '\\\\s*')}\\b`, 'im');
  const match = normalizedText.match(headingRegex);
  
  if (!match || match.index === undefined) return null;
  
  const startIndex = match.index + match[0].length;
  // The section ends at the next heading starting with "#"
  const nextHeadingRegex = /\n#+\s+/g;
  nextHeadingRegex.lastIndex = startIndex;
  const nextMatch = nextHeadingRegex.exec(normalizedText);
  
  if (nextMatch) {
    return normalizedText.substring(startIndex, nextMatch.index).trim();
  } else {
    return normalizedText.substring(startIndex).trim();
  }
}

// Resilient helper to clean and parse JSON from Gemini/Ollama responses
function cleanAndParseJson(text: string): any {
  if (!text) throw new Error("Empty JSON response");
  let cleaned = text.trim();
  
  // Remove markdown code block wraps if present
  cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/g, '');
  cleaned = cleaned.replace(/\s*```$/g, '');
  cleaned = cleaned.trim();
  
  // Find first [ or { and last ] or } to extract raw JSON block
  const firstBracket = cleaned.indexOf('[');
  const firstBrace = cleaned.indexOf('{');
  
  let startIndex = -1;
  let endIndex = -1;
  
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    startIndex = firstBracket;
    endIndex = cleaned.lastIndexOf(']');
  } else if (firstBrace !== -1) {
    startIndex = firstBrace;
    endIndex = cleaned.lastIndexOf('}');
  }
  
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    cleaned = cleaned.substring(startIndex, endIndex + 1);
  }
  
  return JSON.parse(cleaned);
}

// --- Chat Moderation Server Action ---

export async function moderateMessage(message: string, contentText: string): Promise<{ isOfftopic: boolean; warningMsg: string | null }> {
  if (isAiMock) {
    // Simple heuristic for mock moderation
    const offTopicKeywords = ['lol', 'haha', 'meme', 'joke', 'play', 'game', 'movie', 'song', 'party', 'date', 'crypto', 'nft', 'lunch', 'dinner', 'sleep', 'bored', 'waste time', 'phone'];
    const lowerMsg = message.toLowerCase();
    const hasOfftopicWord = offTopicKeywords.some(word => lowerMsg.includes(word));
    
    // Check if it looks related to the study content
    const studyKeywords = contentText.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const hasStudyLink = studyKeywords.some(word => lowerMsg.includes(word)) || lowerMsg.length > 25;

    if (hasOfftopicWord && !hasStudyLink) {
      return {
        isOfftopic: true,
        warningMsg: "Let's keep this session focused on the topic! Distractions are not allowed in this study room."
      };
    }
    return { isOfftopic: false, warningMsg: null };
  }

  try {
    const ai = getGeminiClient()!;
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are a strict study moderator. You are checking if a user message is off-topic.
The study room is focused on this content: "${contentText.substring(0, 1000)}"

Message to check: "${message}"

Determine if the message is off-topic (i.e., jokes, casual chat, memes, social talk unrelated to studying or the content).
Respond in strict JSON format:
{
  "isOfftopic": boolean,
  "reason": "short explanation"
}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const responseText = result.response.text();
    const parsed = cleanAndParseJson(responseText);
    
    return {
      isOfftopic: parsed.isOfftopic,
      warningMsg: parsed.isOfftopic ? `Decorum warning: ${parsed.reason}` : null
    };
  } catch (error) {
    console.error("Gemini moderateMessage error, trying Ollama fallback:", error);
    try {
      const ollamaPrompt = `You are a strict study moderator. Determine if this message is off-topic: "${message}". The room is focused on: "${contentText.substring(0, 500)}". Respond in strict JSON format: {"isOfftopic": boolean, "reason": "short explanation"}`;
      const res = await generateWithOllama(ollamaPrompt, true);
      const parsed = cleanAndParseJson(res);
      return {
        isOfftopic: parsed.isOfftopic,
        warningMsg: parsed.isOfftopic ? `Decorum warning: ${parsed.reason}` : null
      };
    } catch (ollamaErr) {
      console.error("Ollama moderateMessage error, falling back to false:", ollamaErr);
      return { isOfftopic: false, warningMsg: null };
    }
  }
}

// --- AI Mentor Chat Response Server Action ---
export async function getMentorResponse(mentorKey: keyof typeof MENTORS, chatHistory: { sender: string; message: string }[], contentText: string): Promise<string> {
  const mentor = MENTORS[mentorKey] || MENTORS.loki;

  if (isAiMock) {
    const lastMsg = chatHistory[chatHistory.length - 1]?.message.toLowerCase() || '';
    
    // In character replies
    const lokiReplies = [
      `“${mentor.tagline}” Honestly, watching you struggle is the highlight of my eon. Focus!`,
      "Are you trying to learn, or just wasting precious screen pixels? Focus before I make you copy this text 100 times.",
      "How amusing. You think you can excel with that attention span? Try studying for a change."
    ];
    const tailungReplies = [
      `“${mentor.tagline}” True strength comes from absolute focus. Do not display weakness!`,
      "My training in the Chorh-Gom Prison required years of patience. You can't even stay in this tab for 10 minutes?",
      "Silence! Let your work speak for you. Back to the study scroll!"
    ];
    const lReplies = [
      `“${mentor.tagline}” Currently, my calculations show there is a 87% chance you are holding your phone. Put it down.`,
      "If you complete this section, I might share a piece of my strawberry cake. Otherwise, I will deduct points.",
      "Distraction is the first sign of a guilty mind. Focus on the study materials."
    ];
    const gojoReplies = [
      `“${mentor.tagline}” Hey, hey! Put the phone down. Even with my blindfold on, I can see you losing focus!`,
      "Study time is study time, my students! Let's show them what real power looks like. You got this!",
      "Don't worry, you are strong! But you'd be even stronger if you actually read the material. Let's go!"
    ];
    const illuminatiReplies = [
      `“${mentor.tagline}” The eye never blinks. We record your wandering gaze. Stay focused.`,
      "Your progress is logged in the grand ledger. Do not deviate from the scheduled study path.",
      "The circle of study must not be broken. Return to the text."
    ];
    const strangeReplies = [
      `“${mentor.tagline}” I have seen 14,000,605 futures, and in only one of them do you pass this exam by browsing other tabs.`,
      "Do not waste the temporal flow. Time is of the essence. Study now.",
      "Mystic arts require years of concentration. Your task is simpler: read the content."
    ];

    let replies = lokiReplies;
    if (mentorKey === 'tai_lung') replies = tailungReplies;
    else if (mentorKey === 'l') replies = lReplies;
    else if (mentorKey === 'gojo') replies = gojoReplies;
    else if (mentorKey === 'illuminati') replies = illuminatiReplies;
    else if (mentorKey === 'doctor_strange') replies = strangeReplies;

    // Pick response based on history length to seem dynamic
    return replies[chatHistory.length % replies.length];
  }

  try {
    const ai = getGeminiClient()!;
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const formattedHistory = chatHistory.map(h => `${h.sender}: ${h.message}`).join('\n');
    const systemPrompt = `${mentor.prompt}
    
    Here is the content text for the session: "${contentText.substring(0, 1000)}"
    
    Here is the recent chat history:
    ${formattedHistory}
    
    Generate your character-specific reply. Start with or naturally weave in a variation of your tagline: "${mentor.tagline}" if applicable.`;

    const result = await model.generateContent(systemPrompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Gemini getMentorResponse error, trying Ollama:", error);
    try {
      const formattedHistory = chatHistory.map(h => `${h.sender}: ${h.message}`).join('\n');
      const systemPrompt = `${mentor.prompt}\nContent: "${contentText.substring(0, 500)}"\nHistory:\n${formattedHistory}\nReply in character (under 3 sentences) using tagline: "${mentor.tagline}".`;
      return await generateWithOllama(systemPrompt, false);
    } catch (ollamaErr) {
      console.error("Ollama getMentorResponse error, falling back to static:", ollamaErr);
      return `“${mentor.tagline}” Keep your eyes on the goal!`;
    }
  }
}

// --- AI Mentor Doubts Generator ---
export async function getMentorDoubt(mentorKey: keyof typeof MENTORS, contentText: string): Promise<string> {
  const mentor = MENTORS[mentorKey] || MENTORS.loki;

  if (isAiMock) {
    const questions = [
      "Let's see who is actually reading. Can anyone summarize the main point of this content in one sentence?",
      "I have a query for you: what is the most important concept in the provided text and why?",
      "Answer this: what would happen if we applied the main topic of our content to a real-world scenario?",
    ];
    return questions[Math.floor(Math.random() * questions.length)];
  }

  try {
    const ai = getGeminiClient()!;
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `${mentor.prompt}
    
    The study room is studying this content: "${contentText.substring(0, 1500)}"
    
    Generate a short, quick question (less than 2 sentences) to test the students' understanding of the content. Ask it in your character persona.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("Gemini getMentorDoubt error, trying Ollama:", error);
    try {
      const prompt = `${mentor.prompt}\nStudy Content: "${contentText.substring(0, 800)}"\nGenerate a single test question in character persona.`;
      return await generateWithOllama(prompt, false);
    } catch (ollamaErr) {
      console.error("Ollama getMentorDoubt error:", ollamaErr);
      return "What is the key takeaway from the uploaded content?";
    }
  }
}

// --- Mindmap Generator (Mermaid.js) ---
export async function generateMindmap(contentText: string): Promise<string> {
  const sectionContent = extractSectionContent(contentText, "Mind Map") || extractSectionContent(contentText, "Mindmap");
  const targetContent = sectionContent ? sectionContent : contentText;

  if (isAiMock) {
    // Generate a basic Mermaid mindmap dynamically based on content words
    const words = targetContent.split(/\s+/).filter(w => w.length > 5).slice(0, 6);
    const mainTopic = words[0] || 'StudyTopic';
    const subtopics = words.slice(1, 5);
    
    let mermaidCode = `mindmap
  root((${mainTopic}))
`;
    subtopics.forEach((sub, i) => {
      mermaidCode += `    sub${i}("${sub}")\n`;
      mermaidCode += `      sub${i}_details("Key concept of ${sub}")\n`;
    });
    return mermaidCode;
  }

  try {
    const ai = getGeminiClient()!;
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Analyze this text and generate a Mermaid.js mindmap diagram.
Use the Mermaid 'mindmap' syntax (DO NOT use flowchart/graph syntax).
IMPORTANT: Wrap ALL text labels inside double quotes to prevent syntax errors (e.g. root(("Main Subject")) or node_id("Topic A") or node_id["Detail A1"]). Avoid special characters like parenthesis or colons inside unquoted text.

Example format:
mindmap
  root(("Main Subject"))
    node1("Topic A")
      node2["Detail A1"]
      node3["Detail A2"]
    node4("Topic B")
      node5["Detail B1"]

Text content:
"${targetContent.substring(0, 3000)}"

Return ONLY the Mermaid code block starting with 'mindmap'. Do not wrap in markdown \`\`\`mermaid or \`\`\`. Just raw text code.`;

    const result = await model.generateContent(prompt);
    let code = result.response.text().trim();
    // Clean up code if Gemini wraps it in markdown backticks
    code = code.replace(/```mermaid/g, '').replace(/```/g, '').trim();
    return code;
  } catch (error) {
    console.error("Gemini generateMindmap error, trying Ollama:", error);
    try {
      const ollamaPrompt = `Analyze this text and generate a Mermaid.js mindmap. Use only the 'mindmap' syntax with indentation. Do NOT use flowchart/graph syntax. Wrap ALL text labels inside double quotes (e.g. root(("Label"))). Do NOT wrap in markdown backticks. Return ONLY raw text starting with 'mindmap'.\n\nText: "${targetContent.substring(0, 1000)}"`;
      let code = await generateWithOllama(ollamaPrompt, false);
      code = code.replace(/```mermaid/g, '').replace(/```/g, '').trim();
      return code;
    } catch (ollamaErr) {
      console.error("Ollama generateMindmap error:", ollamaErr);
      return `mindmap\n  root((Study Room))\n    Content\n      Not Loaded\n    Please\n      Try Again`;
    }
  }
}

// --- Smart Fallback Helper Functions ---
function generateSmartFallbackQuiz(contentText: string): QuizQuestion[] {
  const cleanText = contentText.replace(/\s+/g, ' ').trim();
  
  // Extract sentences by splitting on punctuation
  let sentences = cleanText
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 25 && s.length < 180);

  if (sentences.length < 5) {
    // If not enough sentences, split by comma or semi-colon
    sentences = cleanText
      .split(/[,.!?\n;]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20);
  }

  // Final fallback sentences if the text is empty or very short
  if (sentences.length === 0) {
    sentences = [
      "Active recall involves testing your memory rather than passively reviewing notes.",
      "Spaced repetition is a learning technique performed at increasing intervals.",
      "A distraction-free environment is critical for maintaining deep focus.",
      "Feynman technique teaches a concept to others to identify gaps in understanding.",
      "Collaborative study rooms allow students to clarify doubts together."
    ];
  }

  const stopwords = new Set([
    'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 
    'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 
    'cant', 'cannot', 'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 
    'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 
    'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him', 
    'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 
    'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 
    'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 
    'over', 'own', 'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 
    'such', 'than', 'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 
    'theres', 'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 
    'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 
    'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which', 'while', 'who', 'whos', 
    'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 'youre', 'youve', 
    'your', 'yours', 'yourself', 'yourselves'
  ]);

  const words = cleanText
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 4 && !stopwords.has(w));

  const uniqueWords = Array.from(new Set(words));
  const result: QuizQuestion[] = [];

  for (let i = 0; i < 5; i++) {
    const sentence = sentences[i % sentences.length];
    
    // Find candidates for blanking out from this sentence
    const sentenceWords = sentence
      .split(/\s+/)
      .map(w => w.replace(/[^\w-]/g, ''))
      .filter(w => w.length > 4 && !stopwords.has(w.toLowerCase()));

    // Fallback if no suitable words found in sentence
    const blankWord = sentenceWords.length > 0 
      ? sentenceWords[Math.floor(Math.random() * sentenceWords.length)]
      : "concept";

    // Formulate question
    const regex = new RegExp(`\\b${blankWord}\\b`, 'i');
    let questionText = sentence.replace(regex, '______');
    if (!questionText.includes('______')) {
      questionText = sentence.replace(blankWord, '______');
    }

    const question = `Complete the statement from the study content: "${questionText}"`;

    // Create correct option
    const correctOption = blankWord.charAt(0).toUpperCase() + blankWord.slice(1);

    // Pick 3 distractors
    const otherWords = uniqueWords.filter(w => w.toLowerCase() !== blankWord.toLowerCase());
    const distractors: string[] = [];
    
    if (otherWords.length >= 3) {
      const shuffled = [...otherWords].sort(() => 0.5 - Math.random());
      for (const w of shuffled) {
        const capitalized = w.charAt(0).toUpperCase() + w.slice(1);
        if (!distractors.includes(capitalized)) {
          distractors.push(capitalized);
        }
        if (distractors.length === 3) break;
      }
    }

    // Default distractors if not enough words
    while (distractors.length < 3) {
      const defaults = ["Concept", "Application", "Technique", "Process", "Analysis"];
      const randomDefault = defaults[Math.floor(Math.random() * defaults.length)];
      if (randomDefault.toLowerCase() !== blankWord.toLowerCase() && !distractors.includes(randomDefault)) {
        distractors.push(randomDefault);
      }
    }

    // Combine options and shuffle
    const options = [correctOption, ...distractors];
    const shuffledOptions = [...options].sort(() => 0.5 - Math.random());
    const correctIndex = shuffledOptions.indexOf(correctOption);

    result.push({
      id: `q_fallback_${i}_${Date.now()}`,
      question,
      options: shuffledOptions,
      correctIndex: correctIndex >= 0 ? correctIndex : 0
    });
  }

  return result;
}

function generateSmartFallbackFlashcards(contentText: string): FlashcardItem[] {
  const cleanText = contentText.replace(/\s+/g, ' ').trim();
  
  let sentences = cleanText
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 25 && s.length < 180);

  if (sentences.length < 5) {
    sentences = cleanText
      .split(/[,.!?\n;]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20);
  }

  if (sentences.length === 0) {
    sentences = [
      "Active recall is the practice of actively testing your memory during learning.",
      "Spaced repetition involves reviewing material at increasing intervals.",
      "Anti-cheat mechanisms ensure assessment integrity in study sessions.",
      "Pomodoro technique splits study sessions into work and break intervals.",
      "Collaboration helps clarify complex doubts and share knowledge."
    ];
  }

  return Array.from({ length: 5 }).map((_, idx) => {
    const sentence = sentences[idx % sentences.length];
    const words = sentence.split(/\s+/).map(w => w.replace(/[^\w-]/g, '')).filter(w => w.length > 5);
    const keyTerm = words.length > 0 ? words[0] : "study material";
    
    return {
      id: `fc_fallback_${idx}_${Date.now()}`,
      front: `What is the significance of the term "${keyTerm.charAt(0).toUpperCase() + keyTerm.slice(1)}" in the context of this study topic?`,
      back: sentence
    };
  });
}

// --- Flashcards Generator ---
export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
}

export async function generateFlashcards(contentText: string): Promise<FlashcardItem[]> {
  const sectionContent = extractSectionContent(contentText, "Flashcards") || extractSectionContent(contentText, "Flashcard");
  const targetContent = sectionContent ? sectionContent : contentText;

  if (isAiMock) {
    return generateSmartFallbackFlashcards(targetContent);
  }

  try {
    const ai = getGeminiClient()!;
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Analyze the following content and generate 5 flashcards for study.
Each flashcard must have a question/term (front) and an explanation/definition (back).
Format your output as a strict JSON array of objects:
[
  {
    "id": "unique_id_1",
    "front": "Question/Term",
    "back": "Explanation/Definition"
  }
]

Text content:
"${targetContent.substring(0, 3000)}"`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    const responseText = result.response.text();
    return cleanAndParseJson(responseText);
  } catch (error) {
    console.error("Gemini generateFlashcards error, trying Ollama:", error);
    try {
      const ollamaPrompt = `Generate exactly 5 study flashcards from this content. Return a strict JSON array of objects with keys "id", "front", "back". Example: [{"id":"1","front":"Term","back":"Definition"}]\n\nContent: "${targetContent.substring(0, 1500)}"`;
      const res = await generateWithOllama(ollamaPrompt, true);
      const parsed = cleanAndParseJson(res);
      // Handle both array and {flashcards: [...]} formats
      return Array.isArray(parsed) ? parsed : (parsed.flashcards || generateSmartFallbackFlashcards(targetContent));
    } catch (ollamaErr) {
      console.error("Ollama generateFlashcards error, falling back to smart mock:", ollamaErr);
      return generateSmartFallbackFlashcards(targetContent);
    }
  }
}

// --- Quiz Questions Generator ---
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export async function generateQuizQuestions(contentText: string): Promise<QuizQuestion[]> {
  const sectionContent = extractSectionContent(contentText, "Quiz") || extractSectionContent(contentText, "Quiz Questions") || extractSectionContent(contentText, "Quizzes");
  const targetContent = sectionContent ? sectionContent : contentText;

  if (isAiMock) {
    return generateSmartFallbackQuiz(targetContent);
  }

  try {
    const ai = getGeminiClient()!;
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Analyze this text content and generate exactly 5 multiple choice quiz questions.
Each question must have exactly 4 options and a correct option index (0 to 3).
The questions should test the reader's deep understanding.
Format your output as a strict JSON array:
[
  {
    "id": "q1",
    "question": "Question text here?",
    "options": ["Option 0", "Option 1", "Option 2", "Option 3"],
    "correctIndex": 0
  }
]

Text content:
"${targetContent.substring(0, 3000)}"`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    return cleanAndParseJson(result.response.text());
  } catch (error) {
    console.error("Gemini generateQuizQuestions error, trying Ollama:", error);
    try {
      const ollamaPrompt = `Generate exactly 5 multiple choice quiz questions from this content. Each question must have exactly 4 options and a correctIndex (0 to 3). Return a strict JSON array: [{"id":"q1","question":"...","options":["A","B","C","D"],"correctIndex":0}]\n\nContent: "${targetContent.substring(0, 1500)}"`;
      const res = await generateWithOllama(ollamaPrompt, true);
      const parsed = cleanAndParseJson(res);
      return Array.isArray(parsed) ? parsed : (parsed.questions || generateSmartFallbackQuiz(targetContent));
    } catch (ollamaErr) {
      console.error("Ollama generateQuizQuestions error, falling back to smart mock:", ollamaErr);
      return generateSmartFallbackQuiz(targetContent);
    }
  }
}

// --- Personal Student Report Generator ---
export interface PersonalReport {
  keyStrength: string;
  areasOfGrowth: string;
  summary: string;
}

export async function generatePersonalReport(chatMessages: string[], quizScore: number, totalQuestions: number): Promise<PersonalReport> {
  if (isAiMock) {
    return {
      keyStrength: "Strong engagement and participation during group study sessions.",
      areasOfGrowth: "Slight vulnerability to tab switching and focus lapses, and needs minor review on the technical terminology of the text.",
      summary: `You scored ${quizScore}/${totalQuestions} on the final quiz. Your chat contribution demonstrates active interest, but focusing strictly on the content material rather than off-topic elements will maximize your efficiency.`
    };
  }

  try {
    const ai = getGeminiClient()!;
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Analyze this student's performance in a study session.
They scored ${quizScore} out of ${totalQuestions} in the content test.
Here are their chat messages during the study room:
${JSON.stringify(chatMessages)}

Generate a summarized personal report in strict JSON format:
{
  "keyStrength": "one sentence summarizing key strength (e.g. participation, conceptual accuracy, active collaboration)",
  "areasOfGrowth": "one sentence summarizing primary area of growth",
  "summary": "a short paragraph (3 sentences max) summarizing their study habits, focus, and recommendations for future study."
}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });

    return cleanAndParseJson(result.response.text());
  } catch (error) {
    console.error("Gemini generatePersonalReport error, trying Ollama:", error);
    try {
      const ollamaPrompt = `Analyze student performance: scored ${quizScore}/${totalQuestions}. Chat messages: ${JSON.stringify(chatMessages.slice(0, 10))}. Respond in strict JSON: {"keyStrength": "one sentence", "areasOfGrowth": "one sentence", "summary": "short paragraph (3 sentences max)"}`;
      const res = await generateWithOllama(ollamaPrompt, true);
      return cleanAndParseJson(res);
    } catch (ollamaErr) {
      console.error("Ollama generatePersonalReport error:", ollamaErr);
      return {
        keyStrength: "Active interest in the study session topic.",
        areasOfGrowth: "Needs to review specific terms from the content text.",
        summary: `You completed the test with a score of ${quizScore}/${totalQuestions}. Continue participating in collaborative sessions to build consistency!`
      };
    }
  }
}
