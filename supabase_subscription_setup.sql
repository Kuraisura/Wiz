-- PayMongo + GCash Subscription Setup
-- Run this in Supabase SQL Editor

-- Add subscription_plan column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free';

-- Update existing users to have free plan
UPDATE profiles SET subscription_plan = 'free' WHERE subscription_plan IS NULL;

-- Add check constraint
ALTER TABLE profiles ADD CONSTRAINT profiles_subscription_plan_check
  CHECK (subscription_plan IN ('free', 'pro'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_plan ON profiles(subscription_plan);

-- Create a subscriptions table for PayMongo tracking
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS on subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "Users can view own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own subscription
CREATE POLICY "Users can insert own subscription" ON subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscription
CREATE POLICY "Users can update own subscription" ON subscriptions
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can update subscriptions (for webhooks)
CREATE POLICY "Service role updates subscriptions" ON subscriptions
  FOR UPDATE USING (true);

-- Function to sync subscription_plan to profiles
CREATE OR REPLACE FUNCTION sync_subscription_plan()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET subscription_plan = NEW.plan WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-sync plan changes
DROP TRIGGER IF EXISTS on_subscription_change ON subscriptions;
CREATE TRIGGER on_subscription_change
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION sync_subscription_plan();

-- PayMongo webhook events table (for tracking and idempotency)
CREATE TABLE IF NOT EXISTS paymongo_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  paymongo_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE paymongo_events ENABLE ROW LEVEL SECURITY;

-- Only service role can manage paymongo events (webhooks)
CREATE POLICY "Service role manages paymongo events" ON paymongo_events
  FOR ALL USING (true);

-- Checkout sessions table (to track pending payments)
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

CREATE POLICY "Users can view own checkout sessions" ON checkout_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own checkout sessions" ON checkout_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role updates checkout sessions" ON checkout_sessions
  FOR UPDATE USING (true);
