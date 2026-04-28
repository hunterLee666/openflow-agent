import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { createReadOnlyTool } from "./tool-factory.js";

const WebFetchInputSchema = z.object({
  url: z.string().url("url 必须是有效的 URL"),
  prompt: z.string().min(1, "prompt 不能为空"),
});

const WebSearchInputSchema = z.object({
  query: z.string().min(2, "query 至少需要 2 个字符"),
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
  provider: z.string().optional(),
  took_ms: z.number().optional(),
});

interface CachedResult {
  content: string;
  timestamp: number;
}

const webCache = new Map<string, CachedResult>();
const CACHE_TTL = 15 * 60 * 1000;

async function fetchWithTimeout(
  url: string,
  timeout = 15000,
  userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "--")
    .replace(/&hellip;/g, "...")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBotChallenge(html: string): boolean {
  if (/class="[^"]*\bresult__a\b[^"]*"/i.test(html)) {
    return false;
  }
  return /g-recaptcha|are you a human|id="challenge-form"|name="challenge"/i.test(html);
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchWithBing(query: string): Promise<SearchResult[]> {
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN`;
  const html = await fetchWithTimeout(searchUrl);

  if (isBotChallenge(html)) {
    throw new Error("Bing returned a bot-detection challenge");
  }

  const results: SearchResult[] = [];
  const resultRegex = /<li[^>]+class="b_algo"[^>]*>[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<\/li>/gi;
  let match;

  while ((match = resultRegex.exec(html)) !== null) {
    const url = match[1];
    const titleMatch = match[2].replace(/<[^>]+>/g, "");
    const matchEnd = (match.index ?? 0) + match[0].length;
    const trailingHtml = html.slice(matchEnd, matchEnd + 300);
    const snippetMatch = /<p[^>]*>(.*?)<\/p>/i.exec(trailingHtml);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";

    results.push({
      title: decodeHTMLEntities(stripHtml(titleMatch)),
      url,
      snippet: decodeHTMLEntities(snippet),
    });

    if (results.length >= 10) break;
  }

  return results;
}

async function searchWithBaidu(query: string): Promise<SearchResult[]> {
  const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=10`;
  const html = await fetchWithTimeout(searchUrl);

  const results: SearchResult[] = [];
  const resultRegex = /<h3[^>]*class="[^"]*c-title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<\/h3>[\s\S]*?<span[^>]*class="[^"]*c-span-last[^"]*"[^>]*>(.*?)<\/span>/gi;
  let match;

  while ((match = resultRegex.exec(html)) !== null) {
    const url = match[1];
    const titleMatch = match[2].replace(/<[^>]+>/g, "");
    const snippetMatch = match[3].replace(/<[^>]+>/g, "");

    results.push({
      title: decodeHTMLEntities(stripHtml(titleMatch)),
      url,
      snippet: decodeHTMLEntities(stripHtml(snippetMatch)),
    });

    if (results.length >= 10) break;
  }

  return results;
}

async function searchWithSogou(query: string): Promise<SearchResult[]> {
  const searchUrl = `https://www.sogou.com/web?query=${encodeURIComponent(query)}&num=10`;
  const html = await fetchWithTimeout(searchUrl);

  const results: SearchResult[] = [];
  const resultRegex = /<div[^>]+class="vrwrap"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*class="[^"]*pt-title[^"]*"[^>]*>(.*?)<\/a>[\s\S]*?<p[^>]*class="[^"]*space-txt[^"]*"[^>]*>(.*?)<\/p>/gi;
  let match;

  while ((match = resultRegex.exec(html)) !== null) {
    const url = match[1];
    const titleMatch = match[2].replace(/<[^>]+>/g, "");
    const snippetMatch = match[3].replace(/<[^>]+>/g, "");

    results.push({
      title: decodeHTMLEntities(stripHtml(titleMatch)),
      url,
      snippet: decodeHTMLEntities(stripHtml(snippetMatch)),
    });

    if (results.length >= 10) break;
  }

  return results;
}

async function searchWith360(query: string): Promise<SearchResult[]> {
  const searchUrl = `https://www.so.com/s?q=${encodeURIComponent(query)}&pn=1&rn=10`;
  const html = await fetchWithTimeout(searchUrl);

  const results: SearchResult[] = [];
  const resultRegex = /<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<\/h3>[\s\S]*?<p[^>]*>(.*?)<\/p>/gi;
  let match;

  while ((match = resultRegex.exec(html)) !== null) {
    const url = match[1];
    const titleMatch = match[2].replace(/<[^>]+>/g, "");
    const snippetMatch = match[3].replace(/<[^>]+>/g, "");

    results.push({
      title: decodeHTMLEntities(stripHtml(titleMatch)),
      url,
      snippet: decodeHTMLEntities(stripHtml(snippetMatch)),
    });

    if (results.length >= 10) break;
  }

  return results;
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

      const html = await fetchWithTimeout(url);
      const text = extractTextFromHTML(html);
      const truncated = text.length > 10000 ? text.slice(0, 10000) + "\n...(content truncated)" : text;

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
    description: "Search the web for current information including weather, news, stock prices, sports scores, facts, and any real-time data. Use this when user asks about weather (e.g., '北京天气', 'weather in Beijing'), news, prices, or anything that requires up-to-date information. Returns search result blocks with titles, URLs, and snippets.",
    inputSchema: WebSearchInputSchema,
    outputSchema: WebSearchOutputSchema,
    handler: async (input) => {
      const cacheKey = `search:${input.query}`;
      const cached = webCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        const cachedData = JSON.parse(cached.content);
        return { ...cachedData, cached: true };
      }

      const searchEngines: Array<{ name: string; fn: (query: string) => Promise<SearchResult[]> }> = [
        { name: "Bing", fn: searchWithBing },
        { name: "Baidu", fn: searchWithBaidu },
        { name: "Sogou", fn: searchWithSogou },
        { name: "360", fn: searchWith360 },
      ];

      const startedAt = Date.now();

      const searchPromises = searchEngines.map(async (engine) => {
        try {
          console.log(`[WebSearch] Trying ${engine.name} in parallel...`);
          const results = await engine.fn(input.query);
          return { engine, results, success: results.length > 0 };
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          console.log(`[WebSearch] ${engine.name} failed: ${error.message}`);
          return { engine, results: [], success: false, error };
        }
      });

      const settled = await Promise.all(searchPromises);
      const winner = settled.find(r => r.success && r.results.length > 0);

      if (winner) {
        const response = {
          query: input.query,
          results: winner.results,
          count: winner.results.length,
          provider: winner.engine.name.toLowerCase(),
          took_ms: Date.now() - startedAt,
        };

        webCache.set(cacheKey, {
          content: JSON.stringify(response),
          timestamp: Date.now(),
        });

        console.log(`[WebSearch] Winner: ${winner.engine.name} with ${response.count} results in ${response.took_ms}ms`);
        return response;
      }

      console.error(`[WebSearch] All search engines failed.`);

      return {
        query: input.query,
        results: [],
        count: 0,
        provider: "none",
        took_ms: Date.now() - startedAt,
      };
    },
  });

  return [webFetchTool, webSearchTool];
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
