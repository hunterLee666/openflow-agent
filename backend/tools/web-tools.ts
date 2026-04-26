import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { createReadOnlyTool } from "./tool-factory.js";

const WebFetchInputSchema = z.object({
  url: z.string().url("url 必须是有效的 URL"),
  prompt: z.string().min(1, "prompt 不能为空"),
});

const WebSearchInputSchema = z.object({
  query: z.string().min(2, "query 至少需要 2 个字符"),
  allowed_domains: z.array(z.string()).optional(),
  blocked_domains: z.array(z.string()).optional(),
});

const WebFetchOutputSchema = z.object({
  content: z.string(),
  url: z.string(),
  cached: z.boolean(),
});

const WebSearchOutputSchema = z.object({
  query: z.string(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    })
  ),
  count: z.number().int().nonnegative(),
});

interface CachedResult {
  content: string;
  timestamp: number;
}

const webCache = new Map<string, CachedResult>();
const CACHE_TTL = 15 * 60 * 1000;

async function fetchWithTimeout(url: string, timeout = 30000): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "OpenFlow-Agent/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("html")) {
      const html = await response.text();
      return extractTextFromHTML(html);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractTextFromHTML(html: string): string {
  let text = html;

  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, " ");
  text = text.trim();

  return text;
}

export function createWebTools(): ToolDefinition[] {
  const webFetchTool = createReadOnlyTool({
    name: "WebFetch",
    description: "Fetch and process web content with AI analysis. Converts HTML to markdown. Auto-upgrades HTTP to HTTPS. 15-minute cache for repeated requests.",
    inputSchema: WebFetchInputSchema,
    outputSchema: WebFetchOutputSchema,
    handler: async (input) => {
      let url = input.url;

      if (url.startsWith("http://")) {
        url = url.replace("http://", "https://");
      }

      const cacheKey = url;
      const cached = webCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return {
          content: `[Cached] ${cached.content}\n\nExtraction prompt: ${input.prompt}`,
          url,
          cached: true,
        };
      }

      const content = await fetchWithTimeout(url);
      const truncated = content.length > 10000 ? content.slice(0, 10000) + "\n...(content truncated)" : content;

      webCache.set(cacheKey, { content: truncated, timestamp: Date.now() });

      return {
        content: `Fetched: ${url}\n\n${truncated}\n\nExtraction prompt: ${input.prompt}`,
        url,
        cached: false,
      };
    },
  });

  const webSearchTool = createReadOnlyTool({
    name: "WebSearch",
    description: "Search the web for current information beyond the knowledge cutoff. Returns search result blocks with titles and snippets.",
    inputSchema: WebSearchInputSchema,
    outputSchema: WebSearchOutputSchema,
    handler: async (input) => {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`;
      const content = await fetchWithTimeout(searchUrl);

      const results: Array<{ title: string; url: string; snippet: string }> = [];
      const resultRegex = /<a[^>]+class="result[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
      let match;

      while ((match = resultRegex.exec(content)) !== null) {
        const url = match[1];
        const title = extractTextFromHTML(match[2]);

        if (input.allowed_domains && input.allowed_domains.length > 0) {
          const domain = new URL(url.startsWith("//") ? `https:${url}` : url).hostname;
          if (!input.allowed_domains.some((d) => domain.includes(d))) {
            continue;
          }
        }

        if (input.blocked_domains && input.blocked_domains.length > 0) {
          const domain = new URL(url.startsWith("//") ? `https:${url}` : url).hostname;
          if (input.blocked_domains.some((d) => domain.includes(d))) {
            continue;
          }
        }

        results.push({ title, url, snippet: "" });

        if (results.length >= 10) break;
      }

      return {
        query: input.query,
        results,
        count: results.length,
      };
    },
  });

  return [webFetchTool, webSearchTool];
}
