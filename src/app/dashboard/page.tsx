'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/supabase';
import { MENTORS } from '@/lib/mentors';
import { Clock, Plus, LogOut, Copy, Check, Users, Sparkles, BookOpen, Award, ShieldAlert, Send, Target } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [rooms, setRooms] = useState<any[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  
  // Create Room Form state
  const [milestone, setMilestone] = useState('');
  const [duration, setDuration] = useState(45);
  const [mentor, setMentor] = useState<keyof typeof MENTORS>('loki');
  const [contentText, setContentText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Intent Posts state
  const [intents, setIntents] = useState<any[]>([]);
  const [newIntent, setNewIntent] = useState('');
  const [createError, setCreateError] = useState('');

  // Group Stats Mock
  const totalHoursCompleted = 48.5;
  const targetHours = 50;

  
  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      try {
        const currentUser = await db.auth.getCurrentUser();
        if (!isMounted) return; // Component was unmounted
        if (!currentUser) {
          router.push('/');
        } else {
          setUser(currentUser);
          await loadData();
        }
      } catch (error) {
        console.error('Auth error:', error);
        if (isMounted) {
          router.push('/');
        }
      } finally {
        if (isMounted) {
          setIsAuthChecking(false);
        }
      }
    };
    
    checkAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const loadData = async () => {
    try {
      const roomList = await db.rooms.list();
      setRooms(roomList);
      
      // Load Intents from localStorage
      if (typeof window !== 'undefined') {
        const storedIntents = localStorage.getItem('study_intents');
        if (storedIntents) {
          setIntents(JSON.parse(storedIntents));
        } else {
          const defaultIntents = [
            { id: '1', name: 'alex@gmail.com', text: 'Solve 5 LeetCode Medium questions on DP.', time: '2 mins ago' },
            { id: '2', name: 'sarah@gmail.com', text: 'Finish reading Chapter 4 of OS Database management.', time: '15 mins ago' },
            { id: '3', name: 'student_9@gmail.com', text: 'Drafting presentation slides for machine learning model.', time: '1 hr ago' }
          ];
          localStorage.setItem('study_intents', JSON.stringify(defaultIntents));
          setIntents(defaultIntents);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const copyStudentId = () => {
    if (!user) return;
    navigator.clipboard.writeText(user.student_id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !milestone || !contentText) return;
    
    setIsLoading(true);
    setCreateError('');
    try {
      const newRoom = await db.rooms.create(
        user.id,
        { duration, milestone, mentor },
        contentText
      );
      
      if (newRoom && newRoom.id) {
        // Use window.location for reliable navigation
        window.location.href = `/rooms/${newRoom.id}`;
      } else {
      // newRoom came back null/undefined — surface it
      setCreateError('Room creation returned no data. Check Supabase logs.');
    }
    } catch (e:any) {
      console.error('Create room error:', e);
      setCreateError(e?.message || 'Unknown error creating room.');
      } finally {
    setIsLoading(false); // ALWAYS reset, not just on catch
  }
  };

  const handlePostIntent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIntent.trim() || !user) return;

    const post = {
      id: Date.now().toString(),
      name: user.gmail,
      text: newIntent,
      time: 'Just now'
    };

    const updated = [post, ...intents];
    setIntents(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('study_intents', JSON.stringify(updated));
    }
    setNewIntent('');
  };

  const handleLogout = async () => {
  try {
    await db.auth.signOut();
    // Force clear and hard redirect — don't use router.push
    window.location.href = '/';
  } catch (e) {
    console.error('Logout error:', e);
    window.location.href = '/'; // still redirect even on error
  }
};

  if (isAuthChecking || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#03020b]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen relative bg-[#03020b]">
      {/* Gradients */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-900/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-purple-900/10 blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="w-full border-b border-white/5 bg-slate-950/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-lg font-black tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 font-outfit">
              SYNAPSE
            </span>
          </div>

          <div className="flex items-center space-x-6">
            <div className="hidden sm:flex items-center space-x-3 text-right">
              <div>
                <p className="text-xs font-semibold text-slate-200">{user.gmail}</p>
                <button
                  onClick={copyStudentId}
                  className="text-[10px] text-slate-400 hover:text-indigo-400 flex items-center justify-end space-x-1 mt-0.5"
                >
                  <span className="truncate max-w-[120px]">ID: {user.student_id}</span>
                  {copiedId ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white transition duration-200"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Dashboard Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 z-10">
        
        {/* Left Side: Rooms & Milestones (Col Span 8) */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Group Commitment & Milestone Card */}
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 h-24 w-24 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-sm">
                  <Award className="h-4 w-4" />
                  <span>Active Group Commitment</span>
                </div>
                <h2 className="text-2xl font-bold font-outfit">“This group completed 50 hrs together”</h2>
                <p className="text-xs text-slate-400">
                  Collective reward unlocks special avatar frame themes for everyone in the group.
                </p>
              </div>
              <div className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-xl border border-white/5 min-w-[150px]">
                <span className="text-3xl font-extrabold text-glow-emerald text-emerald-400">
                  {totalHoursCompleted} <span className="text-sm font-light text-slate-400">/ {targetHours} hrs</span>
                </span>
                <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div 
                    className="bg-emerald-400 h-1.5 rounded-full" 
                    style={{ width: `${(totalHoursCompleted / targetHours) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-2">Collective reward progress</span>
              </div>
            </div>
          </div>

          {/* Rooms Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold font-outfit">Study Rooms</h2>
              <p className="text-xs text-slate-400">Join a focus session or spawn a new one</p>
            </div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="bg-indigo-500 text-white hover:bg-indigo-600 font-bold px-4 py-2.5 rounded-xl flex items-center space-x-2 transition duration-200 text-sm shadow-lg shadow-indigo-500/25"
            >
              <Plus className="h-4 w-4" />
              <span>Create Room</span>
            </button>
          </div>

          {/* Rooms Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {rooms.length === 0 ? (
              <div className="col-span-full py-16 text-center glass-panel rounded-2xl space-y-3">
                <BookOpen className="h-10 w-10 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-sm font-medium">No study rooms created yet.</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">Create a room, choose your AI mentor, upload your syllabus materials, and invite your peers to join.</p>
              </div>
            ) : (
              rooms.map((room) => {
                const mentorInfo = MENTORS[room.schedule.mentor as keyof typeof MENTORS] || MENTORS.loki;
                return (
                  <div key={room.id} className="glass-panel glass-panel-hover rounded-2xl p-5 flex flex-col justify-between h-[230px]">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <span className={`text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full border ${
                          room.status === 'active' 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                        }`}>
                          {room.status}
                        </span>
                        
                        <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{room.schedule.duration} mins</span>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-bold text-slate-100 line-clamp-1">{room.schedule.milestone}</h3>
                        <p className="text-xs text-slate-400 line-clamp-2 mt-1 font-light">
                          {room.content_text}
                        </p>
                      </div>
                    </div>

                    {/* Mentor representation & Join */}
                    <div className="flex items-center justify-between border-t border-white/5 pt-4 mt-2">
                      <div className="flex items-center space-x-3">
                        <img 
                          src={mentorInfo.avatar} 
                          alt={mentorInfo.name} 
                          className="h-11 w-11 rounded-full border-2 border-slate-700 bg-slate-900 object-cover"
                        />
                        <div className="leading-tight">
                          <p className="text-xs font-bold text-slate-200">{mentorInfo.name}</p>
                          <p className={`text-[9.5px] mt-0.5 block truncate max-w-[170px] ${mentorInfo.taglineClass || 'text-slate-400 italic font-light'}`}>{mentorInfo.tagline}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => (window.location.href = `/rooms/${room.id}`)}
                        className="bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white border border-indigo-500/20 hover:border-transparent font-semibold text-xs px-3.5 py-2 rounded-xl transition duration-200"
                      >
                        Join Room
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Intent Wall (Col Span 4) */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Study Points card */}
          <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-emerald-500">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase">Your Focus Points</p>
                <p className="text-xs text-slate-500 mt-0.5">Points deducted for breaking rules or missing slots</p>
              </div>
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <Award className="h-6 w-6 text-emerald-400" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline space-x-2">
              <span className="text-4xl font-extrabold text-slate-100">100</span>
              <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">+100 Base</span>
            </div>
          </div>

          {/* Social Commitment Intent Wall */}
          <div className="glass-panel rounded-2xl p-5 flex flex-col h-[500px]">
            <div className="border-b border-white/5 pb-4 mb-4">
              <h3 className="font-bold text-slate-200 flex items-center space-x-2 font-outfit">
                <Target className="h-4.5 w-4.5 text-indigo-400" />
                <span>Study Intent Wall</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Post your target for this session. Public posts create social commitment.
              </p>
            </div>

            {/* Posting form */}
            <form onSubmit={handlePostIntent} className="mb-4">
              <div className="flex items-center space-x-2 bg-slate-950/60 border border-white/10 rounded-xl p-1.5 focus-within:border-indigo-500 transition duration-200">
                <input
                  type="text"
                  required
                  value={newIntent}
                  onChange={(e) => setNewIntent(e.target.value)}
                  placeholder="What will you complete in this session?"
                  className="flex-1 bg-transparent text-xs text-slate-200 px-2 py-2 focus:outline-none placeholder-slate-500"
                />
                <button
                  type="submit"
                  disabled={!newIntent.trim()}
                  className="p-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg transition duration-200"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>

            {/* Scrolling list */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {intents.map((intent) => (
                <div key={intent.id} className="p-3 bg-white/5 border border-white/5 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-indigo-400 truncate max-w-[120px]">
                      {intent.name.split('@')[0]}
                    </span>
                    <span className="text-[9px] text-slate-500">{intent.time}</span>
                  </div>
                  <p className="text-xs text-slate-300 font-light italic">
                    “{intent.text}”
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CREATE ROOM MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="glass-panel w-full max-w-2xl rounded-3xl p-8 relative my-8">
            <h2 className="text-2xl font-extrabold font-outfit mb-2">Create Virtual Study Room</h2>
            <p className="text-xs text-slate-400 mb-6">Set up your milestone goals and choose your AI supervisor.</p>

            <form onSubmit={handleCreateRoom} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                    Session Milestone (Main Goal)
                  </label>
                  <input
                    type="text"
                    required
                    value={milestone}
                    onChange={(e) => setMilestone(e.target.value)}
                    placeholder="e.g. Master React Server Components"
                    className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                    Duration (Minutes)
                  </label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100"
                  >
                    <option value={25}>25 Minutes (Pomodoro)</option>
                    <option value={45}>45 Minutes (Short Study)</option>
                    <option value={60}>60 Minutes (Standard Study)</option>
                    <option value={90}>90 Minutes (Deep Focus)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                  AI Mentor / Supervisor Choice
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(MENTORS).map(([key, mentorData]) => {
                    const isSelected = mentor === key;
                    return (
                      <div
                        key={key}
                        onClick={() => setMentor(key as any)}
                        className={`p-3 rounded-xl border-2 cursor-pointer flex flex-col items-center justify-center text-center space-y-1.5 transition-all ${
                          isSelected
                            ? 'bg-indigo-500/10 border-indigo-500'
                            : 'bg-slate-950/40 border-white/5 hover:border-white/20'
                        }`}
                      >
                        <img
                          src={mentorData.avatar}
                          alt={mentorData.name}
                          className="h-10 w-10 rounded-full object-cover border-2 border-slate-700 bg-slate-900"
                        />
                        <div className="leading-tight">
                          <p className="text-[10px] font-bold text-slate-200">
                            {mentorData.name.replace(/[,(\-\/].*$/, '').trim()}
                          </p>
                          <p className={`text-[8px] leading-snug mt-1 block ${mentorData.taglineClass || 'text-slate-400 italic'}`}>
                            {mentorData.tagline}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase">
                  Syllabus Study Content Text
                </label>
                <textarea
                  required
                  rows={5}
                  value={contentText}
                  onChange={(e) => setContentText(e.target.value)}
                  placeholder="Paste the documentation, notes, or chapter material you plan to cover. The AI mentor will ask doubts from this, check your chat messages, and generate the final quiz based on this text."
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100 font-light resize-none"
                />
              </div>
              {createError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                  Error: {createError}
                </p>
              )}

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-500/25 flex items-center space-x-2"
                >
                  {isLoading ? 'Spawning...' : 'Create & Launch Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
