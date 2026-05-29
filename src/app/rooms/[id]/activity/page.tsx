'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/lib/supabase';
import { generatePersonalReport, PersonalReport } from '@/app/actions/gemini';
import MindmapView from '@/components/MindmapView';
import FlashcardsView from '@/components/FlashcardsView';
import { 
  Award, ArrowLeft, Trophy, Calendar, CheckCircle2, MessageSquare, 
  Brain, BookOpen, Share2, ClipboardCheck, Sparkles, ExternalLink, Zap
} from 'lucide-react';

export default function ActivityDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [room, setRoom] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  
  // Dashboard stats
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [mindmaps, setMindmaps] = useState<any[]>([]);
  const [flashcards, setFlashcards] = useState<any[]>([]);
  
  // Report state
  const [report, setReport] = useState<PersonalReport | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);

  // Selected tool viewer
  const [selectedUserForTools, setSelectedUserForTools] = useState<string>('');
  const [activeToolTab, setActiveToolTab] = useState<'mindmap' | 'flashcard'>('mindmap');
  
  const [copiedShare, setCopiedShare] = useState(false);

  useEffect(() => {
    db.auth.getCurrentUser().then((user) => {
      if (!user) {
        router.push('/');
      } else {
        setCurrentUser(user);
        loadSessionData(user);
      }
    });
  }, [roomId, router]);

  const loadSessionData = async (user: any) => {
    try {
      const roomDetails = await db.rooms.getById(roomId);
      setRoom(roomDetails);

      if (roomDetails) {
        // Fetch session
        const sessionList = await db.sessions.getOrCreate(roomId, roomDetails.schedule.duration);
        setSession(sessionList);

        if (sessionList) {
          // Fetch leaderboard
          const results = await db.testResults.list(sessionList.id);
          // Sort results: highest score first, then fastest time
          const sorted = [...results].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.time_taken - b.time_taken;
          });
          setLeaderboard(sorted);

          // Fetch chat archives
          const messages = await db.chats.list(sessionList.id);
          setChats(messages);

          // Fetch generated mindmaps & flashcards
          const maps = await db.mindmaps.list(sessionList.id);
          const cards = await db.flashcards.list(sessionList.id);
          setMindmaps(maps);
          setFlashcards(cards);

          // Set default user for tools selection
          if (maps.length > 0) {
            setSelectedUserForTools(maps[0].user_id);
          } else if (cards.length > 0) {
            setSelectedUserForTools(cards[0].user_id);
          }

          // Generate AI performance report
          setIsReportLoading(true);
          const myResult = sorted.find(r => r.user_id === user.id);
          const quizScore = myResult ? myResult.score : 0;
          
          // Get user's chat messages
          const myChats = messages
            .filter(m => m.user_id === user.id)
            .map(m => m.message);

          const generatedReport = await generatePersonalReport(myChats, quizScore, 5);
          setReport(generatedReport);
          setIsReportLoading(false);
        }
      }
    } catch (e) {
      console.error("Error loading activity dashboard:", e);
      setIsReportLoading(false);
    }
  };

  const handleCopyShareLink = () => {
    if (!session) return;
    const shareUrl = `${window.location.origin}/share/${session.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  if (!currentUser || !room || !session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#03020b] space-y-4">
        <div className="h-10 w-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400">Loading session summary analytics...</p>
      </div>
    );
  }

  // Find best performer
  const bestPerformer = leaderboard[0];
  const myResult = leaderboard.find(r => r.user_id === currentUser.id);

  // Tools of selected user
  const selectedMindmap = mindmaps.find(m => m.user_id === selectedUserForTools);
  const selectedFlashcards = flashcards.find(f => f.user_id === selectedUserForTools);

  // Unique list of users who generated tools
  const toolGenerators = Array.from(new Set([
    ...mindmaps.map(m => m.user_id),
    ...flashcards.map(f => f.user_id)
  ])).map(uId => {
    // Find name
    const mapMatch = mindmaps.find(m => m.user_id === uId);
    const cardMatch = flashcards.find(f => f.user_id === uId);
    const profile = mapMatch?.profiles || cardMatch?.profiles;
    return {
      id: uId,
      name: profile?.gmail?.split('@')[0] || 'Peer'
    };
  });

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#03020b] pb-16">
      
      {/* Hero Banner */}
      <div className="w-full bg-gradient-to-b from-indigo-950/20 to-transparent border-b border-white/5 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1.5 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Dashboard</span>
            </button>
            <h1 className="text-2xl md:text-3xl font-extrabold font-outfit text-slate-100 flex items-center space-x-2">
              <ClipboardCheck className="h-7 w-7 text-indigo-400" />
              <span>Activity Dashboard</span>
            </h1>
            <p className="text-xs text-slate-400 max-w-2xl font-light">
              Session review, scores, and AI generated learnings for: <span className="text-slate-200 font-semibold">{room.schedule.milestone}</span>
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs text-slate-400 bg-white/5 border border-white/5 rounded-xl px-4 py-2">
              <Calendar className="h-4 w-4 text-indigo-400" />
              <span>{new Date(session.timer_end_at).toLocaleDateString()}</span>
            </div>
            
            <button
              onClick={handleCopyShareLink}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center space-x-2 transition shadow-lg shadow-indigo-500/20"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>{copiedShare ? 'Copied Link!' : 'Share Leaderboard'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-6xl w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Hand: Personal Report & Leaderboard (Col 7) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* AI Personal Study Report */}
          <div className="glass-panel rounded-3xl p-6 relative overflow-hidden border-l-4 border-l-indigo-500">
            <div className="absolute top-0 right-0 h-20 w-20 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center space-x-2.5 text-indigo-400 font-bold text-xs uppercase tracking-wider mb-4">
              <Sparkles className="h-4.5 w-4.5" />
              <span>AI Summarized Personal Report</span>
            </div>

            {isReportLoading ? (
              <div className="py-6 space-y-3">
                <div className="h-4 bg-white/5 rounded w-3/4 animate-pulse" />
                <div className="h-4 bg-white/5 rounded w-5/6 animate-pulse" />
                <div className="h-4 bg-white/5 rounded w-1/2 animate-pulse" />
              </div>
            ) : report ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl">
                    <h4 className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Key Strength</h4>
                    <p className="text-xs text-slate-200 mt-1.5 font-light leading-normal">{report.keyStrength}</p>
                  </div>
                  <div className="p-4 bg-indigo-500/5 border border-indigo-500/15 rounded-2xl">
                    <h4 className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Area of Growth</h4>
                    <p className="text-xs text-slate-200 mt-1.5 font-light leading-normal">{report.areasOfGrowth}</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-950/40 border border-white/5 rounded-2xl">
                  <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Focus Performance Summary</h4>
                  <p className="text-xs text-slate-300 mt-2 font-light leading-relaxed select-text">{report.summary}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Failed to compile AI insights.</p>
            )}
          </div>

          {/* Session Leaderboard */}
          <div className="glass-panel rounded-3xl p-6 space-y-5">
            <div>
              <h3 className="text-lg font-bold font-outfit text-slate-100 flex items-center space-x-2">
                <Trophy className="h-5 w-5 text-amber-500" />
                <span>Session Leaderboard</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">Based on correct test answers and submission speeds.</p>
            </div>

            {/* Best Performer Spotlight */}
            {bestPerformer && (
              <div className="p-4 bg-gradient-to-r from-amber-500/10 to-purple-600/10 border border-amber-500/20 rounded-2xl flex items-center justify-between">
                <div className="flex items-center space-x-3.5">
                  <div className="h-10 w-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
                    <Trophy className="h-5.5 w-5.5" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-extrabold text-amber-400 tracking-widest">Best Performer</span>
                    <h4 className="text-sm font-bold text-slate-200 mt-0.5">
                      {bestPerformer.profiles?.gmail.split('@')[0]}
                    </h4>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base font-extrabold text-amber-400">{bestPerformer.score} / 100</span>
                  <p className="text-[9px] text-slate-500">In {bestPerformer.time_taken} seconds</p>
                </div>
              </div>
            )}

            {/* Leaderboard Table */}
            <div className="space-y-2 pt-2">
              {leaderboard.map((res, index) => {
                const isMe = res.user_id === currentUser.id;
                return (
                  <div 
                    key={res.id} 
                    className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition duration-200 ${
                      isMe 
                        ? 'bg-indigo-500/5 border-indigo-500/30' 
                        : 'bg-slate-950/40 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center space-x-3.5">
                      <span className={`w-5 text-center font-bold font-mono text-sm ${
                        index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-amber-700' : 'text-slate-600'
                      }`}>
                        #{index + 1}
                      </span>
                      
                      <div className="leading-tight">
                        <span className="font-semibold text-slate-200">
                          {res.profiles?.gmail.split('@')[0]}
                        </span>
                        {isMe && <span className="ml-2 text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-medium">Me</span>}
                        <p className="text-[9px] text-slate-500 mt-0.5">ID: {res.profiles?.student_id.substring(0, 8)}...</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-6 text-right">
                      <div>
                        <span className="font-bold text-slate-200">In {res.time_taken}s</span>
                        <p className="text-[8px] text-slate-500 uppercase">Duration</p>
                      </div>
                      <div>
                        <span className="font-extrabold text-indigo-400 text-sm">{res.score}%</span>
                        <p className="text-[8px] text-slate-500 uppercase">Score</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Hand: Shared Tools & Chat Transcript (Col 5) */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* Shared Tools Viewer */}
          <div className="glass-panel rounded-3xl p-6 space-y-5">
            <div>
              <h3 className="text-lg font-bold font-outfit text-slate-100 flex items-center space-x-2">
                <Brain className="h-5 w-5 text-indigo-400" />
                <span>Shared Study Tools</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                View study maps and flashcard sets generated by other students during this session.
              </p>
            </div>

            {/* Dropdown selectors */}
            {toolGenerators.length > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-1.5 rounded-xl border border-white/5">
                  <button
                    onClick={() => setActiveToolTab('mindmap')}
                    className={`py-2 text-xs font-bold rounded-lg transition ${
                      activeToolTab === 'mindmap' 
                        ? 'bg-indigo-500 text-white' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Mindmaps
                  </button>
                  <button
                    onClick={() => setActiveToolTab('flashcard')}
                    className={`py-2 text-xs font-bold rounded-lg transition ${
                      activeToolTab === 'flashcard' 
                        ? 'bg-indigo-500 text-white' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Flashcards
                  </button>
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-500">Student Generator:</span>
                  <select
                    value={selectedUserForTools}
                    onChange={(e) => setSelectedUserForTools(e.target.value)}
                    className="bg-slate-900 border border-white/10 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
                  >
                    {toolGenerators.map((gen) => (
                      <option key={gen.id} value={gen.id}>
                        {gen.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rendered Tool */}
                <div className="border-t border-white/5 pt-4">
                  {activeToolTab === 'mindmap' ? (
                    selectedMindmap ? (
                      <MindmapView code={selectedMindmap.mermaid_code} />
                    ) : (
                      <p className="text-xs text-slate-500 text-center py-8">Selected student did not generate a mindmap.</p>
                    )
                  ) : (
                    selectedFlashcards ? (
                      <FlashcardsView cards={selectedFlashcards.cards_json} />
                    ) : (
                      <p className="text-xs text-slate-500 text-center py-8">Selected student did not generate flashcards.</p>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-10 border border-white/5 bg-slate-950/20 rounded-2xl text-slate-500 text-xs">
                No mindmaps or flashcards were generated during this study round.
              </div>
            )}
          </div>

          {/* Session Chat transcript */}
          <div className="glass-panel rounded-3xl p-6 space-y-4 flex flex-col max-h-[400px]">
            <h3 className="text-sm font-bold text-slate-200 flex items-center space-x-2 font-outfit border-b border-white/5 pb-3">
              <MessageSquare className="h-4.5 w-4.5 text-indigo-400" />
              <span>Decorum Chat Archives</span>
            </h3>

            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs scrollbar-thin">
              {chats.map((msg) => {
                const isMentor = msg.user_id === null;
                return (
                  <div key={msg.id} className="space-y-1">
                    <div className="flex items-center justify-between text-[9px] text-slate-500">
                      <span className={isMentor ? 'text-indigo-400 font-bold' : 'font-medium'}>
                        {isMentor ? 'AI Mentor' : msg.profiles?.gmail.split('@')[0]}
                      </span>
                      <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className={`p-2.5 rounded-xl text-slate-300 font-light select-text leading-relaxed ${
                      isMentor 
                        ? 'bg-indigo-950/20 border border-indigo-500/10 text-indigo-200' 
                        : 'bg-white/5 border border-white/5'
                    } ${msg.is_offtopic ? 'border-red-500 text-red-300 bg-red-950/10' : ''}`}>
                      {msg.message}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
