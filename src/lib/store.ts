import { create } from 'zustand';
import { db, isMock, shouldUseMock, subscribeToMockEvents, broadcastMockEvent, supabase } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface RoomState {
  roomId: string | null;
  userId: string | null;
  currentRoom: any | null;
  session: any | null;
  members: any[];
  messages: any[];
  hasUnreadMessages: boolean;
  activeNotification: string | null;
  
  // Actions
  initRoom: (roomId: string, userId: string) => Promise<void>;
  leaveRoom: () => void;
  sendMessage: (text: string) => Promise<void>;
  requestExtension: () => Promise<void>;
  voteExtension: () => Promise<void>;
  triggerNotification: (message: string) => void;
  clearNotification: () => void;
  markMessagesRead: () => void;
  setSessionStatus: (status: string) => Promise<void>;
  saveQuizQuestions: (questions: any) => Promise<void>;
}

let supabaseChannel: RealtimeChannel | null = null;
let mockUnsubscribe: (() => void) | null = null;
let notificationIntervalId: ReturnType<typeof setInterval> | null = null;

export const useRoomStore = create<RoomState>((set, get) => {
  const fetchRoomDetails = async (roomId: string) => {
    try {
      const room = await db.rooms.getById(roomId);
      const members = await db.roomMembers.list(roomId);
      
      // Determine or get session
      let session = null;
      if (room) {
        session = await db.sessions.getOrCreate(roomId, room.schedule.duration || 60);
      }
      
      let messages: any[] = [];
      if (session) {
        messages = await db.chats.list(session.id);
      }

      set({ currentRoom: room, members, session, messages });
    } catch (e) {
      console.error("Error loading room details:", e);
    }
  };

  return {
    roomId: null,
    userId: null,
    currentRoom: null,
    session: null,
    members: [],
    messages: [],
    hasUnreadMessages: false,
    activeNotification: null,

    initRoom: async (roomId: string, userId: string) => {
      set({ roomId, userId, hasUnreadMessages: false });
      
      // 1. Join room
      await db.roomMembers.join(roomId, userId);
      // Mark as showed up
      await db.roomMembers.setShowedUp(roomId, userId, true);

      // 2. Fetch room data
      await fetchRoomDetails(roomId);

      // 3. Setup real-time listening
      if (shouldUseMock()) {
        // Mock Realtime Sync
        mockUnsubscribe = subscribeToMockEvents((event) => {
          const { type, payload } = event;
          
          if (type === 'CHAT_MESSAGE_SENT' && payload.sessionId === get().session?.id) {
            set((state) => {
              const isSender = payload.message.user_id === get().userId;
              return {
                messages: [...state.messages, payload.message],
                hasUnreadMessages: !isSender // Only show red dot if message is from someone else
              };
            });
          } else if (type === 'MEMBER_JOINED' && payload.roomId === roomId) {
            db.roomMembers.list(roomId).then(members => set({ members }));
          } else if (type === 'MEMBER_UPDATED' && payload.roomId === roomId) {
            db.roomMembers.list(roomId).then(members => set({ members }));
          } else if (type === 'SESSION_UPDATED' && payload.id === get().session?.id) {
            set({ session: payload });
          } else if (type === 'POINTS_CHANGED' && payload.roomId === roomId) {
            db.roomMembers.list(roomId).then(members => set({ members }));
            
            // Pop up point message at random times (or when points change)
            const profiles = get().members.find(m => m.user_id === payload.userId)?.profiles;
            const name = profiles?.gmail || "Someone";
            if (payload.type === 'addition') {
              get().triggerNotification(`Hey, your study mate "${name}" just scored ${payload.amount} points by completing the schedule, catch up with him!`);
            } else if (payload.type === 'deduction') {
              get().triggerNotification(`Warning: "${name}" just lost ${payload.amount} points.`);
            }
          }
        });
      } else {
        // Supabase Realtime Sync
        if (supabase) {
          const activeSessionId = get().session?.id;
          
          supabaseChannel = supabase
            .channel(`room:${roomId}`)
            .on('postgres_changes', { event: '*', filter: `room_id=eq.${roomId}`, schema: 'public', table: 'room_members' }, async () => {
              const members = await db.roomMembers.list(roomId);
              set({ members });
            })
            .on('postgres_changes', { event: '*', filter: `id=eq.${activeSessionId}`, schema: 'public', table: 'sessions' }, (payload) => {
              set({ session: payload.new });
            })
            .on('postgres_changes', { event: 'INSERT', filter: `session_id=eq.${activeSessionId}`, schema: 'public', table: 'chat_messages' }, (payload) => {
              set((state) => {
                const isSender = payload.new.user_id === get().userId;
                return {
                  messages: [...state.messages, payload.new],
                  hasUnreadMessages: !isSender
                };
              });
            })
            .subscribe();
        }
      }

      // Automatically trigger random peer notification to promote competitive spirit
      if (notificationIntervalId) clearInterval(notificationIntervalId);
      notificationIntervalId = setInterval(() => {
        const state = get();
        if (state.members.length > 1) {
          const otherMembers = state.members.filter(m => m.user_id !== state.userId);
          if (otherMembers.length > 0) {
            const randomMember = otherMembers[Math.floor(Math.random() * otherMembers.length)];
            const name = randomMember.profiles?.gmail?.split('@')[0] || "Your peer";
            const randomPoints = [10, 15, 20, 25][Math.floor(Math.random() * 4)];
            state.triggerNotification(`Hey, your study mate "${name}" just scored ${randomPoints} points by completing the schedule, catch up with him!`);
          }
        }
      }, 90000); // every 90s
    },

    leaveRoom: () => {
      const state = get();
      if (state.roomId && state.userId) {
        db.roomMembers.setShowedUp(state.roomId, state.userId, false);
      }
      if (notificationIntervalId) {
        clearInterval(notificationIntervalId);
        notificationIntervalId = null;
      }
      if (shouldUseMock()) {
        mockUnsubscribe?.();
      } else {
        supabaseChannel?.unsubscribe();
      }
      set({ roomId: null, currentRoom: null, session: null, members: [], messages: [] });
    },

    sendMessage: async (text: string) => {
      const state = get();
      if (!state.session || !state.userId) return;
      
      // Save message
      await db.chats.send(state.session.id, state.userId, text);
    },

    requestExtension: async () => {
      // Logic for extending timer
      const state = get();
      if (!state.session || !state.roomId) return;

      const extensionCount = state.session.extension_count || 0;
      const newDuration = 15 * 60; // Extend by 15 mins
      
      // Add 15 minutes to the current session end time if it is in the future, otherwise from now
      const currentEnd = new Date(state.session.timer_end_at).getTime();
      const baseTime = currentEnd > Date.now() ? currentEnd : Date.now();
      const newTimerEndAt = new Date(baseTime + newDuration * 1000).toISOString();

      if (extensionCount === 0) {
        // First extension: Free
        await db.sessions.update(state.session.id, {
          timer_end_at: newTimerEndAt,
          extension_count: 1
        });
      } else {
        // Subsequent extensions: Deduct 5 points from everyone in room
        const activeMembers = state.members;
        for (const member of activeMembers) {
          await db.roomMembers.deductPoints(state.roomId, member.user_id, 5);
        }
        await db.sessions.update(state.session.id, {
          timer_end_at: newTimerEndAt,
          extension_count: extensionCount + 1
        });
      }
    },

    voteExtension: async () => {
      // Just vote to extend (in simple mode we auto-extend when requested)
      const state = get();
      state.requestExtension();
    },

    triggerNotification: (message: string) => {
      set({ activeNotification: message });
    },

    clearNotification: () => {
      set({ activeNotification: null });
    },

    markMessagesRead: () => {
      set({ hasUnreadMessages: false });
    },

    setSessionStatus: async (status: string) => {
      const state = get();
      if (!state.session) return;
      const updated = await db.sessions.update(state.session.id, { status });
      set({ session: updated });
    },

    saveQuizQuestions: async (questions: any) => {
      const state = get();
      if (!state.session) return;
      const updated = await db.sessions.update(state.session.id, { quiz_questions: questions });
      set({ session: updated });
    }
  };
});
