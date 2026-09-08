import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const webhookBody = await req.json();
    const eventType = webhookBody?.data?.type || "unknown";
    const eventData = webhookBody?.data?.attributes || {};
    const eventId = webhookBody?.data?.id;

    console.log(`PayMongo webhook received: ${eventType}`, JSON.stringify(eventData).substring(0, 500));

    // Idempotency check
    if (eventId) {
      const { data: existing } = await supabase
        .from("paymongo_events")
        .select("id")
        .eq("paymongo_event_id", eventId)
        .single();

      if (existing) {
        console.log(`Event ${eventId} already processed, skipping`);
        return new Response("ok", { status: 200 });
      }

      await supabase.from("paymongo_events").insert({
        paymongo_event_id: eventId,
        event_type: eventType,
        payload: webhookBody,
        processed: true,
      });
    }

    // Handle successful payment
    if (eventType === "payment.successful") {
      const paymentStatus = eventData.status;
      const paymentId = eventData.id;
      const amount = eventData.attributes?.amount;
      const currency = eventData.attributes?.currency;

      console.log(`Payment status: ${paymentStatus}, ID: ${paymentId}`);

      if (paymentStatus === "succeeded") {
        // Find the checkout session by payment ID or latest pending
        let session = null;

        // Try to find by payment reference
        const { data: sessions } = await supabase
          .from("checkout_sessions")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);

        if (sessions && sessions.length > 0) {
          session = sessions[0];
        }

        if (session) {
          const now = new Date();

          // Handle pro_trial checkout (₱0 trial)
          if (session.plan === "pro_trial" || session.amount === 0) {
            const trialEnd = new Date(now);
            trialEnd.setDate(trialEnd.getDate() + 3);

            // Update checkout session
            await supabase
              .from("checkout_sessions")
              .update({ status: "paid", updated_at: now.toISOString() })
              .eq("id", session.id);

            // Upsert subscription
            await supabase.from("subscriptions").upsert(
              {
                user_id: session.user_id,
                paymongo_payment_id: paymentId,
                paymongo_checkout_id: session.paymongo_checkout_id,
                plan: "pro_trial",
                status: "active",
                amount: 0,
                currency: currency || session.currency,
                current_period_start: now.toISOString(),
                current_period_end: trialEnd.toISOString(),
                trial_ended_at: trialEnd.toISOString(),
                updated_at: now.toISOString(),
              },
              { onConflict: "user_id" }
            );

            // Update profile
            await supabase
              .from("profiles")
              .update({ subscription_plan: "pro_trial", trial_ends_at: trialEnd.toISOString() })
              .eq("id", session.user_id);

            console.log(`Trial activated for user ${session.user_id}`);
            return new Response("ok", { status: 200 });
          }

          // Handle paid pro checkout (₱279)
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          // Update checkout session
          await supabase
            .from("checkout_sessions")
            .update({ status: "paid", updated_at: now.toISOString() })
            .eq("id", session.id);

          // Upsert subscription
          await supabase.from("subscriptions").upsert(
            {
              user_id: session.user_id,
              paymongo_payment_id: paymentId,
              paymongo_checkout_id: session.paymongo_checkout_id,
              plan: "pro",
              status: "active",
              amount: amount || session.amount,
              currency: currency || session.currency,
              current_period_start: now.toISOString(),
              current_period_end: periodEnd.toISOString(),
              updated_at: now.toISOString(),
            },
            { onConflict: "user_id" }
          );

          // Also directly update profiles as backup
          await supabase
            .from("profiles")
            .update({ subscription_plan: "pro", trial_ends_at: null })
            .eq("id", session.user_id);

          console.log(`Subscription activated for user ${session.user_id}`);
        } else {
          console.warn("No pending checkout session found for payment:", paymentId);
        }
      }
    }

    // Handle checkout session completion (alternative event)
    if (eventType === "checkout_session.completed") {
      const checkoutId = eventData.id;
      console.log(`Checkout session completed: ${checkoutId}`);

      const { data: session } = await supabase
        .from("checkout_sessions")
        .select("*")
        .eq("paymongo_checkout_id", checkoutId)
        .single();

      if (session && session.status === "pending") {
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
              user_id: session.user_id,
              paymongo_checkout_id: checkoutId,
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
            .eq("id", session.user_id);

          console.log(`Trial activated via checkout.completed for user ${session.user_id}`);
          return new Response("ok", { status: 200 });
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
            user_id: session.user_id,
            paymongo_checkout_id: checkoutId,
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
          .eq("id", session.user_id);

        console.log(`Subscription activated via checkout.completed for user ${session.user_id}`);
      }
    }

    // Handle payment failures
    if (eventType === "payment.failed") {
      const paymentId = eventData.id;
      await supabase
        .from("checkout_sessions")
        .update({ status: "failed" })
        .eq("paymongo_payment_id", paymentId);
      console.log(`Payment failed: ${paymentId}`);
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error.message);
    return new Response("error", { status: 500 });
  }
});
