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
    const { userId, email, amount, currency, type, siteUrl: clientSiteUrl } = await req.json();

    if (!userId || !email) {
      throw new Error("Missing required fields: userId, email");
    }

    const paymongoSecretKey = Deno.env.get("PAYMONGO_SECRET_KEY");
    if (!paymongoSecretKey) {
      throw new Error("PAYMONGO_SECRET_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Prefer client-provided siteUrl, then env var, then fallback
    const siteUrl = clientSiteUrl || Deno.env.get("SITE_URL") || "http://localhost:5173";

    // Determine amount based on type
    // trial = ₱0, subscribe = ₱279
    const isTrial = type === "trial";
    const checkoutAmount = isTrial ? 0 : (amount || 27900);
    const description = isTrial
      ? "Wiz Pro - 3 Day Free Trial (₱0)"
      : "Wiz Pro Plan Subscription";

    const checkoutPayload = {
      data: {
        attributes: {
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          line_items: [
            {
              name: isTrial ? "Wiz Pro - Free Trial" : "Wiz Pro Plan - Monthly",
              description: isTrial
                ? "3-day free trial. Cancel anytime before trial ends."
                : "AI-powered quiz generation, auto-flashcards, and more",
              amount: checkoutAmount,
              currency: currency || "PHP",
              quantity: 1,
            },
          ],
          payment_method_types: ["gcash"],
          success_method: "redirect",
          cancel_method: "redirect",
          success_url: `${siteUrl}/#/subscription?status=success&type=${isTrial ? "trial" : "subscribe"}`,
          cancel_url: `${siteUrl}/#/subscription?status=cancelled`,
          description: description,
        },
      },
    };

    const response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${btoa(paymongoSecretKey + ":")}`,
      },
      body: JSON.stringify(checkoutPayload),
    });

    const checkoutData = await response.json();

    if (!response.ok || checkoutData.errors) {
      console.error("PayMongo error:", JSON.stringify(checkoutData));
      throw new Error(checkoutData.errors?.[0]?.detail || "Failed to create checkout session");
    }

    const checkoutId = checkoutData.data?.id;
    const checkoutUrl = checkoutData.data?.attributes?.checkout_url;

    if (!checkoutUrl) {
      throw new Error("No checkout URL returned");
    }

    // Record the checkout session
    await supabase.from("checkout_sessions").insert({
      user_id: userId,
      paymongo_checkout_id: checkoutId,
      plan: isTrial ? "pro_trial" : "pro",
      amount: checkoutAmount,
      currency: currency || "PHP",
      status: "pending",
    });

    return new Response(
      JSON.stringify({ checkoutUrl, checkoutId }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
