import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/supabase';
import { generateQuizQuestions, QuizQuestion } from '@/app/actions/gemini';
import { Shield, ShieldAlert, Award, Timer, ChevronRight, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';

interface FullscreenTestProps {
  sessionId: string;
  roomId: string;
  userId: string;
  contentText: string;
  savedQuestions: QuizQuestion[] | null;
  onQuizSubmitted: (score: number, timeTaken: number) => void;
  onLogViolation: (violationType: string) => void;
}

export default function FullscreenTest({
  sessionId,
  roomId,
  userId,
  contentText,
  savedQuestions,
  onQuizSubmitted,
  onLogViolation
}: FullscreenTestProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  
  // Timer state
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [isSubmitted, setIsSubmitted] = useState(false);
  const startTimerRef = useRef<number>(Date.now());

  // Cheating log
  const [cheatingLogs, setCheatingLogs] = useState<string[]>([]);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

  // 1. Fetch / Generate Questions
  useEffect(() => {
    const initQuestions = async () => {
      try {
        if (savedQuestions && savedQuestions.length > 0) {
          setQuestions(savedQuestions);
        } else {
          // Generate via Gemini
          const generated = await generateQuizQuestions(contentText);
          setQuestions(generated);
          // Save back to session so other users see the exact same questions
          await db.sessions.update(sessionId, { quiz_questions: generated });
        }
      } catch (err) {
        console.error("Error generating/loading quiz questions:", err);
      } finally {
        setIsLoadingQuestions(false);
      }
    };
    initQuestions();
  }, [savedQuestions, contentText, sessionId]);

  // 2. Fullscreen, Copy-Paste, and Blur Event Listeners (Anti-Cheat)
  useEffect(() => {
    if (!isFullscreen || isSubmitted) return;

    // Prevent navigation out of page
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Are you sure you want to exit? Your quiz will be automatically submitted.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Tab Switch / Visibility Change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        logCheating('Tab switched (tab hidden)');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Window Blur (lost focus, Alt+Tab, separate application click)
    const handleBlur = () => {
      logCheating('Window focus lost (Alt+Tab or external click)');
    };
    window.addEventListener('blur', handleBlur);

    // Prevent Copy, Paste, Right Click, Selection
    const preventDefault = (e: Event) => e.preventDefault();
    document.addEventListener('copy', preventDefault);
    document.addEventListener('paste', preventDefault);
    document.addEventListener('contextmenu', preventDefault);
    document.addEventListener('selectstart', preventDefault);

    // Disable Ctrl+C, Ctrl+V, Esc key (to prevent normal exit without alert)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey && e.key === 'c') ||
        (e.ctrlKey && e.key === 'v') ||
        (e.metaKey && e.key === 'c') ||
        (e.metaKey && e.key === 'v')
      ) {
        e.preventDefault();
        logCheating('Keyboard Copy/Paste combo blocked');
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Detect exit fullscreen via Esc or other means
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        logCheating('Fullscreen Mode exited');
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('copy', preventDefault);
      document.removeEventListener('paste', preventDefault);
      document.removeEventListener('contextmenu', preventDefault);
      document.removeEventListener('selectstart', preventDefault);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen, isSubmitted]);

  // 3. 10 Minute Quiz Countdown Timer
  useEffect(() => {
    if (!isFullscreen || isSubmitted) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          autoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isFullscreen, isSubmitted]);

  const logCheating = async (type: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const log = `[${timestamp}] Violation detected: ${type}`;
    setCheatingLogs((prev) => [...prev, log]);
    setWarningMsg(`Anti-Cheat Alert: ${type}! Points will be deducted.`);
    
    // Deduct 5 points immediately from database
    await db.roomMembers.deductPoints(roomId, userId, 5);
    onLogViolation(type);

    setTimeout(() => {
      setWarningMsg(null);
    }, 5000);
  };

  const enterFullscreen = () => {
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
          startTimerRef.current = Date.now();
        })
        .catch((err) => {
          console.error("Error enabling fullscreen:", err);
          // Standard browser restriction fallback
          setIsFullscreen(true);
          startTimerRef.current = Date.now();
        });
    } else {
      setIsFullscreen(true);
      startTimerRef.current = Date.now();
    }
  };

  const handleNextQuestion = () => {
    if (selectedOption === null) return;
    
    const q = questions[currentIdx];
    // Store locked answer
    setAnswers((prev) => ({ ...prev, [q.id]: selectedOption }));
    
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((prev) => prev + 1);
      setSelectedOption(null);
    } else {
      // Last question completed, trigger submit
      submitQuiz({ ...answers, [q.id]: selectedOption });
    }
  };

  const autoSubmit = () => {
    submitQuiz(answers);
  };

  const submitQuiz = async (finalAnswers: Record<string, number>) => {
    setIsSubmitted(true);
    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => console.error(err));
    }

    // Calculate score
    let score = 0;
    questions.forEach((q) => {
      const studentAnswerIdx = finalAnswers[q.id];
      if (studentAnswerIdx === q.correctIndex) {
        score += 20; // 5 questions * 20 points = 100 max score
      }
    });

    const endTime = Date.now();
    const timeTakenSeconds = Math.round((endTime - startTimerRef.current) / 1000);

    // Save points award if score is good
    if (score >= 80) {
      await db.roomMembers.addPoints(roomId, userId, 20); // Reward for high score
    } else if (score >= 60) {
      await db.roomMembers.addPoints(roomId, userId, 10);
    }

    // Save result to DB
    await db.testResults.save(sessionId, userId, finalAnswers, score, timeTakenSeconds);

    // Trigger celebration
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });

    onQuizSubmitted(score, timeTakenSeconds);
  };

  // Format countdown
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // 4. Initial Screen: Enter Fullscreen Mode Prompt
  if (!isFullscreen) {
    return (
      <div className="fixed inset-0 bg-[#03020b]/95 backdrop-blur-md flex items-center justify-center p-6 z-50">
        <div className="w-full max-w-lg glass-panel rounded-3xl p-8 border-l-4 border-l-indigo-500 text-center space-y-6">
          <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
            <Shield className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold font-outfit text-slate-100">Mandatory Assessment</h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              To complete the study session and earn your points, you must take a 5-question test based on the content text. Fullscreen mode is required to verify consistency.
            </p>
          </div>

          <div className="bg-slate-950/45 p-4 rounded-xl border border-white/5 text-left space-y-2.5">
            <h4 className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Anti-Cheat Guard Rules:</h4>
            <ul className="text-xs text-slate-400 space-y-1.5 list-disc pl-4">
              <li>Tab switching will result in automated point deductions (-5 pts).</li>
              <li>Exiting fullscreen will raise warnings and deduct points.</li>
              <li>Copy-pasting and text highlighting are disabled.</li>
              <li>There is a 10-minute auto-submit limit.</li>
            </ul>
          </div>

          <button
            onClick={enterFullscreen}
            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl transition duration-200 shadow-lg shadow-indigo-500/25 flex items-center justify-center space-x-2 text-sm"
          >
            <span>Enter Fullscreen & Begin Test</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Loading questions placeholder
  if (isLoadingQuestions) {
    return (
      <div className="fixed inset-0 bg-[#03020b] flex items-center justify-center z-50">
        <div className="text-center space-y-4">
          <div className="h-10 w-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">AI is compiling questions from study materials...</p>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 bg-[#03020b]/95 backdrop-blur-md flex items-center justify-center p-6 z-50">
        <div className="w-full max-w-lg glass-panel rounded-3xl p-8 border-l-4 border-l-red-500 text-center space-y-6">
          <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-400">
            <ShieldAlert className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold font-outfit text-slate-100">No Questions Available</h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              We couldn't generate questions from the study materials. Please ensure your content is valid and try again later.
            </p>
          </div>

          <button
            onClick={() => onQuizSubmitted(0, 0)}
            className="w-full py-4 bg-gradient-to-r from-red-500 to-indigo-600 hover:from-red-600 hover:to-indigo-700 text-white font-bold rounded-xl transition duration-200 shadow-lg flex items-center justify-center space-x-2 text-sm"
          >
            <span>Proceed to Activity Report</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentIdx];

  return (
    <div className="fixed inset-0 bg-[#03020b] select-none flex flex-col z-50 text-slate-100 p-6 overflow-hidden">
      
      {/* Warning Overlay */}
      {warningMsg && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-red-600 border border-red-500 text-white text-xs font-bold px-6 py-3.5 rounded-full shadow-2xl z-50 flex items-center space-x-2 animate-bounce">
          <ShieldAlert className="h-4.5 w-4.5" />
          <span>{warningMsg}</span>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
        <div className="flex items-center space-x-2.5">
          <Shield className="h-5 w-5 text-indigo-400" />
          <span className="text-sm font-bold tracking-wider font-outfit uppercase">Anti-Cheat Mode Guarded</span>
        </div>

        <div className="flex items-center space-x-4">
          {/* Violations Count */}
          {cheatingLogs.length > 0 && (
            <span className="text-[10px] font-bold bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1 rounded-full">
              Violations: {cheatingLogs.length}
            </span>
          )}

          {/* Timer */}
          <div className="flex items-center space-x-2 bg-slate-900 border border-white/5 px-4 py-1.5 rounded-xl font-mono text-sm text-slate-200">
            <Timer className="h-4 w-4 text-indigo-400" />
            <span>Time Left: {formatTime(timeLeft)}</span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-6xl mx-auto w-full overflow-hidden">
        
        {/* Question Panel (Col 8) */}
        <div className="lg:col-span-8 bg-slate-950/40 border border-white/5 rounded-3xl p-8 space-y-6 flex flex-col justify-between min-h-[450px]">
          
          <div className="space-y-5">
            <div className="flex justify-between items-center text-xs text-slate-400 uppercase tracking-widest font-semibold">
              <span>Question {currentIdx + 1} of {questions.length}</span>
              <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">Single progression</span>
            </div>

            <h2 className="text-xl font-bold font-outfit text-slate-100 leading-snug">
              {currentQuestion.question}
            </h2>

            {/* Options Grid */}
            <div className="space-y-3 mt-6">
              {(currentQuestion.options || []).map((option, idx) => {
                const isSelected = selectedOption === idx;
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedOption(idx)}
                    className={`p-4 rounded-xl border text-sm cursor-pointer transition-all duration-200 flex items-center space-x-3.5 ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500 text-indigo-200 shadow-md shadow-indigo-500/5'
                        : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10 hover:border-white/10'
                    }`}
                  >
                    <div className={`h-5 w-5 rounded-full border flex items-center justify-center font-bold text-[10px] ${
                      isSelected 
                        ? 'border-indigo-400 bg-indigo-500 text-white' 
                        : 'border-slate-600 bg-slate-800'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <span>{option}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end pt-6 border-t border-white/5">
            <button
              onClick={handleNextQuestion}
              disabled={selectedOption === null}
              className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition duration-200 flex items-center space-x-2"
            >
              <span>{currentIdx === questions.length - 1 ? 'Finish & Submit' : 'Submit & Next'}</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

        </div>

        {/* Status / Activity Panel (Col 4) */}
        <div className="lg:col-span-4 bg-slate-950/40 border border-white/5 rounded-3xl p-6 space-y-5 h-full overflow-hidden flex flex-col">
          <div>
            <h3 className="font-bold text-slate-200 text-sm font-outfit">Live Log Watcher</h3>
            <p className="text-[11px] text-slate-400">Events are recorded on-chain in the room session</p>
          </div>

          <div className="flex-1 bg-slate-950/80 rounded-2xl p-4 border border-white/5 overflow-y-auto space-y-2 min-h-[200px]">
            <div className="flex items-center space-x-1.5 text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-2">
              <CheckCircle2 className="h-3 w-3" />
              <span>Assessment Started</span>
            </div>

            {cheatingLogs.length === 0 ? (
              <p className="text-[11px] text-slate-500 italic py-4 text-center">No integrity violations recorded. Keep it up!</p>
            ) : (
              cheatingLogs.map((log, index) => (
                <p key={index} className="text-[10px] font-mono text-red-400 font-medium">
                  {log}
                </p>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
