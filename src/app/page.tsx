'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/supabase';
import { Globe, Shield, Award, Users, BookOpen, Target, Sparkles } from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [devMode, setDevMode] = useState(true); // Toggle to show mock login for developer
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Check if user is already logged in (only once on mount)
    let isMounted = true;
    const checkAuth = async () => {
      try {
        const user = await db.auth.getCurrentUser();
        if (isMounted && user) {
          window.location.href = '/dashboard';
        }
      } catch (error) {
        console.error('Error checking auth:', error);
      }
    };
    
    checkAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      // In real supabase, we would call:
      // await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/dashboard' } })
      // For this implementation, we will use a fallback mock Google login or direct bypass
      const mockEmail = `google_user_${Math.floor(Math.random() * 1000)}@gmail.com`;
      const profile = await db.auth.signInMock(mockEmail);
      if (profile) {
        // Use window.location for more reliable navigation
        window.location.href = '/dashboard';
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Google Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMockLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (!email.includes('@')) {
      setErrorMsg('Please enter a valid Gmail address');
      return;
    }
    
    setIsLoading(true);
    setErrorMsg('');
    try {
      const profile = await db.auth.signInMock(email);
      if (profile) {
        // Use window.location for more reliable navigation
        window.location.href = '/dashboard';
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden bg-[#03020b]">
      {/* Decorative Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between border-b border-white/5 z-10">
        <div className="flex items-center space-x-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 font-outfit">
            SYNAPSE
          </span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-xs text-indigo-400 font-semibold px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
            v1.0 Dev Active
          </span>
        </div>
      </header>

      {/* Hero Body */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 py-16 items-center z-10">
        
        {/* Left Side: Copywriting & Features */}
        <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
          <div className="inline-flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-xs text-indigo-300 font-medium">
            <Shield className="h-3.5 w-3.5" />
            <span>Anti-Cheat & AI Moderation Enabled</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight font-outfit leading-tight">
            Study Together, <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-emerald-400 text-glow-indigo">
              Stay Accountable.
            </span>
          </h1>

          <p className="text-slate-400 text-lg md:text-xl max-w-2xl font-light leading-relaxed">
            Synapse re-engineers group study rooms. Synchronized peer timers, custom AI character mentors, interactive mindmaps/flashcards, and anti-cheat assessments keep you hyper-focused and consistent.
          </p>

          {/* Feature Grid */}
          <div className="grid grid-cols-2 gap-4 mt-8 text-left">
            <div className="flex items-start space-x-3 p-3 bg-white/5 border border-white/5 rounded-xl">
              <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 mt-0.5">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Synced Timers</h3>
                <p className="text-xs text-slate-500">Shared focus rounds.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 bg-white/5 border border-white/5 rounded-xl">
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 mt-0.5">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">AI Mentors</h3>
                <p className="text-xs text-slate-500">Moderates chats & decorum.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 bg-white/5 border border-white/5 rounded-xl">
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400 mt-0.5">
                <Award className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Leaderboards</h3>
                <p className="text-xs text-slate-500">Points & performance metrics.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 bg-white/5 border border-white/5 rounded-xl">
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 mt-0.5">
                <BookOpen className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">AI Summaries</h3>
                <p className="text-xs text-slate-500">Mindmaps & Flashcards.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Auth Form */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-md glass-panel rounded-3xl p-8 relative">
            <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2 bg-emerald-500 text-[#03020b] text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-lg">
              Live Mock Fallback
            </div>

            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold font-outfit">Join the Circle</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Authenticate to assign your secure Student ID
                </p>
              </div>

              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-xs px-4 py-3 rounded-xl">
                  {errorMsg}
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-4">
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center space-x-3 bg-white text-slate-900 font-bold py-3.5 px-4 rounded-xl hover:bg-slate-100 transition duration-200 disabled:opacity-50"
                >
                  <Globe className="h-5 w-5 text-red-500" />
                  <span>Continue with Google</span>
                </button>

                {devMode && (
                  <div className="border-t border-white/10 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                        Developer Bypass Login
                      </span>
                    </div>

                    <form onSubmit={handleMockLogin} className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">
                          Personal Gmail Address
                        </label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="e.g. alex@gmail.com"
                          className="w-full bg-slate-950/65 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-100"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading || !email}
                        className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-3 px-4 rounded-xl hover:from-indigo-600 hover:to-purple-700 transition duration-200 disabled:opacity-50 shadow-lg shadow-indigo-500/20 flex items-center justify-center space-x-2"
                      >
                        <Target className="h-4 w-4" />
                        <span>Sign In as Student</span>
                      </button>
                    </form>
                  </div>
                )}
              </div>

              <div className="text-center pt-2">
                <span className="text-[11px] text-slate-500">
                  By logging in, you agree to follow the study decorum enforced by the AI Mentors. Off-topic chats will incur point deductions.
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-white/5 py-6 text-center text-slate-500 text-xs z-10">
        © 2026 Synapse Study Platform. Engineered for absolute focus.
      </footer>
    </div>
  );
}
