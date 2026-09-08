-- 1. Update Profiles Table with missing columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS major TEXT DEFAULT 'Not Set',
ADD COLUMN IF NOT EXISTS graduation_year TEXT DEFAULT 'Not Set',
ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'Free Plan',
ADD COLUMN IF NOT EXISTS daily_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS mastery_percentage INTEGER DEFAULT 0;

-- 2. Add a column to track last study date for streak calculation
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_studied_at TIMESTAMPTZ;

-- 3. Ensure RLS is still active for the new columns
-- (Existing policies on 'profiles' table already cover this as they are row-based)
