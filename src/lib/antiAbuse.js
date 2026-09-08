// ---------------------------------------------------------------------------
// antiAbuse.js – IP-based abuse prevention
// Simple IP tracking: max accounts per IP, one trial per IP
// ---------------------------------------------------------------------------

import { supabase } from "@/supabaseClient";

let cachedIP = null;

/**
 * Get user's public IP address (cached after first call).
 */
export async function getUserIP() {
  if (cachedIP) return cachedIP;

  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    cachedIP = data.ip || null;
    return cachedIP;
  } catch {
    return null;
  }
}

/**
 * Check if registration should be blocked by IP.
 * Max 3 accounts per IP address.
 */
export async function canRegisterNewAccount(email) {
  const ip = await getUserIP();

  try {
    // Check IP blacklist
    if (ip) {
      const { data: blacklisted } = await supabase
        .from("ip_blacklist")
        .select("id, reason")
        .eq("ip_address", ip)
        .single();

      if (blacklisted) {
        return { allowed: false, reason: "This network has been restricted. Please contact support." };
      }
    }

    // Check if email already registered
    if (email) {
      const { data: existingUser } = await supabase
        .from("registration_tracking")
        .select("user_id")
        .eq("email", email)
        .single();

      if (existingUser) {
        return { allowed: false, reason: "An account with this email already exists. Please sign in." };
      }
    }

    // Check IP registration count (max 3)
    if (ip) {
      const { count } = await supabase
        .from("registration_tracking")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", ip);

      if (count >= 3) {
        return {
          allowed: false,
          reason: "Maximum accounts reached from this network. Please contact support.",
        };
      }
    }

    return { allowed: true, reason: null };
  } catch (err) {
    console.error("[AntiAbuse] canRegisterNewAccount error:", err);
    return { allowed: true, reason: null }; // Fail open
  }
}

/**
 * Record account registration.
 */
export async function recordRegistration(userId, email) {
  const ip = await getUserIP();

  try {
    await supabase.from("registration_tracking").upsert(
      {
        user_id: userId,
        ip_address: ip,
        email: email,
      },
      { onConflict: "user_id" }
    );
  } catch (err) {
    console.warn("[AntiAbuse] Failed to record registration:", err.message);
  }
}

/**
 * Check if this IP already used a trial.
 */
export async function hasIPUseadTrial() {
  const ip = await getUserIP();

  try {
    if (!ip) return { used: false, isActive: false, trialEndsAt: null };

    const { data } = await supabase
      .from("trial_usage")
      .select("id, trial_ends_at, is_active")
      .eq("ip_address", ip)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (data) {
      return {
        used: true,
        isActive: data.is_active,
        trialEndsAt: data.trial_ends_at,
      };
    }

    return { used: false, isActive: false, trialEndsAt: null };
  } catch {
    return { used: false, isActive: false, trialEndsAt: null };
  }
}

/**
 * Record trial usage for this IP.
 */
export async function recordTrialUsage(userId, trialEndsAt) {
  const ip = await getUserIP();

  try {
    await supabase.from("trial_usage").upsert(
      {
        user_id: userId,
        ip_address: ip,
        trial_ends_at: trialEndsAt,
        is_active: true,
      },
      { onConflict: "user_id" }
    );
  } catch (err) {
    console.warn("[AntiAbuse] Failed to record trial usage:", err.message);
  }
}

/**
 * Record device login for tracking.
 */
export async function recordDevice(userId) {
  const ip = await getUserIP();

  try {
    await supabase.from("device_log").upsert(
      {
        user_id: userId,
        ip_address: ip,
        user_agent: navigator.userAgent,
      },
      { onConflict: "user_id" }
    );
  } catch (err) {
    console.warn("[AntiAbuse] Failed to record device:", err.message);
  }
}

/**
 * Block an IP (admin action).
 */
export async function blockIP(ipAddress, reason = "abuse") {
  try {
    await supabase.from("ip_blacklist").upsert(
      {
        ip_address: ipAddress,
        reason: reason,
      },
      { onConflict: "ip_address" }
    );
    return true;
  } catch (err) {
    console.error("[AntiAbuse] blockIP error:", err);
    return false;
  }
}
