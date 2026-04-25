import type { ToolDefinition } from "../types/index.js";

export interface WebFetchInput {
  url: string;
  prompt: string;
}

export interface WebSearchInput {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

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
  return [
    {
      name: "WebFetch",
      description: "Fetch and process web content with AI analysis. Converts HTML to markdown. Auto-upgrades HTTP to HTTPS. 15-minute cache for repeated requests.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Fully-formed valid URL" },
          prompt: { type: "string", description: "What information to extract from the page" },
        },
        required: ["url", "prompt"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as WebFetchInput;
        let url = typed.url;

        if (url.startsWith("http://")) {
          url = url.replace("http://", "https://");
        }

        const cacheKey = url;
        const cached = webCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          return `[Cached] ${cached.content}\n\nExtraction prompt: ${typed.prompt}`;
        }

        try {
          const content = await fetchWithTimeout(url);
          const truncated = content.length > 10000 ? content.slice(0, 10000) + "\n...(content truncated)" : content;

          webCache.set(cacheKey, { content: truncated, timestamp: Date.now() });

          return `Fetched: ${url}\n\n${truncated}\n\nExtraction prompt: ${typed.prompt}`;
        } catch (error) {
          return `Failed to fetch ${url}: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "WebSearch",
      description: "Search the web for current information beyond the knowledge cutoff. Returns search result blocks with titles and snippets.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query string (min 2 characters)" },
          allowed_domains: { type: "array", items: { type: "string" }, description: "Array of domains to include" },
          blocked_domains: { type: "array", items: { type: "string" }, description: "Array of domains to exclude" },
        },
        required: ["query"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const typed = input as WebSearchInput;

        if (typed.query.length < 2) {
          return "Search query must be at least 2 characters";
        }

        try {
          const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(typed.query)}`;
          const content = await fetchWithTimeout(searchUrl);

          const results: Array<{ title: string; url: string; snippet: string }> = [];
          const resultRegex = /<a[^>]+class="result[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
          let match;

          while ((match = resultRegex.exec(content)) !== null) {
            const url = match[1];
            const title = extractTextFromHTML(match[2]);

            if (typed.allowed_domains && typed.allowed_domains.length > 0) {
              const domain = new URL(url.startsWith("//") ? `https:${url}` : url).hostname;
              if (!typed.allowed_domains.some((d) => domain.includes(d))) {
                continue;
              }
            }

            if (typed.blocked_domains && typed.blocked_domains.length > 0) {
              const domain = new URL(url.startsWith("//") ? `https:${url}` : url).hostname;
              if (typed.blocked_domains.some((d) => domain.includes(d))) {
                continue;
              }
            }

            results.push({ title, url, snippet: "" });

            if (results.length >= 10) break;
          }

          if (results.length === 0) {
            return `No results found for: ${typed.query}`;
          }

          return `Search results for: ${typed.query}\n\n${results
            .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}`)
            .join("\n\n")}`;
        } catch (error) {
          return `Search failed: ${(error as Error).message}`;
        }
      },
    },
  ];
}
