import type { ToolDefinition, ToolContext } from "../types/index.js";

export const webFetchTool: ToolDefinition = {
  name: "web_fetch",
  description: "Fetch content from a URL. Use for reading documentation, API references, or external resources.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to fetch" },
      maxLength: { type: "number", description: "Maximum content length to return", default: 5000 },
    },
    required: ["url"],
  },
  isConcurrencySafe: true,
  isReadOnly: true,
  async handler(input: unknown, _ctx: ToolContext): Promise<unknown> {
    const args = input as Record<string, unknown>;
    const url = String(args.url);
    const maxLength = Number(args.maxLength || 5000);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "OpenFlow-CLI/1.0",
        },
      });

      if (!response.ok) {
        return `HTTP ${response.status}: ${response.statusText}`;
      }

      const content = await response.text();
      const truncated = content.length > maxLength
        ? content.slice(0, maxLength) + "\n...[truncated]"
        : content;

      return truncated;
    } catch (e) {
      return `Fetch error: ${(e as Error).message}`;
    }
  },
};

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "Search the web for information. Returns search results with titles and snippets.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      numResults: { type: "number", description: "Number of results", default: 5 },
    },
    required: ["query"],
  },
  isConcurrencySafe: true,
  isReadOnly: true,
  async handler(input: unknown, _ctx: ToolContext): Promise<unknown> {
    const args = input as Record<string, unknown>;
    const query = String(args.query);
    const numResults = Number(args.numResults || 5);

    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0",
        },
      });

      const html = await response.text();

      const results: { title: string; url: string }[] = [];
      const resultBlocks = html.match(/<a rel="nofollow" class="result__a"[^>]*>.*?<\/a>/g) || [];

      for (let i = 0; i < Math.min(resultBlocks.length, numResults); i++) {
        const block = resultBlocks[i];
        const titleMatch = block.match(/>([^<]+)</);
        const urlMatch = block.match(/href="([^"]+)"/);
        if (titleMatch && urlMatch) {
          results.push({
            title: titleMatch[1].trim(),
            url: urlMatch[1],
          });
        }
      }

      if (results.length === 0) {
        return `No search results found for: ${query}`;
      }

      const formatted = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`)
        .join("\n\n");

      return `Search results for "${query}":\n\n${formatted}`;
    } catch (e) {
      return `Search error: ${(e as Error).message}`;
    }
  },
};

export function registerExternalTools(registry: { register(tool: ToolDefinition): void }): void {
  registry.register(webFetchTool);
  registry.register(webSearchTool);
}
