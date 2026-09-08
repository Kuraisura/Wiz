import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HMAC secret for signing Pro tokens — stored as Supabase secret
const SIGNING_SECRET = Deno.env.get("PRO_VERIFY_SECRET") || "wiz-default-verify-secret-change-me";

async function signToken(userId, plan, timestamp) {
  const payload = `${userId}:${plan}:${timestamp}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();

    if (!userId) {
      throw new Error("Missing userId");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check subscription directly from database (bypasses any client-side tampering)
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("subscription_plan, trial_ends_at")
      .eq("id", userId)
      .single();

    if (error || !profile) {
      return new Response(
        JSON.stringify({ isPro: false, reason: "profile_not_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    let isPro = false;

    if (profile.subscription_plan === "pro") {
      // Check if trial has expired (shouldn't happen for pro, but safety check)
      if (profile.trial_ends_at) {
        const trialEnd = new Date(profile.trial_ends_at);
        if (trialEnd > new Date()) {
          isPro = true;
        } else {
          // Trial expired, downgrade
          await supabase
            .from("profiles")
            .update({ subscription_plan: "free", trial_ends_at: null })
            .eq("id", userId);
        }
      } else {
        isPro = true;
      }
    }

    if (profile.subscription_plan === "pro_trial") {
      // Check if trial is still active
      if (profile.trial_ends_at) {
        const trialEnd = new Date(profile.trial_ends_at);
        if (trialEnd > new Date()) {
          isPro = true;
        } else {
          // Trial expired, downgrade to free
          await supabase
            .from("profiles")
            .update({ subscription_plan: "free", trial_ends_at: null })
            .eq("id", userId);
        }
      }
    }

    // Also check subscriptions table
    if (!isPro) {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", userId)
        .single();

      if (sub?.status === "active") {
        if (sub.current_period_end) {
          const periodEnd = new Date(sub.current_period_end);
          if (periodEnd > new Date()) {
            isPro = true;
            // Sync profile
            await supabase
              .from("profiles")
              .update({ subscription_plan: "pro" })
              .eq("id", userId);
          }
        } else {
          isPro = true;
        }
      }
    }

    // Generate signed token so client can cache verification
    const timestamp = Date.now().toString();
    const token = isPro ? await signToken(userId, "pro", timestamp) : null;

    return new Response(
      JSON.stringify({
        isPro,
        token,
        timestamp,
        reason: isPro ? "verified" : "not_pro",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ isPro: false, reason: "error", error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
