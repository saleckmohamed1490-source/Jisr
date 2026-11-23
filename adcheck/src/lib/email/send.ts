import "server-only";

export type Email = { to: string; subject: string; html: string; text: string };

/**
 * Sends through Resend's HTTP API. Without RESEND_API_KEY (local dev) the
 * e-mail is logged instead, so flows can be tested without an account.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "AdCheck <onboarding@resend.dev>";
  if (!key) {
    console.info(`[email] (not sent: RESEND_API_KEY missing) to=${email.to} subject="${email.subject}"`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("[email] Resend error", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed", err);
    return false;
  }
}
