'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/supabase';
import { Trophy, Calendar, Sparkles, BookOpen, Clock, Users, ArrowRight } from 'lucide-react';

export default function ShareLeaderboardPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<any>(null);
  const [room, setRoom] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSharedResults = async () => {
      try {
        const sessionData = await db.sessions.getById(sessionId);
        setSession(sessionData);

        if (sessionData) {
          const roomData = await db.rooms.getById(sessionData.room_id);
          setRoom(roomData);

          const results = await db.testResults.list(sessionId);
          // Sort results: highest score first, then fastest time
          const sorted = [...results].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.time_taken - b.time_taken;
          });
          setLeaderboard(sorted);
        }
      } catch (e) {
        console.error("Error loading shared leaderboard:", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadSharedResults();
  }, [sessionId]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#03020b] space-y-4">
        <div className="h-10 w-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400">Loading verified leaderboard results...</p>
      </div>
    );
  }

  if (!session || !room) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#03020b] p-6 text-center space-y-4">
        <p className="text-slate-400 text-sm font-semibold">Share link not found or expired.</p>
        <button 
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-xs font-bold"
        >
          Go to Synapse Homepage
        </button>
      </div>
    );
  }

  const bestPerformer = leaderboard[0];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative bg-[#03020b] overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/10 blur-[120px] pointer-events-none" />

      {/* Synapse Logo */}
      <div 
        onClick={() => router.push('/')}
        className="flex items-center space-x-2 mb-8 cursor-pointer z-10 hover:opacity-80 transition"
      >
        <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-black tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 font-outfit">
          SYNAPSE
        </span>
      </div>

      {/* Main Results Card */}
      <div className="w-full max-w-xl glass-panel rounded-3xl p-8 border-l-4 border-l-emerald-500 relative z-10 space-y-6">
        <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2 bg-emerald-500 text-[#03020b] text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-lg">
          Verified Focus Round
        </div>

        <div className="text-center space-y-2">
          <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
            Study Result Card
          </span>
          <h2 className="text-xl md:text-2xl font-extrabold font-outfit text-slate-100 mt-2">
            {room.schedule.milestone}
          </h2>
          
          <div className="flex items-center justify-center space-x-4 text-slate-400 text-xs mt-1.5 font-light">
            <span className="flex items-center space-x-1">
              <Clock className="h-3.5 w-3.5 text-indigo-400" />
              <span>{room.schedule.duration} mins</span>
            </span>
            <span>•</span>
            <span className="flex items-center space-x-1">
              <Users className="h-3.5 w-3.5 text-indigo-400" />
              <span>{leaderboard.length} study mates</span>
            </span>
          </div>
        </div>

        {/* Best Performer spotlight */}
        {bestPerformer && (
          <div className="p-4 bg-gradient-to-r from-amber-500/10 to-purple-600/10 border border-amber-500/20 rounded-2xl flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[9px] uppercase font-extrabold text-amber-400 tracking-widest">Best Performer</span>
                <h4 className="text-xs font-bold text-slate-200 mt-0.5">
                  {bestPerformer.profiles?.gmail.split('@')[0]}
                </h4>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-extrabold text-amber-400">{bestPerformer.score} / 100</span>
              <p className="text-[8px] text-slate-500">In {bestPerformer.time_taken}s</p>
            </div>
          </div>
        )}

        {/* Table representation */}
        <div className="space-y-2">
          <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Scoreboard</h4>
          
          {leaderboard.map((res, index) => (
            <div 
              key={res.id} 
              className="p-3 bg-white/5 border border-white/5 rounded-xl flex items-center justify-between text-xs"
            >
              <div className="flex items-center space-x-3.5">
                <span className={`w-4 text-center font-bold font-mono text-xs ${
                  index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-amber-700' : 'text-slate-600'
                }`}>
                  #{index + 1}
                </span>
                
                <div>
                  <span className="font-semibold text-slate-200">
                    {res.profiles?.gmail.split('@')[0]}
                  </span>
                  <p className="text-[8px] text-slate-500 font-mono">ID: {res.profiles?.student_id.substring(0, 8)}...</p>
                </div>
              </div>

              <div className="flex items-center space-x-5 text-right">
                <div>
                  <span className="font-bold text-slate-200">{res.time_taken}s</span>
                  <p className="text-[8px] text-slate-500 uppercase">Time</p>
                </div>
                <div>
                  <span className="font-extrabold text-indigo-400">{res.score}%</span>
                  <p className="text-[8px] text-slate-500 uppercase">Score</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Promote CTA */}
        <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="leading-tight text-center sm:text-left">
            <h4 className="text-xs font-bold text-slate-300">Want to run focus sessions?</h4>
            <p className="text-[10px] text-slate-400 font-light mt-0.5">Host rooms with custom AI supervisors & synced timers.</p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition shadow-lg shadow-indigo-500/20"
          >
            <span>Try Synapse Free</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <footer className="mt-8 text-center text-slate-600 text-[10px] z-10">
        Verified & Guarded by Synapse Study Decorum Systems.
      </footer>
    </div>
  );
}
