import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/**
 * Tiny Markdown renderer for our own static content (legal pages):
 * #/## headings, paragraphs, "- " lists, "> " notes, **bold**, _italic_,
 * [text](/internal) or [text](https://…) links. Builds React elements, never HTML strings.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|_(.+?)_|\[(.+?)\]\((.+?)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2]) out.push(<em key={k}>{m[2]}</em>);
    else if (m[3] && m[4]) {
      out.push(
        m[4].startsWith("/") ? (
          <Link key={k} href={m[4]} className="text-primary underline">{m[3]}</Link>
        ) : (
          <a key={k} href={m[4]} className="text-primary underline" rel="noreferrer">{m[3]}</a>
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block = { type: "h1" | "h2" | "p" | "quote"; text: string } | { type: "ul"; items: string[] };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("# ")) { flush(); blocks.push({ type: "h1", text: line.slice(2) }); continue; }
    if (line.startsWith("## ")) { flush(); blocks.push({ type: "h2", text: line.slice(3) }); continue; }
    if (line.startsWith("> ")) { flush(); blocks.push({ type: "quote", text: line.slice(2) }); continue; }
    if (line.startsWith("- ")) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") last.items.push(line.slice(2));
      else blocks.push({ type: "ul", items: [line.slice(2)] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-4 leading-7 text-slate-700">
      {parse(source).map((b, bi) => {
        const k = `b${bi}`;
        switch (b.type) {
          case "h1":
            return <h1 key={k} className="text-3xl font-bold text-foreground">{b.text}</h1>;
          case "h2":
            return <h2 key={k} className="pt-4 text-xl font-semibold text-foreground">{b.text}</h2>;
          case "quote":
            return <blockquote key={k} className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{inline(b.text, k)}</blockquote>;
          case "ul":
            return <ul key={k} className="list-disc space-y-1 ps-6">{b.items.map((it, i) => <li key={i}>{inline(it, `${k}-${i}`)}</li>)}</ul>;
          default:
            return <p key={k}>{inline(b.text, k)}</p>;
        }
      })}
    </div>
  );
}
