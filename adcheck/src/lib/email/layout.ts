import { APP_NAME } from "@/lib/brand";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type EmailBlock =
  | { type: "p"; text: string }
  | { type: "table"; rows: [string, string][] }
  | { type: "button"; label: string; href: string }
  | { type: "small"; text: string };

/** Minimal, inline-styled HTML that renders in every mail client (RTL-aware). */
export function renderEmail(opts: { locale: string; title: string; blocks: EmailBlock[]; footer: string }) {
  const dir = opts.locale === "ar" ? "rtl" : "ltr";
  const align = dir === "rtl" ? "right" : "left";
  const body = opts.blocks
    .map((b) => {
      switch (b.type) {
        case "p":
          return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#0f172a">${esc(b.text)}</p>`;
        case "small":
          return `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#64748b">${esc(b.text)}</p>`;
        case "button":
          return `<p style="margin:24px 0"><a href="${esc(b.href)}" style="background:#1f5ad6;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${esc(b.label)}</a></p>`;
        case "table":
          return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px">${b.rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;text-align:${align}">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;text-align:${dir === "rtl" ? "left" : "right"}">${esc(v)}</td></tr>`,
            )
            .join("")}</table>`;
      }
    })
    .join("");

  const html = `<!doctype html><html lang="${opts.locale}" dir="${dir}"><body style="margin:0;background:#f7f8fb;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;text-align:${align}" dir="${dir}">
<tr><td><p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#1946ab">${esc(APP_NAME)}</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${esc(opts.title)}</h1>${body}
<p style="margin:24px 0 0;font-size:12px;color:#94a3b8">${esc(opts.footer)}</p></td></tr></table>
</td></tr></table></body></html>`;

  const text = [
    opts.title,
    "",
    ...opts.blocks.map((b) =>
      b.type === "table" ? b.rows.map(([k, v]) => `${k}: ${v}`).join("\n") : b.type === "button" ? `${b.label}: ${b.href}` : b.text,
    ),
    "",
    opts.footer,
  ].join("\n");
  return { html, text };
}
