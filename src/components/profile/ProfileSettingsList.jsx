import React, { useEffect, useState } from "react";
import {
  Sun, Moon, Monitor, Bell, KeyRound, CreditCard, Eraser,
  LifeBuoy, MessageSquare, Info, ChevronRight, LogOut,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { Preferences as CapPreferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold tracking-widest text-muted-foreground mb-2">{title}</h3>
      <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden shadow-sm">
        {children}
      </div>
    </section>
  );
}

function Row({ icon: Icon, title, subtitle, right, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/50 active:bg-secondary"
    >
      <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
      </div>
      {right}
    </Tag>
  );
}

const themeOptions = [
  { key: "light", icon: Sun },
  { key: "dark", icon: Moon },
  { key: "system", icon: Monitor },
];

export default function ProfileSettingsList({ user, profile }) {
  const { toast } = useToast();
  const { logout, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => profile?.theme || "system");
  const [reminders, setReminders] = useState(profile?.reminders_enabled ?? true);

  useEffect(() => {
    if (profile?.theme) setTheme(profile.theme);
  }, [profile?.theme]);

  const applyThemeToDOM = (t) => {
    if (t === "dark") document.documentElement.classList.add("dark");
    else if (t === "light") document.documentElement.classList.remove("dark");
    else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", prefersDark);
    }
  };

  const setThemePersisted = async (t) => {
    setTheme(t);
    applyThemeToDOM(t);
    try {
      await supabase.from('profiles').upsert({ id: user?.id, theme: t }, { onConflict: 'id' });
      updateProfile({ theme: t });
    } catch {}
  };

  const setRemindersPersisted = async (v) => {
    setReminders(v);
    try {
      await supabase.from('profiles').upsert({ id: user?.id, reminders_enabled: v }, { onConflict: 'id' });
    } catch {}
  };

  const handleChangePassword = async () => {
    try {
      const newPass = prompt("Enter your new password:");
      if (!newPass) return;
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
    } catch (err) {
      toast({ title: "Failed to update password", description: "Please try again later.", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    toast({ title: "Signed out", description: "You've been successfully logged out." });
    await logout();
  };

  return (
    <div className="space-y-6">
      <Section title="PREFERENCES">
        <Row
          icon={Sun}
          title="App Theme"
          subtitle={theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System default"}
          right={
            <div className="flex items-center gap-0.5 bg-secondary rounded-full p-1">
              {themeOptions.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setThemePersisted(key)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    theme === key ? "bg-card shadow-sm text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          }
        />
        <Row
          icon={Bell}
          title="Study Reminders"
          subtitle="Daily at 08:30 PM"
          right={<Switch checked={reminders} onCheckedChange={setRemindersPersisted} />}
        />
      </Section>

      <Section title="ACCOUNT">
        <Row
          icon={KeyRound}
          title="Change Password"
          subtitle="Secure your account"
          right={<ChevronRight className="w-4 h-4 text-muted-foreground" />}
          onClick={handleChangePassword}
        />
        <Row
          icon={CreditCard}
          title="Manage Subscription"
          subtitle={`Plan: ${profile?.subscription_plan === "pro" ? "Pro Plan" : "Free Plan"}`}
          right={
            <span className="inline-flex items-center gap-1.5">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                profile?.subscription_plan === "pro"
                  ? "text-amber-700 bg-amber-50"
                  : "text-primary bg-accent"
              }`}>
                {profile?.subscription_plan === "pro" ? "Pro Plan" : "Free Plan"}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </span>
          }
          onClick={() => navigate('/subscription')}
        />
        <Row
          icon={Eraser}
          title="Clear Cache"
          subtitle="Free up local storage"
          right={<ChevronRight className="w-4 h-4 text-muted-foreground" />}
          onClick={async () => {
            try {
              // Clear browser localStorage
              localStorage.clear();
              // Clear browser caches
              if (window.caches) {
                const names = await caches.keys();
                await Promise.all(names.map((n) => caches.delete(n)));
              }
              // Clear Capacitor Preferences (app's native key-value store)
              try {
                if (Capacitor.isNativePlatform()) {
                  await CapPreferences.clear();
                }
              } catch {}
              toast({ title: "Cache cleared", description: "Local storage cleared successfully." });
            } catch {
              toast({ title: "Failed to clear cache", variant: "destructive" });
            }
          }}
        />
      </Section>

      <Section title="SUPPORT & INFO">
        <Row
          icon={LifeBuoy}
          title="Help Center"
          subtitle="FAQs and guides"
          right={<ChevronRight className="w-4 h-4 text-muted-foreground" />}
          onClick={() => navigate("/help-center")}
        />
        <Row
          icon={MessageSquare}
          title="Send Feedback"
          subtitle="Report bugs or suggest features"
          right={<ChevronRight className="w-4 h-4 text-muted-foreground" />}
          onClick={() => navigate("/feedback")}
        />
        <Row
          icon={Info}
          title="About Wiz"
          subtitle="v1.0.0"
          right={<ChevronRight className="w-4 h-4 text-muted-foreground" />}
          onClick={() => navigate("/help-center")}
        />
      </Section>

      <Button
        onClick={handleLogout}
        className="w-full h-12 rounded-2xl bg-red-50 text-red-700 hover:bg-red-100 font-semibold shadow-none"
      >
        <LogOut className="w-4 h-4 mr-2" /> Log Out
      </Button>
    </div>
  );
}
