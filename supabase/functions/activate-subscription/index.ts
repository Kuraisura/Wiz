import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, type } = await req.json();

    if (!userId) {
      throw new Error("Missing userId");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // === DIRECT TRIAL ACTIVATION (no PayMongo needed) ===
    if (type === "trial") {
      // Check if profile already has an active pro plan
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_plan, trial_ends_at")
        .eq("id", userId)
        .single();

      // Already pro with active trial
      if (profile?.subscription_plan === "pro" && profile?.trial_ends_at) {
        const trialEnd = new Date(profile.trial_ends_at);
        if (trialEnd > new Date()) {
          return new Response(
            JSON.stringify({ activated: true, plan: "pro", trialEndsAt: profile.trial_ends_at }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }
      }

      // Already pro (paid)
      if (profile?.subscription_plan === "pro" && !profile?.trial_ends_at) {
        return new Response(
          JSON.stringify({ activated: true, plan: "pro", reason: "already_pro" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      // Already has pro_trial with active trial
      if (profile?.subscription_plan === "pro_trial" && profile?.trial_ends_at) {
        const trialEnd = new Date(profile.trial_ends_at);
        if (trialEnd > new Date()) {
          return new Response(
            JSON.stringify({ activated: true, plan: "pro_trial", trialEndsAt: profile.trial_ends_at }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }
      }

      // Trial already used (has trial_ends_at in the past)
      if (profile?.trial_ends_at) {
        const trialEnd = new Date(profile.trial_ends_at);
        if (trialEnd <= new Date()) {
          return new Response(
            JSON.stringify({ activated: false, error: "Free trial already used. Please subscribe." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
          );
        }
      }

      // Activate trial — 3 days from now
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 3);

      // Update profiles table with pro_trial state
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          subscription_plan: "pro_trial",
          trial_ends_at: trialEnd.toISOString(),
        })
        .eq("id", userId);

      if (profileError) {
        console.error("Profile update error:", profileError.message);
        throw new Error("Failed to activate trial: " + profileError.message);
      }

      // Try to upsert subscriptions table
      try {
        await supabase.from("subscriptions").upsert(
          {
            user_id: userId,
            plan: "pro_trial",
            status: "active",
            amount: 0,
            currency: "PHP",
            current_period_start: now.toISOString(),
            current_period_end: trialEnd.toISOString(),
            trial_ended_at: trialEnd.toISOString(),
            updated_at: now.toISOString(),
          },
          { onConflict: "user_id" }
        );
      } catch (subErr) {
        console.warn("subscriptions table may not exist, skipping:", subErr.message);
      }

      return new Response(
        JSON.stringify({
          activated: true,
          plan: "pro_trial",
          isTrial: true,
          trialEndsAt: trialEnd.toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // === PAID SUBSCRIPTION CHECK ===
    // Check profiles directly first (source of truth)
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_plan, trial_ends_at")
      .eq("id", userId)
      .single();

    if (profile?.subscription_plan === "pro") {
      return new Response(
        JSON.stringify({ activated: true, plan: "pro", source: "profile" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // pro_trial with active trial is also considered activated
    if (profile?.subscription_plan === "pro_trial" && profile?.trial_ends_at) {
      const trialEnd = new Date(profile.trial_ends_at);
      if (trialEnd > new Date()) {
        return new Response(
          JSON.stringify({ activated: true, plan: "pro_trial", source: "profile_trial" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    // Try subscriptions table
    try {
      const { data: existingSub } = await supabase
        .from("subscriptions")
        .select("plan, status")
        .eq("user_id", userId)
        .single();

      if (existingSub?.plan === "pro" && existingSub?.status === "active") {
        await supabase
          .from("profiles")
          .update({ subscription_plan: "pro" })
          .eq("id", userId);

        return new Response(
          JSON.stringify({ activated: true, plan: "pro", source: "subscription" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    } catch (e) {
      console.warn("subscriptions table query failed:", e.message);
    }

    // Try checkout_sessions table
    try {
      const { data: sessions } = await supabase
        .from("checkout_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (sessions && sessions.length > 0) {
        const paymongoSecretKey = Deno.env.get("PAYMONGO_SECRET_KEY");

        for (const session of sessions) {
          if (session.status === "paid") {
            const now = new Date();

            // Handle pro_trial checkout (₱0 trial)
            if (session.plan === "pro_trial" || session.amount === 0) {
              const trialEnd = new Date(now);
              trialEnd.setDate(trialEnd.getDate() + 3);

              await supabase.from("subscriptions").upsert(
                {
                  user_id: userId,
                  paymongo_checkout_id: session.paymongo_checkout_id,
                  plan: "pro_trial",
                  status: "active",
                  amount: 0,
                  currency: session.currency,
                  current_period_start: now.toISOString(),
                  current_period_end: trialEnd.toISOString(),
                  trial_ended_at: trialEnd.toISOString(),
                  updated_at: now.toISOString(),
                },
                { onConflict: "user_id" }
              );

              await supabase
                .from("profiles")
                .update({ subscription_plan: "pro_trial", trial_ends_at: trialEnd.toISOString() })
                .eq("id", userId);

              return new Response(
                JSON.stringify({ activated: true, plan: "pro_trial", isTrial: true, trialEndsAt: trialEnd.toISOString(), source: "checkout_trial" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
              );
            }

            // Handle paid pro checkout (₱279)
            const periodEnd = new Date(now);
            periodEnd.setMonth(periodEnd.getMonth() + 1);

            await supabase.from("subscriptions").upsert(
              {
                user_id: userId,
                paymongo_checkout_id: session.paymongo_checkout_id,
                plan: "pro",
                status: "active",
                amount: session.amount,
                currency: session.currency,
                current_period_start: now.toISOString(),
                current_period_end: periodEnd.toISOString(),
                updated_at: now.toISOString(),
              },
              { onConflict: "user_id" }
            );

            await supabase
              .from("profiles")
              .update({ subscription_plan: "pro", trial_ends_at: null })
              .eq("id", userId);

            return new Response(
              JSON.stringify({ activated: true, plan: "pro", source: "checkout_paid" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
            );
          }

          if (session.paymongo_checkout_id && paymongoSecretKey) {
            try {
              const response = await fetch(
                `https://api.paymongo.com/v1/checkout_sessions/${session.paymongo_checkout_id}`,
                {
                  headers: {
                    Accept: "application/json",
                    Authorization: `Basic ${btoa(paymongoSecretKey + ":")}`,
                  },
                }
              );

              const data = await response.json();
              const checkoutStatus = data.data?.attributes?.status;

              if (checkoutStatus === "paid") {
                const now = new Date();

                // Handle pro_trial checkout (₱0 trial)
                if (session.plan === "pro_trial" || session.amount === 0) {
                  const trialEnd = new Date(now);
                  trialEnd.setDate(trialEnd.getDate() + 3);

                  await supabase
                    .from("checkout_sessions")
                    .update({ status: "paid", updated_at: now.toISOString() })
                    .eq("id", session.id);

                  await supabase.from("subscriptions").upsert(
                    {
                      user_id: userId,
                      paymongo_checkout_id: session.paymongo_checkout_id,
                      plan: "pro_trial",
                      status: "active",
                      amount: 0,
                      currency: session.currency,
                      current_period_start: now.toISOString(),
                      current_period_end: trialEnd.toISOString(),
                      trial_ended_at: trialEnd.toISOString(),
                      updated_at: now.toISOString(),
                    },
                    { onConflict: "user_id" }
                  );

                  await supabase
                    .from("profiles")
                    .update({ subscription_plan: "pro_trial", trial_ends_at: trialEnd.toISOString() })
                    .eq("id", userId);

                  return new Response(
                    JSON.stringify({ activated: true, plan: "pro_trial", isTrial: true, trialEndsAt: trialEnd.toISOString(), source: "paymongo_verified_trial" }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
                  );
                }

                // Handle paid pro checkout (₱279)
                const periodEnd = new Date(now);
                periodEnd.setMonth(periodEnd.getMonth() + 1);

                await supabase
                  .from("checkout_sessions")
                  .update({ status: "paid", updated_at: now.toISOString() })
                  .eq("id", session.id);

                await supabase.from("subscriptions").upsert(
                  {
                    user_id: userId,
                    paymongo_checkout_id: session.paymongo_checkout_id,
                    plan: "pro",
                    status: "active",
                    amount: session.amount,
                    currency: session.currency,
                    current_period_start: now.toISOString(),
                    current_period_end: periodEnd.toISOString(),
                    updated_at: now.toISOString(),
                  },
                  { onConflict: "user_id" }
                );

                await supabase
                  .from("profiles")
                  .update({ subscription_plan: "pro", trial_ends_at: null })
                  .eq("id", userId);

                return new Response(
                  JSON.stringify({ activated: true, plan: "pro", source: "paymongo_verified" }),
                  { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
                );
              }
            } catch (apiErr) {
              console.error("PayMongo API check failed:", apiErr.message);
            }
          }
        }
      }
    } catch (e) {
      console.warn("checkout_sessions table query failed:", e.message);
    }

    return new Response(
      JSON.stringify({ activated: false, plan: "free", reason: "no_paid_sessions" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
