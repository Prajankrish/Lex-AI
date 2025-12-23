// frontend/src/components/ChatMessage.tsx
import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import type { Message } from "@/types";
import { UserIcon, BotIcon } from "./Icons";

/**
 * ChatMessage with keyword highlighting for important legal terms.
 *
 * - Expects message.content to be markdown string.
 * - If the backend returns metadata, it will be included in message.metadata (frontend code should attach it).
 *
 * NOTE: rehypeSanitize is used with default schema to avoid unsafe HTML.
 */

interface Props {
  message: Message & { metadata?: any };
}

const DETAILED_HEADING_REGEX = /^(###\s*🧾\s*Detailed Explanation|###\s*🧾|###\s*Detailed Explanation)/im;

const splitDetailedSection = (markdown: string) => {
  const match = markdown.match(DETAILED_HEADING_REGEX);
  if (!match) return { main: markdown, detailed: "" };

  const idx = markdown.search(DETAILED_HEADING_REGEX);
  const main = markdown.slice(0, idx).trim();
  const detailed = markdown.slice(idx).trim();
  return { main, detailed };
};

const HIGHLIGHT_RULES: { pattern: RegExp; className: string; title?: string }[] = [
  { pattern: /\b(Section\s*\d{1,4}|section\s*\d{1,4}|IPC\s*\d{1,4})\b/gi, className: "bg-yellow-600/20 text-yellow-300 font-semibold px-1 rounded", title: "IPC Section" },
  { pattern: /\b(IP[Cc]|CrPC|Constitution|Article\s*\d{1,3})\b/g, className: "bg-yellow-600/15 text-yellow-200 px-1 rounded", title: "Legal reference" },
  { pattern: /\b(life imprisonment|imprisonment|punish(?:ed|ment)?|sentence|term of years|fine|penalt(?:y|ies))\b/gi, className: "bg-red-600/20 text-red-300 font-semibold px-1 rounded", title: "Punishment" },
  { pattern: /\b(intent|mens rea|actus reus|elements|offence|crime|liable|guilt(?:y|iness)?)\b/gi, className: "bg-indigo-600/20 text-indigo-200 px-1 rounded", title: "Key legal element" },
  { pattern: /₹\s?\d{1,3}(?:[,\d]{0,})|\b\d{1,3}(?:,\d{3})+\b/g, className: "bg-emerald-600/20 text-emerald-200 px-1 rounded", title: "Amount" },
  { pattern: /\b(18|19|20)\d{2}\b/g, className: "bg-zinc-700/30 text-zinc-100 px-1 rounded", title: "Year" },
  { pattern: /\b(Example|For example|COMMENT|Note|OBSERVE|Important|TL;DR|In short)\b/gi, className: "bg-sky-600/20 text-sky-200 font-medium px-1 rounded", title: "Callout" },
];

function _escapeForHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function _cleanSummaryText(s: string) {
  if (!s) return s;
  // remove markdown headings and code fences, collapse whitespace
  try {
    let out = String(s);
    out = out.replace(/```[\s\S]*?```/g, " ");
    out = out.replace(/^#+\s*/gm, "");
    out = out.replace(/^-\s*/gm, "");
    out = out.replace(/\*\*|__|\*|_/g, "");
    // remove bracketed annotations like [Repealed], [***]
    out = out.replace(/\[[^\]]*\]/g, " ");
    // remove short parenthetical notes
    out = out.replace(/\([^\)]*\)/g, " ");
    out = out.replace(/\s+/g, " ").trim();

    // remove leading 'Summary' labels or emoji prefixes
    out = out.replace(/^\s*(?:✨\s*)?(?:Summary|SUMMARY|In short|TL;DR)[:\-\s]*/i, "");

    // If the entire summary is UPPERCASE (likely noisy), convert to sentence case
    if (out.length > 40 && out === out.toUpperCase()) {
      out = out.toLowerCase();
      out = out.charAt(0).toUpperCase() + out.slice(1);
    }
    // If the cleaned summary appears truncated (no terminal punctuation), cut back
    // to the last complete sentence to avoid displaying a broken fragment.
    try {
      if (out && !/[.!?]"?$/.test(out)) {
        const lastDot = Math.max(out.lastIndexOf('.'), out.lastIndexOf('?'), out.lastIndexOf('!'));
        if (lastDot > 0) {
          out = out.slice(0, lastDot + 1).trim();
        }
      }
    } catch (e) {
      // ignore
    }
    return out;
  } catch (e) {
    return s;
  }
}

