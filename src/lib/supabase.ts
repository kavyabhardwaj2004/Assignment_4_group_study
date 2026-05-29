import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Detect if keys are placeholders or invalid
export const isMock = 
  !supabaseUrl || 
  supabaseUrl.includes('your-project') || 
  !supabaseAnonKey || 
  supabaseAnonKey.includes('your_anon_key');

// Initialize real Supabase client only if keys are valid
export const supabase = isMock
  ? null
  : createClient(supabaseUrl, supabaseAnonKey);

// --- Broadcast Channel for Mock Realtime Sync ---
const mockChannelName = 'study_room_realtime';
let mockBroadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined') {
  mockBroadcastChannel = new BroadcastChannel(mockChannelName);
}

export const broadcastMockEvent = (type: string, payload: any) => {
  if (mockBroadcastChannel) {
    mockBroadcastChannel.postMessage({ type, payload, sender: typeof window !== 'undefined' ? window.name || 'tab_' + Math.random() : '' });
  }
};

export const subscribeToMockEvents = (callback: (event: { type: string; payload: any }) => void) => {
  if (!mockBroadcastChannel) return () => {};
  const handler = (event: MessageEvent) => {
    callback(event.data);
  };
  mockBroadcastChannel.addEventListener('message', handler);
  return () => {
    mockBroadcastChannel?.removeEventListener('message', handler);
  };
};

// --- LocalStorage Mock DB Helpers ---
const getStorageItem = <T>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  const item = localStorage.getItem(key);
  return item ? JSON.parse(item) : defaultValue;
};

const setStorageItem = <T>(key: string, value: T): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

// UUID Generator for mock client
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Helper: Determine if we should use the mock (localStorage) database
export const shouldUseMock = (): boolean => {
  if (isMock) return true;
  if (typeof window !== 'undefined') {
    return !!localStorage.getItem('study_current_user');
  }
  return false;
};

// Helper: Get Mock Current Session/User
export const getMockUser = () => {
  if (typeof window === 'undefined') return null;
  const currentUser = getStorageItem<any>('study_current_user', null);
  return currentUser;
};

