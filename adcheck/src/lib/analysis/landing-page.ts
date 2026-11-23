import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_BYTES = 1_000_000;
const MAX_TEXT = 6000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

export type LandingPage = { url: string; ok: true; title: string; text: string } | { url: string; ok: false };

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** Reject anything that could reach our own infrastructure (SSRF protection). */
async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
  if (url.username || url.password) throw new Error("credentials");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("port");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("host");
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) throw new Error("private address");
  return url;
}

function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "";
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|article|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title: decode(title), text: [metaDesc, body].filter(Boolean).join("\n").slice(0, MAX_TEXT) };
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

/** Fetch the advertiser's landing page as plain text. Never throws. */
export async function fetchLandingPage(rawUrl: string): Promise<LandingPage> {
  try {
    let url = await assertPublicUrl(rawUrl);
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AdCheckBot/1.0)", Accept: "text/html,*/*;q=0.5" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return { url: rawUrl, ok: false };
        url = await assertPublicUrl(new URL(location, url).toString()); // re-check every hop
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return { url: rawUrl, ok: false };

      // Read at most MAX_BYTES.
      const reader = res.body?.getReader();
      if (!reader) return { url: rawUrl, ok: false };
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
      }
      await reader.cancel().catch(() => {});
      const html = new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
      return { url: url.toString(), ok: true, ...htmlToText(html) };
    }
    return { url: rawUrl, ok: false };
  } catch {
    return { url: rawUrl, ok: false };
  }
}
