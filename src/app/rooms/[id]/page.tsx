'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/lib/supabase';
import { useRoomStore } from '@/lib/store';
import { MENTORS } from '@/lib/mentors';
import { moderateMessage, getMentorResponse, getMentorDoubt } from '@/app/actions/gemini';
import MindmapView from '@/components/MindmapView';
import FlashcardsView from '@/components/FlashcardsView';
import FullscreenTest from '@/components/FullscreenTest';
import { 
  Clock, Users, MessageSquare, BookOpen, AlertCircle, Share2, 
  Send, Sparkles, Brain, Award, ShieldAlert, LogOut, RefreshCw, Zap
} from 'lucide-react';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'material' | 'mindmap' | 'flashcards'>('material');
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState('');
  
  // Local AI Mentor warnings
  const [warnings, setWarnings] = useState(0);
  const [isKicked, setIsKicked] = useState(false);
  const [isGeneratingTool, setIsGeneratingTool] = useState(false);
  
  // Local countdown
  const [timeLeft, setTimeLeft] = useState(0);
  const [show15MinAlert, setShow15MinAlert] = useState(false);

  // Shared state from Zustand
  const { 
    currentRoom, session, members, messages, hasUnreadMessages, activeNotification,
    initRoom, leaveRoom, sendMessage, requestExtension, clearNotification, markMessagesRead,
    setSessionStatus, saveQuizQuestions
  } = useRoomStore();

  const chatEndRef = useRef<HTMLDivElement>(null);

  // 1. Initialize User & Room
  useEffect(() => {
    let cleanup: any;
    db.auth.getCurrentUser().then((user) => {
      if (!user) {
        router.push('/');
      } else {
        setCurrentUser(user);
        initRoom(roomId, user.id).then((unsub) => {
          cleanup = unsub;
        });
      }
    });

    return () => {
      leaveRoom();
      if (cleanup) cleanup();
    };
  }, [roomId, router, initRoom, leaveRoom]);

  // 2. Local Timer Countdown Loop
  useEffect(() => {
    if (!session || session.status !== 'active') return;

    const interval = setInterval(() => {
      const endAt = new Date(session.timer_end_at).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((endAt - now) / 1000));
      setTimeLeft(diff);

      // AI Mentor 15-minute warning reminder
      if (diff === 900) { // exactly 15 minutes left
        setShow15MinAlert(true);
        const mentorKey = currentRoom?.schedule?.mentor || 'loki';
        const mentor = MENTORS[mentorKey as keyof typeof MENTORS];
        db.chats.send(session.id, null, `⏰ [Mentor Reminder] There are exactly 15 minutes remaining in this session. Lock in, double down, and complete your scheduled milestones! ${mentor.tagline}`);
      }

      // If timer hits 0, auto start testing mode
      if (diff <= 0) {
        clearInterval(interval);
        setSessionStatus('testing');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session, currentRoom, setSessionStatus]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (isChatOpen && messages.length > 0) {
      markMessagesRead();
    }
  }, [messages, isChatOpen, markMessagesRead]);

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentUser || !session || !currentRoom) return;

    const text = chatInput;
    setChatInput('');

    // 1. Send message to chat log
    await db.chats.send(session.id, currentUser.id, text);

    // 2. Perform AI Moderation check
    const modResult = await moderateMessage(text, currentRoom.content_text);
    
    if (modResult.isOfftopic) {
      // Offtopic detected
      const newWarningCount = warnings + 1;
      setWarnings(newWarningCount);
      
      const mentorKey = currentRoom.schedule.mentor as keyof typeof MENTORS;
      const mentor = MENTORS[mentorKey] || MENTORS.loki;

      if (newWarningCount === 1) {
        // Warning 1
        await db.chats.send(
          session.id, 
          null, 
          `🚨 Warning (1/2) for ${currentUser.gmail.split('@')[0]} from ${mentor.name}: ${modResult.warningMsg}. Tagline: “${mentor.tagline}”`
        );
        // Deduct 5 points for warning
        await db.roomMembers.deductPoints(roomId, currentUser.id, 5);
      } else if (newWarningCount >= 2) {
        // Warning 2 -> Kickout
        setIsKicked(true);
        await db.chats.send(
          session.id, 
          null, 
          `⛔ KICKED OUT: ${currentUser.gmail.split('@')[0]} has been removed from this session due to repeated decorum violations. -25 points deducted.`
        );
        // Deduct 25 points
        await db.roomMembers.deductPoints(roomId, currentUser.id, 25);
        await db.roomMembers.setShowedUp(roomId, currentUser.id, false);
        
        setTimeout(() => {
          router.push('/dashboard');
        }, 4000);
      }
    } else {
      // On topic message - Check if user is asking the mentor a doubt
      const lowerText = text.toLowerCase();
      const mentorKey = currentRoom.schedule.mentor as keyof typeof MENTORS;
      const mentor = MENTORS[mentorKey] || MENTORS.loki;
      
      // Heuristic: Message mentions character name or asks a question containing mentor key words
      const asksMentor = lowerText.includes(mentorKey.split('_')[0]) || 
                         lowerText.includes('mentor') || 
                         (lowerText.endsWith('?') && Math.random() < 0.35); // 35% chance to answer random questions
      
      if (asksMentor) {
        // Fetch mentor response
        // Construct small history
        const recentMessages = messages.slice(-5).map(m => ({
          sender: m.user_id === currentUser.id ? 'Student' : m.user_id ? 'Peer' : 'System',
          message: m.message
        }));
        
        const response = await getMentorResponse(mentorKey, recentMessages, currentRoom.content_text);
        await db.chats.send(session.id, null, `💬 [Mentor] ${response}`);
      }
    }
  };

  const handleAskDoubtTrigger = async () => {
    if (!currentRoom || !session) return;
    const mentorKey = currentRoom.schedule.mentor as keyof typeof MENTORS;
    const doubt = await getMentorDoubt(mentorKey, currentRoom.content_text);
    await db.chats.send(session.id, null, `❓ [Mentor Doubt Check] ${doubt}`);
  };

  // Tool Generation: Mindmap or Flashcards
  const handleGenerateTool = async (type: 'mindmap' | 'flashcards') => {
    if (!currentRoom || !session || !currentUser) return;
    setIsGeneratingTool(true);
    try {
      if (type === 'mindmap') {
        const { generateMindmap } = await import('@/app/actions/gemini');
        const code = await generateMindmap(currentRoom.content_text);
        await db.mindmaps.save(session.id, currentUser.id, code);
      } else {
        const { generateFlashcards } = await import('@/app/actions/gemini');
        const cards = await generateFlashcards(currentRoom.content_text);
        await db.flashcards.save(session.id, currentUser.id, cards);
      }
      setActiveTab(type);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingTool(false);
    }
  };

  // Get current generated tools
  const [mindmapList, setMindmapList] = useState<any[]>([]);
  const [flashcardList, setFlashcardList] = useState<any[]>([]);

  useEffect(() => {
    if (!session) return;
    const loadTools = async () => {
      const maps = await db.mindmaps.list(session.id);
      const cards = await db.flashcards.list(session.id);
      setMindmapList(maps);
      setFlashcardList(cards);
    };
    loadTools();
  }, [session, activeTab]);

  // Current active mindmap and flashcards
  const activeMindmap = mindmapList.find(m => m.user_id === currentUser?.id) || mindmapList[0];
  const activeFlashcards = flashcardList.find(f => f.user_id === currentUser?.id) || flashcardList[0];

  if (!currentUser || !currentRoom || !session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#03020b] space-y-4">
        <div className="h-10 w-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400">Synchronizing with study room state...</p>
      </div>
    );
  }

  // Kicked Out Warning Overlay
  if (isKicked) {
    return (
      <div className="fixed inset-0 bg-red-950/95 backdrop-blur-md flex items-center justify-center p-6 z-50">
        <div className="w-full max-w-md glass-panel border border-red-500 rounded-3xl p-8 text-center space-y-6">
          <div className="h-16 w-16 rounded-full bg-red-500/10 border border-red-500 flex items-center justify-center mx-auto text-red-500">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-black font-outfit text-red-400">Decorum Violation!</h2>
          <p className="text-sm text-slate-300">
            You have been kicked out of the study session by the AI Mentor for off-topic discussions. 25 points have been deducted.
          </p>
          <p className="text-xs text-slate-500">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  // Mandatory Fullscreen Test Mode Trigger
  if (session.status === 'testing') {
    return (
      <FullscreenTest
        sessionId={session.id}
        roomId={roomId}
        userId={currentUser.id}
        contentText={currentRoom.content_text}
        savedQuestions={session.quiz_questions}
        onQuizSubmitted={() => {
          // Once test is completed, redirect to the session activity report
          router.push(`/rooms/${roomId}/activity`);
        }}
        onLogViolation={(type) => {
          // Log tab switches locally to chat log
          db.chats.send(
            session.id,
            null,
            `⚠️ ANTI-CHEAT WATCHER: Student ${currentUser.gmail.split('@')[0]} triggered a violation during the quiz: "${type}". 5 points deducted.`
          );
        }}
      />
    );
  }

  const mentorKey = currentRoom.schedule.mentor as keyof typeof MENTORS;
  const mentor = MENTORS[mentorKey] || MENTORS.loki;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#03020b]">
      
      {/* Active Room Notification Alert */}
      {activeNotification && (
        <div className="fixed top-4 left-4 z-50 max-w-sm glass-panel border border-emerald-500/30 bg-slate-900/90 text-slate-200 text-xs px-4 py-3 rounded-xl shadow-2xl flex justify-between items-start space-x-3 animate-slide-in">
          <div className="flex-1">
            <p className="font-semibold text-emerald-400">Points Notification</p>
            <p className="text-slate-300 mt-0.5">{activeNotification}</p>
          </div>
          <button onClick={clearNotification} className="text-slate-500 hover:text-white font-bold text-xs p-1">×</button>
        </div>
      )}

      {/* 15-Minute Warning Modal */}
      {show15MinAlert && (
        <div className="fixed inset-0 bg-[#03020b]/80 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-fade-in">
          <div className="w-full max-w-md glass-panel border border-indigo-500/30 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
            <div className="h-16 w-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
              <Clock className="h-8 w-8 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black font-outfit text-slate-100">15 Minutes Remaining!</h2>
              <p className="text-sm text-slate-300">
                There are exactly 15 minutes left in this focus round. Now is the time to block all distractions, complete your milestones, and prepare for the upcoming test!
              </p>
            </div>
            <button
              onClick={() => setShow15MinAlert(false)}
              className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold rounded-xl text-sm transition duration-200 shadow-lg shadow-indigo-500/25"
            >
              Got it, I'm locking in!
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-white/5 bg-slate-950/40 px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3.5">
          <button 
            onClick={async () => {
              // Sign out user via Supabase auth if available
              try {
                if (db && db.auth && db.auth.signOut) {
                  await db.auth.signOut();
                }
              } catch (e) {
                console.error('Logout signout error:', e);
              }
              router.push('/');
            }}
            className="p-2 hover:bg-white/5 rounded-xl transition duration-200 text-slate-400 hover:text-white"
          >
            <LogOut className="h-4.5 w-4.5" />
          </button>
          
          <div className="leading-tight">
            <h1 className="font-bold font-outfit text-sm text-slate-100 flex items-center space-x-1.5">
              <span>{currentRoom.schedule.milestone}</span>
            </h1>
            <p className="text-[10px] text-slate-500">Active Study Room Session</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Developer Dev Test Trigger */}
          <button
            onClick={() => setSessionStatus('testing')}
            className="hidden md:flex items-center space-x-1 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-wider transition duration-200"
          >
            <Zap className="h-3 w-3" />
            <span>Dev: Trigger Quiz</span>
          </button>

          {/* Toggle Chat Button with Red Dot */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="relative p-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white transition duration-200"
          >
            <MessageSquare className="h-4.5 w-4.5" />
            {hasUnreadMessages && (
              <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-red-500 border border-[#03020b] shadow-glow" />
            )}
          </button>
        </div>
      </header>

      {/* Workspace Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side: Materials and AI Tools (Mindmaps/Flashcards) */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6">
          
          {/* Navigation Tabs */}
          <div className="flex border-b border-white/5 space-x-5">
            <button
              onClick={() => setActiveTab('material')}
              className={`pb-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition ${
                activeTab === 'material' 
                  ? 'border-indigo-500 text-slate-100' 
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              Study Content
            </button>
            <button
              onClick={() => setActiveTab('mindmap')}
              className={`pb-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition flex items-center space-x-1.5 ${
                activeTab === 'mindmap' 
                  ? 'border-indigo-500 text-slate-100' 
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Brain className="h-3.5 w-3.5" />
              <span>AI Mindmap</span>
            </button>
            <button
              onClick={() => setActiveTab('flashcards')}
              className={`pb-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition flex items-center space-x-1.5 ${
                activeTab === 'flashcards' 
                  ? 'border-indigo-500 text-slate-100' 
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>AI Flashcards</span>
            </button>
          </div>

          {/* Tab Content Panels */}
          <div className="flex-1">
            {activeTab === 'material' && (
              <div className="glass-panel rounded-2xl p-6 h-full min-h-[350px]">
                <h3 className="font-bold text-slate-200 mb-3 font-outfit text-sm">Session Study Materials</h3>
                <div className="text-slate-300 text-sm font-light leading-relaxed whitespace-pre-wrap select-text max-h-[450px] overflow-y-auto pr-2">
                  {currentRoom.content_text}
                </div>
              </div>
            )}

            {activeTab === 'mindmap' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-slate-200 text-sm font-outfit">Mermaid.js Mindmap</h3>
                    <p className="text-[11px] text-slate-400">Renders conceptual mindmaps dynamically from text content.</p>
                  </div>
                  <button
                    onClick={() => handleGenerateTool('mindmap')}
                    disabled={isGeneratingTool}
                    className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white border border-indigo-500/20 hover:border-transparent rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition duration-200 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${isGeneratingTool ? 'animate-spin' : ''}`} />
                    <span>{activeMindmap ? 'Regenerate' : 'Generate'}</span>
                  </button>
                </div>

                {activeMindmap ? (
                  <MindmapView code={activeMindmap.mermaid_code} />
                ) : (
                  <div className="text-center py-16 border border-white/5 bg-slate-950/20 rounded-2xl space-y-3">
                    <Brain className="h-8 w-8 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">No Mindmap generated yet.</p>
                    <button
                      onClick={() => handleGenerateTool('mindmap')}
                      disabled={isGeneratingTool}
                      className="px-3.5 py-1.5 bg-indigo-500 text-white font-semibold rounded-lg text-xs"
                    >
                      {isGeneratingTool ? 'Parsing Content...' : 'Generate with Gemini'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'flashcards' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-slate-200 text-sm font-outfit">Study Flashcards</h3>
                    <p className="text-[11px] text-slate-400">3D flipping flashcard reviews generated from study text.</p>
                  </div>
                  <button
                    onClick={() => handleGenerateTool('flashcards')}
                    disabled={isGeneratingTool}
                    className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white border border-indigo-500/20 hover:border-transparent rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition duration-200 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${isGeneratingTool ? 'animate-spin' : ''}`} />
                    <span>{activeFlashcards ? 'Regenerate' : 'Generate'}</span>
                  </button>
                </div>

                {activeFlashcards ? (
                  <FlashcardsView cards={activeFlashcards.cards_json} />
                ) : (
                  <div className="text-center py-16 border border-white/5 bg-slate-950/20 rounded-2xl space-y-3">
                    <BookOpen className="h-8 w-8 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">No Flashcards generated yet.</p>
                    <button
                      onClick={() => handleGenerateTool('flashcards')}
                      disabled={isGeneratingTool}
                      className="px-3.5 py-1.5 bg-indigo-500 text-white font-semibold rounded-lg text-xs"
                    >
                      {isGeneratingTool ? 'Parsing Content...' : 'Generate with Gemini'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center Panel: countdown timer, extension controls, member list */}
        <div className="w-[300px] border-l border-white/5 bg-slate-950/20 p-6 overflow-y-auto space-y-6 flex flex-col justify-between">
          
          {/* Synced Timer Card */}
          <div className="glass-panel rounded-2xl p-5 flex flex-col items-center justify-center text-center space-y-4">
            <h3 className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Countdown Synced</h3>
            
            {/* Glowing circle representation */}
            <div className="relative h-40 w-40 rounded-full border-4 border-slate-800 flex items-center justify-center border-glow-indigo">
              <div className="text-center">
                <span className="text-3xl font-black font-mono tracking-wider text-slate-100 text-glow-indigo">
                  {formatTime(timeLeft)}
                </span>
                <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">Focus Round</p>
              </div>
            </div>

            {/* Extension controls */}
            <div className="w-full space-y-2 pt-2">
              <button
                onClick={requestExtension}
                className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-xl text-xs transition duration-200 flex items-center justify-center space-x-1.5 shadow-lg shadow-indigo-500/20"
              >
                <span>Request 15m Extension</span>
              </button>
              
              <div className="flex items-center justify-between text-[9px] text-slate-400 px-1">
                <span>Extensions Used: {session.extension_count || 0}</span>
                <span className="text-red-400">
                  {session.extension_count > 0 ? '-5 pts every extension' : 'First extension free!'}
                </span>
              </div>
            </div>
          </div>

          {/* Members scoreboard */}
          <div className="flex-1 mt-6 flex flex-col">
            <h4 className="text-xs font-bold text-slate-400 mb-3 flex items-center space-x-2 font-outfit">
              <Users className="h-4 w-4" />
              <span>Scoreboard / Members</span>
            </h4>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {members.map((member) => (
                <div 
                  key={member.user_id} 
                  className={`p-3 bg-white/5 border rounded-xl flex items-center justify-between ${
                    member.user_id === currentUser.id ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-white/5'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <div className="leading-tight">
                      <p className="text-xs font-semibold text-slate-200 truncate max-w-[120px]">
                        {member.profiles?.gmail.split('@')[0]}
                      </p>
                      <p className="text-[8px] text-slate-500">ID: {member.profiles?.student_id.substring(0, 8)}...</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-extrabold text-indigo-400">{member.points} pts</span>
                    <p className="text-[8px] text-slate-500">Score</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Side: Chat Pane (Toggleable) */}
        {isChatOpen && (
          <div className="w-[360px] border-l border-white/5 bg-slate-950/40 flex flex-col z-20">
            
            {/* AI Mentor Info Panel */}
            <div className={`p-4 bg-slate-950/80 border-b border-white/5 flex items-center space-x-3 border-l-4 ${
              mentor.borderColor
            }`}>
              <img
                src={mentor.avatar}
                alt={mentor.name}
                className="h-10 w-10 rounded-full object-cover border-2 border-slate-700 bg-slate-900"
              />
              <div className="leading-tight flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-200">{mentor.name}</h3>
                  <span className="text-[8px] uppercase tracking-wider font-extrabold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                    AI Mentor
                  </span>
                </div>
                <p className={`text-[10.5px] mt-1 leading-snug block ${mentor.taglineClass || 'text-slate-400'}`}>{mentor.tagline}</p>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="px-4 py-2 border-b border-white/5 bg-slate-950/20 flex justify-between items-center">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Mentor Operations</span>
              <button
                onClick={handleAskDoubtTrigger}
                className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold border border-indigo-500/20 bg-indigo-500/5 px-2 py-0.5 rounded-md flex items-center space-x-1"
              >
                <AlertCircle className="h-2.5 w-2.5" />
                <span>Ask doubt check</span>
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin">
              {messages.map((msg) => {
                const isSystem = msg.user_id === null;
                const isMe = msg.user_id === currentUser.id;
                
                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex items-start space-x-2 bg-indigo-950/20 border border-indigo-500/10 p-3 rounded-2xl">
                      <img 
                        src={mentor.avatar} 
                        alt="Mentor" 
                        className="h-6.5 w-6.5 rounded-full object-cover flex-shrink-0"
                      />
                      <div className="flex-1 leading-normal">
                        <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">{mentor.name.split(',')[0]}</span>
                        <p className="text-[11px] text-indigo-200 mt-0.5 font-light leading-relaxed select-text">
                          {msg.message}
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-baseline space-x-2 text-[9px] text-slate-500 font-medium">
                      <span>{msg.profiles?.gmail.split('@')[0]}</span>
                      <span>•</span>
                      <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div className={`p-3 rounded-2xl max-w-[85%] text-xs leading-relaxed mt-1 relative ${
                      isMe 
                        ? 'bg-indigo-500 text-white rounded-tr-none' 
                        : 'bg-slate-900 border border-white/5 text-slate-200 rounded-tl-none'
                    } ${msg.is_offtopic ? 'border-red-500 bg-red-950/20 text-red-300' : ''}`}>
                      <p className="select-text">{msg.message}</p>
                      {msg.is_offtopic && (
                        <div className="absolute top-1 right-1 h-3.5 w-3.5 bg-red-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white shadow-lg">
                          !
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input form */}
            <form onSubmit={handleSendChat} className="p-4 border-t border-white/5 bg-slate-950/80 flex items-center space-x-2">
              <input
                type="text"
                required
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask a doubt or discuss content..."
                className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4.5 py-3 text-xs focus:outline-none focus:border-indigo-500 text-slate-100"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="p-3 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl transition duration-200 shadow-md shadow-indigo-500/10"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

          </div>
        )}

      </div>
    </div>
  );
}
