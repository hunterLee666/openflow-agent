import React, { type ReactNode, useMemo } from "react";
import { Text } from "./Text.js";
import { stripAnsi, ansiWidth } from "../ansi.js";
import { z } from "zod";

export const MarkdownPropsSchema = z.object({
  children: z.string(),
  dimColor: z.boolean().optional(),
  codeBg: z.string().optional(),
})
export type MarkdownProps = z.infer<typeof MarkdownPropsSchema>

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderInlineCode(text: string): ReactNode {
  return React.createElement(
    Text,
    { style: { backgroundColor: "#333", padding: "0 4px", borderRadius: 3 } },
    text
  );
}

function renderCode(code: string, lang?: string): ReactNode {
  return React.createElement(
    Text,
    { style: { backgroundColor: "#1e1e1e", padding: 8, borderRadius: 4, overflow: "auto", fontFamily: "monospace" } },
    code
  );
}

function renderLink(text: string, href: string): ReactNode {
  return React.createElement(
    Text,
    { style: { color: "#58a6ff", textDecoration: "underline" } },
    text
  );
}

function renderHeading(text: string, level: number): ReactNode {
  const colorMap: Record<number, string> = {
    1: "brightWhite",
    2: "brightCyan",
    3: "brightGreen",
    4: "brightYellow",
    5: "brightMagenta",
    6: "brightRed",
  };
  const prefix = "#".repeat(level) + " ";
  return React.createElement(
    Text,
    { color: colorMap[level] || "brightWhite", bold: true },
    prefix + text
  );
}

function renderList(text: string, ordered: boolean, start?: number): ReactNode {
  const items = text.split("\n");
  return React.createElement(
    "span",
    null,
    items.map((item, i) => {
      const marker = ordered ? `${(start ?? 1) + i}. ` : "• ";
      return React.createElement(
        Text,
        { key: i },
        React.createElement(Text, { color: "dim" }, marker),
        item.trim(),
        "\n"
      );
    })
  );
}

function renderBlockquote(text: string): ReactNode {
  const lines = text.split("\n");
  return React.createElement(
    "span",
    null,
    lines.map((line, i) =>
      React.createElement(
        Text,
        { key: i, color: "dim", italic: true },
        `│ ${line}`
      )
    )
  );
}

export function Markdown({ children, dimColor = false, codeBg = "#1e1e1e" }: MarkdownProps): ReactNode {
  const elements = useMemo(() => {
    if (!children || typeof children !== "string") {
      return [];
    }

    const result: ReactNode[] = [];
    const lines = children.split("\n");
    let i = 0;
    let inCodeBlock = false;
    let codeBlockContent = "";
    let codeBlockLang = "";
    let inBlockquote = false;
    let blockquoteContent: string[] = [];
    let inList = false;
    let listContent: string[] = [];
    let listOrdered = false;
    let listStart = 1;

    const flushBlockquote = () => {
      if (blockquoteContent.length > 0) {
        result.push(renderBlockquote(blockquoteContent.join("\n")));
        blockquoteContent = [];
        inBlockquote = false;
      }
    };

    const flushCodeBlock = () => {
      if (codeBlockContent) {
        result.push(renderCode(codeBlockContent.trim(), codeBlockLang));
        codeBlockContent = "";
        codeBlockLang = "";
        inCodeBlock = false;
      }
    };

    const flushList = () => {
      if (listContent.length > 0) {
        result.push(renderList(listContent.join("\n"), listOrdered, listStart));
        listContent = [];
        inList = false;
      }
    };

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith("```")) {
        if (inCodeBlock) {
          flushCodeBlock();
        } else {
          flushBlockquote();
          flushList();
          codeBlockLang = line.slice(3).trim();
          inCodeBlock = true;
        }
        i++;
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent += line + "\n";
        i++;
        continue;
      }

      if (line.startsWith(">")) {
        flushList();
        if (!inBlockquote) {
          inBlockquote = true;
        }
        blockquoteContent.push(line.slice(1).trim());
        i++;
        continue;
      } else {
        flushBlockquote();
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        flushList();
        result.push(renderHeading(headingMatch[2], headingMatch[1].length));
        i++;
        continue;
      }

      const unorderedListMatch = line.match(/^(\s*)[-*]\s+(.+)/);
      if (unorderedListMatch) {
        flushBlockquote();
        if (!inList) {
          inList = true;
          listOrdered = false;
        }
        listContent.push(unorderedListMatch[2]);
        i++;
        continue;
      }

      const orderedListMatch = line.match(/^(\s*)(\d+)\.\s+(.+)/);
      if (orderedListMatch) {
        flushBlockquote();
        if (!inList) {
          inList = true;
          listOrdered = true;
          listStart = parseInt(orderedListMatch[2], 10);
        }
        listContent.push(orderedListMatch[3]);
        i++;
        continue;
      }
      flushList();

      if (line.trim() === "") {
        result.push(React.createElement("br", { key: `br-${i}` }));
        i++;
        continue;
      }

      let processedLine = line;
      processedLine = processedLine.replace(/`([^`]+)`/g, (_, code) => {
        return `{{CODE:${code}}}`;
      });

      processedLine = processedLine.replace(/\[([^\]]+)\]\([^)]+\)/g, (_, text) => {
        return `{{LINK:${text}}}`;
      });

      processedLine = processedLine.replace(/\*\*([^*]+)\*\*/g, "{{BOLD:$1}}");
      processedLine = processedLine.replace(/\*([^*]+)\*/g, "{{ITALIC:$1}}");
      processedLine = processedLine.replace(/__([^_]+)__/g, "{{BOLD:$1}}");
      processedLine = processedLine.replace(/_([^_]+)_/g, "{{ITALIC:$1}}");

      const parts: ReactNode[] = [];
      const regex = /{{(CODE|LINK|BOLD|ITALIC):([^}]+)}}/g;
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(processedLine)) !== null) {
        if (match.index > lastIndex) {
          parts.push(
            dimColor
              ? React.createElement(Text, { key: `text-${lastIndex}`, color: "dim" }, processedLine.slice(lastIndex, match.index))
              : React.createElement(Text, { key: `text-${lastIndex}` }, processedLine.slice(lastIndex, match.index))
          );
        }

        switch (match[1]) {
          case "CODE":
            parts.push(renderInlineCode(match[2]));
            break;
          case "LINK":
            parts.push(renderLink(match[2], ""));
            break;
          case "BOLD":
            parts.push(
              React.createElement(Text, { key: `bold-${match.index}`, bold: true }, match[2])
            );
            break;
          case "ITALIC":
            parts.push(
              React.createElement(Text, { key: `italic-${match.index}`, italic: true }, match[2])
            );
            break;
        }
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < processedLine.length) {
        parts.push(
          dimColor
            ? React.createElement(Text, { key: `text-${lastIndex}`, color: "dim" }, processedLine.slice(lastIndex))
            : React.createElement(Text, { key: `text-${lastIndex}` }, processedLine.slice(lastIndex))
        );
      }

      result.push(React.createElement("span", { key: `line-${i}` }, ...parts));
      result.push(React.createElement("br", { key: `br-${i}` }));
      i++;
    }

    flushBlockquote();
    flushList();
    flushCodeBlock();

    return result;
  }, [children, dimColor]);

  return React.createElement("span", null, ...elements);
}

export default Markdown;
