-- Migration: IP-based anti-abuse + trial tracking
-- Run this in Supabase SQL Editor

-- 1. Add trial_ended_at to subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ended_at TIMESTAMPTZ;

-- 2. IP blacklist — blocks known abusers
CREATE TABLE IF NOT EXISTS ip_blacklist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address INET UNIQUE NOT NULL,
  reason TEXT DEFAULT 'trial_abuse',
  blocked_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_by TEXT DEFAULT 'system'
);

ALTER TABLE ip_blacklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages ip blacklist" ON ip_blacklist;
CREATE POLICY "Service role manages ip blacklist"
  ON ip_blacklist FOR ALL USING (true);

-- 3. Trial usage — one trial per IP
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

DROP POLICY IF EXISTS "Service role manages trial usage" ON trial_usage;
CREATE POLICY "Service role manages trial usage"
  ON trial_usage FOR ALL USING (true);

DROP POLICY IF EXISTS "Users can view own trial usage" ON trial_usage;
CREATE POLICY "Users can view own trial usage"
  ON trial_usage FOR SELECT USING (auth.uid() = user_id);

-- 4. Registration tracking — limit accounts per IP
CREATE TABLE IF NOT EXISTS registration_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ip_address INET,
  email TEXT,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE registration_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages registrations" ON registration_tracking;
CREATE POLICY "Service role manages registrations"
  ON registration_tracking FOR ALL USING (true);

-- 5. Device login log — track IP per login
CREATE TABLE IF NOT EXISTS device_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  last_login_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE device_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages device log" ON device_log;
CREATE POLICY "Service role manages device log"
  ON device_log FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ip_blacklist_ip ON ip_blacklist(ip_address);
CREATE INDEX IF NOT EXISTS idx_trial_usage_ip ON trial_usage(ip_address);
CREATE INDEX IF NOT EXISTS idx_registration_tracking_ip ON registration_tracking(ip_address);
CREATE INDEX IF NOT EXISTS idx_device_log_ip ON device_log(ip_address);
