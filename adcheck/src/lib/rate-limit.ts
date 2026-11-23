import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const RULES = {
  check: [
    { suffix: "1m", windowSeconds: 60, limit: () => envInt("RATE_LIMIT_CHECKS_PER_MINUTE", 5) },
    { suffix: "1h", windowSeconds: 3600, limit: () => envInt("RATE_LIMIT_CHECKS_PER_HOUR", 40) },
  ],
  image: [
    { suffix: "1m", windowSeconds: 60, limit: () => envInt("RATE_LIMIT_IMAGES_PER_MINUTE", 3) },
    { suffix: "1h", windowSeconds: 3600, limit: () => envInt("RATE_LIMIT_IMAGES_PER_HOUR", 15) },
  ],
} as const;

/**
 * Per-user sliding-window rate limit stored in Postgres (works across all
 * serverless instances). Returns true when the request may proceed.
 */
export async function rateLimit(userId: string, action: keyof typeof RULES): Promise<boolean> {
  const admin = createAdminClient();
  for (const rule of RULES[action]) {
    const { data, error } = await admin.rpc("hit_rate_limit", {
      p_user: userId,
      p_action: `${action}:${rule.suffix}`,
      p_limit: rule.limit(),
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      // Fail open on infrastructure errors so a DB hiccup doesn't block paying users;
      // credits still cap total usage.
      console.error("[rate-limit]", error);
      return true;
    }
    if (data === false) return false;
  }
  return true;
}
