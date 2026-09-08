import React, { useState } from "react";
import { Pencil, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/supabaseClient";

export default function ProfileCard({ user, profile, stats }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [major, setMajor] = useState(profile?.major || "Not Set");
  const [graduationYear, setGraduationYear] = useState(profile?.graduation_year || "Not Set");
  const [saving, setSaving] = useState(false);

  const name = profile?.full_name || user?.email?.split("@")[0] || "Student";
  const email = user?.email || "";
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user?.id, major, graduation_year: graduationYear }, { onConflict: 'id' });
      if (error) throw error;
      toast({ title: "Profile updated" });
      setOpen(false);
    } catch (err) {
      toast({ title: "Update failed", description: "Please try again later.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-3xl bg-card border border-border shadow-sm p-6 flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-violet-500 text-primary-foreground flex items-center justify-center text-2xl font-bold shadow-lg shadow-primary/25">
        {initials}
      </div>
      <h2 className="text-xl font-bold text-foreground mt-3">{name}</h2>
      <p className="text-sm text-muted-foreground">{email}</p>
      <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-accent px-3 py-1.5 rounded-full">
        <GraduationCap className="w-3.5 h-3.5" />
        {profile?.major && profile?.graduation_year
          ? `${profile.major} \u2022 Class of ${profile.graduation_year}`
          : profile?.major || (profile?.graduation_year ? `Class of ${profile.graduation_year}` : "Not Set")}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="mt-4 rounded-full h-9 px-5 text-xs font-semibold">
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Profile
          </Button>
        </DialogTrigger>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="major">Major</Label>
              <Input id="major" value={major} onChange={(e) => setMajor(e.target.value)} className="rounded-xl h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="graduationYear">Class of</Label>
              <Input id="graduationYear" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)} className="rounded-xl h-11" />
            </div>
            <Button className="w-full rounded-xl h-11 font-semibold" onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-3 gap-3 w-full mt-6 pt-5 border-t border-border">
        <div>
          <p className="text-lg font-bold text-foreground">{stats?.flashcards.toLocaleString() || "0"}</p>
          <p className="text-[11px] text-muted-foreground">Flashcards</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{stats?.daily_streak || 0} d</p>
          <p className="text-[11px] text-muted-foreground">Daily Streak</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{stats?.mastery || 0}%</p>
          <p className="text-[11px] text-muted-foreground">Mastery</p>
        </div>
      </div>
    </div>
  );
}