function highlightImportant(md: string): string {
  if (!md) return md;

  const fenced: string[] = [];
  const fencedPlaceholder = (i: number) => `___FENCED_PLACEHOLDER_${i}___`;
  md = md.replace(/```[\s\S]*?```/g, (m) => {
    const idx = fenced.push(m) - 1;
    return fencedPlaceholder(idx);
  });

  const inlines: string[] = [];
  const inlinePlaceholder = (i: number) => `___INLINE_PLACEHOLDER_${i}___`;
  md = md.replace(/`[^`]*`/g, (m) => {
    const idx = inlines.push(m) - 1;
    return inlinePlaceholder(idx);
  });

  for (const rule of HIGHLIGHT_RULES) {
    md = md.replace(rule.pattern, (match) => {
      if (/<span[^>]*>.*<\/span>/i.test(match)) return match;
      const safe = _escapeForHtml(match);
      const titleAttr = rule.title ? ` title="${rule.title}"` : "";
      return `<span class="${rule.className}"${titleAttr}>${safe}</span>`;
    });
  }

  md = md.replace(/___INLINE_PLACEHOLDER_(\d+)___/g, (_, idx) => inlines[Number(idx)]);
  md = md.replace(/___FENCED_PLACEHOLDER_(\d+)___/g, (_, idx) => fenced[Number(idx)]);

  return md;
}

/* --------- Small UI helpers: SmallCard + ExpandableText ---------- */

const SmallCard: React.FC<{ title?: string; children?: React.ReactNode }> = ({ title, children }) => {
  return (
    <div className="bg-zinc-900 p-3 rounded-lg border border-white/5 shadow-sm break-words">
      {title && <div className="text-xs text-zinc-400 mb-1 font-medium">{title}</div>}
      <div className="text-sm text-zinc-100 leading-snug whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
};

/**
 * ExpandableText:
 * - previewLines: number of lines to show in preview (2 recommended)
 * - uses -webkit-line-clamp inline CSS so no plugin required
 */
const ExpandableText: React.FC<{ text?: string; previewLines?: number }> = ({ text = "", previewLines = 2 }) => {
  const [open, setOpen] = useState(false);
  const trimmed = (text || "").trim();
  const isLong = trimmed.length > 220 || trimmed.split(/\s+/).length > 40;

  const previewStyle: React.CSSProperties = {
    display: "-webkit-box",
    WebkitLineClamp: previewLines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as React.CSSProperties;

  return (
    <div>
      {!isLong ? (
        <div className="whitespace-pre-wrap break-words">{trimmed}</div>
      ) : (
        <>
          <div className={`whitespace-pre-wrap break-words ${open ? "" : ""}`} style={!open ? previewStyle : undefined}>
            {trimmed}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button onClick={() => setOpen((s) => !s)} className="text-xs text-zinc-300 hover:text-zinc-100">
              {open ? "Show less" : "Show more"}
            </button>

            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(trimmed);
                } catch (e) {
                  console.error("Copy failed", e);
                }
              }}
              className="text-xs px-2 py-1 rounded bg-zinc-700/40 hover:bg-zinc-700 text-zinc-200"
            >
              Copy
            </button>
          </div>
        </>
      )}
    </div>
  );
};

/* ----------------- Main Component ----------------- */

const ChatMessage: React.FC<Props> = ({ message }) => {
  const isUser = message.role === "user";
  const raw = message.content || "";

  // If metadata exists (from backend) we render structured cards
  const metadata = (message as any).metadata;

  // For assistant messages, split detailed section if present
  const { main, detailed } = useMemo(
    () => (isUser ? { main: raw, detailed: "" } : splitDetailedSection(raw || "")),
    [raw, isUser]
  );

  const [showDetails, setShowDetails] = useState(false);
  const processedMain = useMemo(() => (isUser ? main : highlightImportant(main || "")), [isUser, main]);
  const processedDetailed = useMemo(() => (isUser ? detailed : highlightImportant(detailed || "")), [isUser, detailed]);

  // Helper copy
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Optionally add a toast
    } catch (e) {
      console.error("Copy failed", e);
    }
  };

  return (
    <div className={`w-full group ${isUser ? "" : "my-6"}`}>
      <div className={`w-full flex gap-4 items-start ${isUser ? "justify-end pr-6" : "justify-start pl-6"}`}>
        {!isUser && (
          <div className="flex-shrink-0 mt-1">
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-brand-600 text-white border border-brand-500">
              <BotIcon />
            </div>
          </div>
        )}

        <div className={`flex-1 ${isUser ? "flex justify-end" : ""}`}>
          {isUser ? (
            <div className="max-w-[70%] ml-auto bg-zinc-800 text-zinc-100 rounded-xl px-4 py-3 shadow-sm">
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
            </div>
          ) : (
            <div className="w-full max-w-3xl mx-auto bg-transparent text-zinc-300">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white">
                  <BotIcon />
                </div>
                <div className="text-sm text-zinc-100 font-medium">LEXAI</div>
                <div className="ml-2 text-xs text-zinc-500">· legal assistant</div>
              </div>

              {/* If metadata available, render a single unified card (avoid duplicates) */}
              {metadata && (
                <div className="mb-4">
                  <SmallCard title="✨ Result">
                    <div className="prose prose-invert max-w-none leading-relaxed space-y-2">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, rehypeSanitize]}
                        components={{
                          p: (props) => <p className="text-sm leading-snug" {...props} />,
                          ul: (props) => <ul className="list-disc ml-6 space-y-1" {...props} />,
                          ol: (props) => <ol className="list-decimal ml-6 space-y-1" {...props} />,
                          li: (props) => <li className="leading-snug" {...props} />,
                          strong: (props) => <strong className="text-zinc-100" {...props} />,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </SmallCard>
                </div>
              )}

              {/* Render main markdown (use message.content so formatting from LLM is preserved)
                  If metadata existed we already rendered the unified markdown inside the Result card,
                  so avoid duplicating it here. */}
              {!metadata && (
                <div className="prose prose-invert max-w-none leading-relaxed space-y-4">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw, rehypeSanitize]}
                    components={{
                      h3: (props) => <h3 className="text-lg font-semibold mt-4 mb-2" {...props} />,
                      ul: (props) => <ul className="list-disc ml-6 space-y-1" {...props} />,
                      ol: (props) => <ol className="list-decimal ml-6 space-y-1" {...props} />,
                      li: (props) => <li className="leading-snug" {...props} />,
                      p: (props) => <p className="leading-snug" {...props} />,
                      details: (props) => <details className="bg-gray-800 p-3 rounded" {...props} />,
                      summary: (props) => <summary className="cursor-pointer font-semibold" {...props} />,
                      strong: (props) => <strong className="text-zinc-100" {...props} />,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}

              {/* Show details control */}
              {(processedDetailed || (metadata && metadata.detailed)) && (
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setShowDetails((s) => !s)}
                      className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-2"
                    >
                      {showDetails ? "Collapse detailed explanation" : "Show detailed explanation"}
                    </button>
                    <div className="flex gap-2 items-center text-xs text-zinc-400">
                      <button onClick={() => handleCopy(processedDetailed || (metadata && metadata.detailed) || "")} className="hover:text-zinc-200">
                        Copy
                      </button>
                    </div>
                  </div>

                  {showDetails && (
                    <div className="mt-3 bg-zinc-900/50 p-4 rounded-lg border border-white/5">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw, rehypeSanitize]}
                        components={{
                          p: ({ node, ...props }) => <p className="text-sm leading-relaxed mb-2" {...props} />,
                          li: ({ node, ...props }) => <li className="text-sm mb-1" {...props} />,
                          strong: ({ node, ...props }) => <strong className="text-zinc-100" {...props} />,
                        }}
                      >
                        {processedDetailed || (metadata && metadata.detailed) || ""}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {isUser && (
          <div className="flex-shrink-0 mt-1">
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-zinc-700 text-zinc-200 border border-transparent">
              <UserIcon />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
