-- Migration: Add pro_trial subscription state
-- Run this in Supabase SQL Editor

-- 1. Drop the old check constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_subscription_plan_check;

-- 2. Add new check constraint with pro_trial
ALTER TABLE profiles ADD CONSTRAINT profiles_subscription_plan_check
  CHECK (subscription_plan IN ('free', 'pro_trial', 'pro'));

-- 3. Update subscriptions table plan constraint
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('free', 'pro_trial', 'pro'));

-- 4. Update the sync function to handle pro_trial
CREATE OR REPLACE FUNCTION sync_subscription_plan()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET subscription_plan = NEW.plan WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
