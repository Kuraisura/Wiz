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
    const { userId, isTrial } = await req.json();

    if (!userId) {
      throw new Error("Missing userId");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (isTrial) {
      // Trial cancellation: keep Pro until trial expires
      const { error: subError } = await supabase
        .from("subscriptions")
        .update({
          status: "trialing",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      if (subError) {
        console.error("Subscription update error:", subError);
      }

      // DON'T update profile - keep subscription_plan as 'pro_trial' and trial_ends_at intact
      // The verify-pro function will auto-downgrade when trial expires

      return new Response(
        JSON.stringify({ success: true, plan: "pro_trial", message: "Trial cancelled but remains active until expiry" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Paid subscription cancellation: immediate downgrade
    const { error: subError } = await supabase
      .from("subscriptions")
      .update({
        status: "canceled",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (subError) {
      console.error("Subscription update error:", subError);
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        subscription_plan: "free",
        trial_ends_at: null,
      })
      .eq("id", userId);

    if (profileError) {
      console.error("Profile update error:", profileError);
    }

    return new Response(
      JSON.stringify({ success: true, plan: "free" }),
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
