import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/supabaseClient';
import { recordDevice } from '@/lib/antiAbuse';
import { Preferences as CapPreferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

let Preferences = null;
function getPrefs() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!Preferences) Preferences = CapPreferences;
  return Preferences;
}

async function saveSubscriptionLocally(plan) {
  try {
    const P = getPrefs();
    if (P) await P.set({ key: 'local-subscription-plan', value: plan });
  } catch {}
}

async function loadSubscriptionLocally() {
  try {
    const P = getPrefs();
    if (P) { const r = await P.get({ key: 'local-subscription-plan' }); return r?.value || null; }
  } catch {}
  return null;
}

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState(null);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return; }
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (data) {
        setProfile(data);
        await saveSubscriptionLocally(data.subscription_plan || 'free');
      } else {
        // New user — pull name from Google/GitHub metadata if available
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const meta = authUser?.user_metadata || {};
        const fullName = meta.full_name || meta.name || meta.preferred_username || "";
        const avatar = meta.avatar_url || meta.picture || "";
        const email = authUser?.email || "";

        const { data: created } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            full_name: fullName,
            avatar_url: avatar,
            email: email,
            subscription_plan: 'free',
          }, { onConflict: 'id' })
          .select()
          .single();
        setProfile(created);
        if (created) await saveSubscriptionLocally(created.subscription_plan || 'free');
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      // Fallback: load subscription from local storage
      const localPlan = await loadSubscriptionLocally();
      if (localPlan) {
        setProfile(prev => prev ? { ...prev, subscription_plan: localPlan } : null);
      }
    }
  }, []);

  const updateProfile = useCallback((patch) => {
    setProfile(prev => {
      const next = prev ? { ...prev, ...patch } : prev;
      if (patch.subscription_plan) {
        saveSubscriptionLocally(patch.subscription_plan);
      }
      return next;
    });
  }, []);

  // Update streak when user studies (quiz, flashcards, etc.)
  const updateStreak = useCallback(async () => {
    if (!user?.id) return;
    const now = new Date().toISOString();
    const today = new Date().toISOString().split('T')[0];
    try {
      const lastStudied = profile?.last_studied_at;
      const lastDate = lastStudied ? lastStudied.split('T')[0] : null;
      let newStreak = profile?.daily_streak || 0;

      if (lastDate === today) {
        // Already studied today, don't increment
      } else if (lastDate) {
        const lastTime = new Date(lastStudied).getTime();
        const diffDays = Math.floor((Date.now() - lastTime) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          // Consecutive day
          newStreak += 1;
        } else if (diffDays > 1) {
          // Streak broken
          newStreak = 1;
        }
      } else {
        // First time studying
        newStreak = 1;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ last_studied_at: now, daily_streak: newStreak })
        .eq('id', user.id);
      if (error) throw error;
      setProfile(prev => prev ? { ...prev, last_studied_at: now, daily_streak: newStreak } : prev);
    } catch (err) {
      console.error('Failed to update streak:', err);
    }
  }, [user, profile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      setIsAuthenticated(!!session);
      setIsLoadingAuth(false);
      setAuthChecked(true);

      if (session?.user) {
        // Ensure profile exists — auto-create for new OAuth users
        await loadProfile(session.user.id);
        // Record device for anti-abuse tracking
        if (event === 'SIGNED_IN') {
          recordDevice(session.user.id).catch(() => {});
        }
      } else {
        setProfile(null);
      }

      // Clean URL after OAuth redirect
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const hash = window.location.hash;
        if (hash.includes('access_token') || hash.includes('code=')) {
          window.history.replaceState(null, '', '/');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);
      setIsAuthenticated(!!user);
      if (user) loadProfile(user.id);
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    setProfile(null);
    window.location.hash = '#/login';
  };

  const navigateToLogin = () => {
    window.location.hash = '#/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      updateProfile,
      updateStreak,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: null,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState: checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
