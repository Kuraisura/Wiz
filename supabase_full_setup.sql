-- FIX: Add missing columns and tables
-- Run this in Supabase SQL Editor

-- Add missing columns to profiles (safe — won't error if already exists)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS major TEXT DEFAULT 'Not Set';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS graduation_year TEXT DEFAULT 'Not Set';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'system';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_streak INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mastery_percentage INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_studied_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reminder_time TIME DEFAULT '20:30:00';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_difficulty TEXT DEFAULT 'Standard';

-- Ensure subscription_plan constraint
DO $$
BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_subscription_plan_check;
  ALTER TABLE profiles ADD CONSTRAINT profiles_subscription_plan_check
    CHECK (subscription_plan IN ('free', 'pro'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  paymongo_payment_id TEXT,
  paymongo_checkout_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'expired', 'trialing')),
  amount INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'PHP',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
  CREATE POLICY "Users can view own subscription"
    ON subscriptions FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own subscription" ON subscriptions;
  CREATE POLICY "Users can insert own subscription"
    ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role updates subscriptions" ON subscriptions;
  CREATE POLICY "Service role updates subscriptions"
    ON subscriptions FOR UPDATE USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role inserts subscriptions" ON subscriptions;
  CREATE POLICY "Service role inserts subscriptions"
    ON subscriptions FOR INSERT WITH CHECK (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Auto-sync subscription to profiles
CREATE OR REPLACE FUNCTION sync_subscription_plan()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET subscription_plan = NEW.plan WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_subscription_change ON subscriptions;
CREATE TRIGGER on_subscription_change
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION sync_subscription_plan();

-- Checkout sessions table
CREATE TABLE IF NOT EXISTS checkout_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  paymongo_checkout_id TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'pro',
  amount INTEGER NOT NULL DEFAULT 27900,
  currency TEXT NOT NULL DEFAULT 'PHP',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE checkout_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own checkout sessions" ON checkout_sessions;
  CREATE POLICY "Users can view own checkout sessions"
    ON checkout_sessions FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can insert own checkout sessions" ON checkout_sessions;
  CREATE POLICY "Users can insert own checkout sessions"
    ON checkout_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role updates checkout sessions" ON checkout_sessions;
  CREATE POLICY "Service role updates checkout sessions"
    ON checkout_sessions FOR UPDATE USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Paymongo events table
CREATE TABLE IF NOT EXISTS paymongo_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  paymongo_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE paymongo_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role manages paymongo events" ON paymongo_events;
  CREATE POLICY "Service role manages paymongo events"
    ON paymongo_events FOR ALL USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- IP blacklist
CREATE TABLE IF NOT EXISTS ip_blacklist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address INET UNIQUE NOT NULL,
  reason TEXT DEFAULT 'trial_abuse',
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_by TEXT DEFAULT 'system'
);

ALTER TABLE ip_blacklist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role manages ip blacklist" ON ip_blacklist;
  CREATE POLICY "Service role manages ip blacklist"
    ON ip_blacklist FOR ALL USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Trial usage
CREATE TABLE IF NOT EXISTS trial_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ip_address INET,
  trial_started_at TIMESTAMPTZ DEFAULT NOW(),
  trial_ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE trial_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role manages trial usage" ON trial_usage;
  CREATE POLICY "Service role manages trial usage"
    ON trial_usage FOR ALL USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own trial usage" ON trial_usage;
  CREATE POLICY "Users can view own trial usage"
    ON trial_usage FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Registration tracking
CREATE TABLE IF NOT EXISTS registration_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ip_address INET,
  email TEXT,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE registration_tracking ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role manages registrations" ON registration_tracking;
  CREATE POLICY "Service role manages registrations"
    ON registration_tracking FOR ALL USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Device log
CREATE TABLE IF NOT EXISTS device_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  last_login_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE device_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role manages device log" ON device_log;
  CREATE POLICY "Service role manages device log"
    ON device_log FOR ALL USING (true);
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_subscription ON profiles(subscription_plan);
CREATE INDEX IF NOT EXISTS idx_ip_blacklist_ip ON ip_blacklist(ip_address);
CREATE INDEX IF NOT EXISTS idx_trial_usage_ip ON trial_usage(ip_address);
CREATE INDEX IF NOT EXISTS idx_registration_tracking_ip ON registration_tracking(ip_address);
CREATE INDEX IF NOT EXISTS idx_device_log_ip ON device_log(ip_address);