// Unified DB Service Layer
export const db = {
  // 1. Auth Operations
  auth: {
    async getCurrentUser() {
      // If mock user is logged in, respect it first
      const mockUser = getMockUser();
      if (mockUser) return mockUser;

      // If real Supabase keys exist and no mock user, check real Supabase
      if (!isMock) {
        if (!supabase) return null;
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return null;
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          return profile || { id: user.id, gmail: user.email, student_id: user.id };
        } catch (e) {
          console.error("Error getting real Supabase user:", e);
          return null;
        }
      }

      return null;
    },

    async signInMock(email: string) {
      if (!isMock) {
        console.warn('Real Supabase active, but signing in with dev mock.');
      }
      const profiles = getStorageItem<any[]>('study_profiles', []);
      let profile = profiles.find((p) => p.gmail.toLowerCase() === email.toLowerCase());
      if (!profile) {
        profile = {
          id: generateUUID(),
          gmail: email,
          student_id: generateUUID(),
          created_at: new Date().toISOString()
        };
        profiles.push(profile);
        setStorageItem('study_profiles', profiles);
      }
      setStorageItem('study_current_user', profile);
      broadcastMockEvent('USER_SIGNED_IN', profile);
      return profile;
    },

    async signOut() {
      // Always wipe mock user
      localStorage.removeItem('study_current_user');
      broadcastMockEvent('USER_SIGNED_OUT', null);

      if (!isMock && supabase) {
        try {
          await supabase.auth.signOut();
        } catch (e) {
          console.error("Error signing out from Supabase:", e);
        }
      }
    },
  },

  // 2. Room Operations
  rooms: {
    async create(userId: string, schedule: { duration: number; milestone: string; mentor: string }, contentText: string) {
      if (shouldUseMock()) {
        const rooms = getStorageItem<any[]>('study_rooms', []);
        const newRoom = {
          id: generateUUID(),
          created_by: userId,
          schedule: schedule,
          content_text: contentText,
          status: 'scheduled',
          created_at: new Date().toISOString()
        };
        rooms.push(newRoom);
        setStorageItem('study_rooms', rooms);

        // Auto join creator
        await db.roomMembers.join(newRoom.id, userId);
        broadcastMockEvent('ROOM_CREATED', newRoom);
        return newRoom;
      }

      if (!supabase) throw new Error('Supabase client not initialized');
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          created_by: userId,
          schedule,
          content_text: contentText,
          status: 'scheduled'
        })
        .select()
        .single();

      if (error) throw error;
      // Auto join creator
      await db.roomMembers.join(data.id, userId);
      return data;
    },

    async list() {
      if (shouldUseMock()) {
        return getStorageItem<any[]>('study_rooms', []);
      }
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('rooms')
        .select('*, profiles(gmail, student_id)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },

    async getById(roomId: string) {
      if (shouldUseMock()) {
        const rooms = getStorageItem<any[]>('study_rooms', []);
        const room = rooms.find((r) => r.id === roomId);
        if (!room) return null;
        // Fetch creator details
        const profiles = getStorageItem<any[]>('study_profiles', []);
        const creator = profiles.find((p) => p.id === room.created_by) || { gmail: 'Unknown', student_id: room.created_by };
        return { ...room, creator };
      }
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('rooms')
        .select('*, profiles(gmail, student_id)')
        .eq('id', roomId)
        .single();
      if (error) return null;
      return data;
    }
  },

  // 3. Room Member Operations
  roomMembers: {
    async join(roomId: string, userId: string) {
      if (shouldUseMock()) {
        const members = getStorageItem<any[]>('study_room_members', []);
        const exists = members.some((m) => m.room_id === roomId && m.user_id === userId);
        if (!exists) {
          members.push({
            room_id: roomId,
            user_id: userId,
            points: 100,
            showed_up: false,
            joined_at: new Date().toISOString()
          });
          setStorageItem('study_room_members', members);
        }
        broadcastMockEvent('MEMBER_JOINED', { roomId, userId });
        return;
      }
      if (!supabase) return;
      await supabase.from('room_members').upsert({
        room_id: roomId,
        user_id: userId,
        points: 100,
        showed_up: false
      });
    },

    async list(roomId: string) {
      if (shouldUseMock()) {
        const members = getStorageItem<any[]>('study_room_members', []);
        const filtered = members.filter((m) => m.room_id === roomId);
        const profiles = getStorageItem<any[]>('study_profiles', []);
        return filtered.map((m) => {
          const profile = profiles.find((p) => p.id === m.user_id) || { gmail: 'Guest', student_id: m.user_id };
          return { ...m, profiles: profile };
        });
      }
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('room_members')
        .select('*, profiles(gmail, student_id)')
        .eq('room_id', roomId);
      if (error) throw error;
      return data;
    },

    async setShowedUp(roomId: string, userId: string, showedUp: boolean) {
      if (shouldUseMock()) {
        const members = getStorageItem<any[]>('study_room_members', []);
        const mIdx = members.findIndex((m) => m.room_id === roomId && m.user_id === userId);
        if (mIdx !== -1) {
          members[mIdx].showed_up = showedUp;
          setStorageItem('study_room_members', members);
        }
        broadcastMockEvent('MEMBER_UPDATED', { roomId, userId, showed_up: showedUp });
        return;
      }
      if (!supabase) return;
      await supabase
        .from('room_members')
        .update({ showed_up: showedUp })
        .match({ room_id: roomId, user_id: userId });
    },

    async deductPoints(roomId: string, userId: string, amount: number) {
      if (shouldUseMock()) {
        const members = getStorageItem<any[]>('study_room_members', []);
        const mIdx = members.findIndex((m) => m.room_id === roomId && m.user_id === userId);
        if (mIdx !== -1) {
          members[mIdx].points = Math.max(0, members[mIdx].points - amount);
          setStorageItem('study_room_members', members);
          broadcastMockEvent('POINTS_CHANGED', { roomId, userId, points: members[mIdx].points, amount, type: 'deduction' });
        }
        return;
      }
      if (!supabase) return;
      await supabase.rpc('deduct_points', {
        p_room_id: roomId,
        p_user_id: userId,
        p_amount: amount
      });
    },

    async addPoints(roomId: string, userId: string, amount: number) {
      if (shouldUseMock()) {
        const members = getStorageItem<any[]>('study_room_members', []);
        const mIdx = members.findIndex((m) => m.room_id === roomId && m.user_id === userId);
        if (mIdx !== -1) {
          members[mIdx].points = members[mIdx].points + amount;
          setStorageItem('study_room_members', members);
          broadcastMockEvent('POINTS_CHANGED', { roomId, userId, points: members[mIdx].points, amount, type: 'addition' });
        }
        return;
      }
      if (!supabase) return;
      const { data: member } = await supabase
        .from('room_members')
        .select('points')
        .match({ room_id: roomId, user_id: userId })
        .single();
      if (member) {
        await supabase
          .from('room_members')
          .update({ points: (member.points || 0) + amount })
          .match({ room_id: roomId, user_id: userId });
      }
    }
  },

  // 4. Session Operations
  sessions: {
    async getOrCreate(roomId: string, durationMinutes: number) {
      if (shouldUseMock()) {
        const sessions = getStorageItem<any[]>('study_sessions', []);
        let session = sessions.find((s) => s.room_id === roomId && s.status !== 'completed');
        if (!session) {
          session = {
            id: generateUUID(),
            room_id: roomId,
            timer_duration: durationMinutes * 60,
            timer_end_at: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString(),
            extension_count: 0,
            status: 'active',
            quiz_questions: null
          };
          sessions.push(session);
          setStorageItem('study_sessions', sessions);
          
          // Update room status to active
          const rooms = getStorageItem<any[]>('study_rooms', []);
          const rIdx = rooms.findIndex((r) => r.id === roomId);
          if (rIdx !== -1) {
            rooms[rIdx].status = 'active';
            setStorageItem('study_rooms', rooms);
          }
          broadcastMockEvent('SESSION_STARTED', session);
        }
        return session;
      }

      if (!supabase) throw new Error('Supabase not initialized');
      const { data: existing } = await supabase
        .from('sessions')
        .select('*')
        .eq('room_id', roomId)
        .neq('status', 'completed')
        .maybeSingle();

      if (existing) return existing;

      // Create new
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          room_id: roomId,
          timer_duration: durationMinutes * 60,
          timer_end_at: new Date(Date.now() + durationMinutes * 60 * 1000).toISOString(),
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;
      
      // Update room status
      await supabase.from('rooms').update({ status: 'active' }).eq('id', roomId);
      return data;
    },

    async getById(sessionId: string) {
      if (shouldUseMock()) {
        const sessions = getStorageItem<any[]>('study_sessions', []);
        return sessions.find((s) => s.id === sessionId) || null;
      }
      if (!supabase) return null;
      const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
      return data;
    },

    async update(sessionId: string, updates: Partial<any>) {
      if (shouldUseMock()) {
        const sessions = getStorageItem<any[]>('study_sessions', []);
        const idx = sessions.findIndex((s) => s.id === sessionId);
        if (idx !== -1) {
          sessions[idx] = { ...sessions[idx], ...updates };
          setStorageItem('study_sessions', sessions);
          broadcastMockEvent('SESSION_UPDATED', sessions[idx]);
          return sessions[idx];
        }
        return null;
      }
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('sessions')
        .update(updates)
        .eq('id', sessionId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  // 5. Chat Operations
  chats: {
    async list(sessionId: string) {
      if (shouldUseMock()) {
        const chats = getStorageItem<any[]>('study_chat_messages', []);
        const filtered = chats.filter((c) => c.session_id === sessionId);
        const profiles = getStorageItem<any[]>('study_profiles', []);
        return filtered.map((c) => {
          const profile = profiles.find((p) => p.id === c.user_id) || { gmail: c.user_id === 'system' ? 'System' : 'Mentor', student_id: c.user_id };
          return { ...c, profiles: profile };
        });
      }
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*, profiles(gmail, student_id)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },

    async send(sessionId: string, userId: string | null, message: string, isOfftopic: boolean = false) {
      const newMessage = {
        id: generateUUID(),
        session_id: sessionId,
        user_id: userId, // null indicates system/AI mentor
        message,
        is_offtopic: isOfftopic,
        created_at: new Date().toISOString()
      };

      if (shouldUseMock()) {
        const chats = getStorageItem<any[]>('study_chat_messages', []);
        chats.push(newMessage);
        setStorageItem('study_chat_messages', chats);
        broadcastMockEvent('CHAT_MESSAGE_SENT', { sessionId, message: newMessage });
        return newMessage;
      }

      if (!supabase) throw new Error('Supabase not initialized');
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          user_id: userId,
          message,
          is_offtopic: isOfftopic
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // 6. Test Result Operations
  testResults: {
    async save(sessionId: string, userId: string, answers: any, score: number, timeTaken: number) {
      const result = {
        id: generateUUID(),
        session_id: sessionId,
        user_id: userId,
        answers,
        score,
        time_taken: timeTaken,
        submitted_at: new Date().toISOString()
      };

      if (shouldUseMock()) {
        const results = getStorageItem<any[]>('study_test_results', []);
        const existingIdx = results.findIndex(r => r.session_id === sessionId && r.user_id === userId);
        if (existingIdx !== -1) {
          results[existingIdx] = result;
        } else {
          results.push(result);
        }
        setStorageItem('study_test_results', results);
        broadcastMockEvent('TEST_SUBMITTED', { sessionId, userId, score, result });
        return result;
      }

      if (!supabase) throw new Error('Supabase not initialized');
      const { data, error } = await supabase
        .from('test_results')
        .upsert({
          session_id: sessionId,
          user_id: userId,
          answers,
          score,
          time_taken: timeTaken
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async list(sessionId: string) {
      if (shouldUseMock()) {
        const results = getStorageItem<any[]>('study_test_results', []);
        const filtered = results.filter((r) => r.session_id === sessionId);
        const profiles = getStorageItem<any[]>('study_profiles', []);
        return filtered.map((r) => {
          const profile = profiles.find((p) => p.id === r.user_id) || { gmail: 'Guest', student_id: r.user_id };
          return { ...r, profiles: profile };
        });
      }
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('test_results')
        .select('*, profiles(gmail, student_id)')
        .eq('session_id', sessionId);
      if (error) throw error;
      return data;
    }
  },

  // 7. Mindmap Operations
  mindmaps: {
    async save(sessionId: string, userId: string, mermaidCode: string) {
      const mindmap = {
        id: generateUUID(),
        session_id: sessionId,
        user_id: userId,
        mermaid_code: mermaidCode
      };

      if (shouldUseMock()) {
        const mindmaps = getStorageItem<any[]>('study_mindmaps', []);
        const existingIdx = mindmaps.findIndex(m => m.session_id === sessionId && m.user_id === userId);
        if (existingIdx !== -1) {
          mindmaps[existingIdx] = mindmap;
        } else {
          mindmaps.push(mindmap);
        }
        setStorageItem('study_mindmaps', mindmaps);
        broadcastMockEvent('MINDMAP_GENERATED', { sessionId, userId });
        return mindmap;
      }

      if (!supabase) throw new Error('Supabase not initialized');
      const { data, error } = await supabase
        .from('mindmaps')
        .upsert({
          session_id: sessionId,
          user_id: userId,
          mermaid_code: mermaidCode
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async list(sessionId: string) {
      if (shouldUseMock()) {
        const mindmaps = getStorageItem<any[]>('study_mindmaps', []);
        const filtered = mindmaps.filter((m) => m.session_id === sessionId);
        const profiles = getStorageItem<any[]>('study_profiles', []);
        return filtered.map((m) => {
          const profile = profiles.find((p) => p.id === m.user_id) || { gmail: 'Guest', student_id: m.user_id };
          return { ...m, profiles: profile };
        });
      }
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('mindmaps')
        .select('*, profiles(gmail, student_id)')
        .eq('session_id', sessionId);
      if (error) throw error;
      return data;
    }
  },

  // 8. Flashcard Operations
  flashcards: {
    async save(sessionId: string, userId: string, cardsJson: any) {
      const flashcard = {
        id: generateUUID(),
        session_id: sessionId,
        user_id: userId,
        cards_json: cardsJson
      };

      if (shouldUseMock()) {
        const flashcards = getStorageItem<any[]>('study_flashcards', []);
        const existingIdx = flashcards.findIndex(f => f.session_id === sessionId && f.user_id === userId);
        if (existingIdx !== -1) {
          flashcards[existingIdx] = flashcard;
        } else {
          flashcards.push(flashcard);
        }
        setStorageItem('study_flashcards', flashcards);
        broadcastMockEvent('FLASHCARDS_GENERATED', { sessionId, userId });
        return flashcard;
      }

      if (!supabase) throw new Error('Supabase not initialized');
      const { data, error } = await supabase
        .from('flashcards')
        .upsert({
          session_id: sessionId,
          user_id: userId,
          cards_json: cardsJson
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async list(sessionId: string) {
      if (shouldUseMock()) {
        const flashcards = getStorageItem<any[]>('study_flashcards', []);
        const filtered = flashcards.filter((f) => f.session_id === sessionId);
        const profiles = getStorageItem<any[]>('study_profiles', []);
        return filtered.map((f) => {
          const profile = profiles.find((p) => p.id === f.user_id) || { gmail: 'Guest', student_id: f.user_id };
          return { ...f, profiles: profile };
        });
      }
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('flashcards')
        .select('*, profiles(gmail, student_id)')
        .eq('session_id', sessionId);
      if (error) throw error;
      return data;
    }
  }
};
