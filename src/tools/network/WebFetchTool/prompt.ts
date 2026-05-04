export const TOOL_NAME_FOR_PROMPT = 'WebFetch'

export const PROMPT = `Fetch a webpage and extract relevant information using AI.

## When to Use
- After obtaining a URL from a web search or other source
- To retrieve full content of an article, documentation page, or other web resource
- Extract specific details, data, or summaries from a page

## Approach
1. Provide a fully-qualified URL (must include http:// or https://)
2. Provide a prompt describing what information to extract or how to summarize
3. The tool fetches the page, converts HTML to markdown, and processes it with the prompt using a fast model
4. The result is a targeted response containing only the requested information

## Parameters
- url (required): The full URL to fetch (must be valid)
- prompt (required): Description of what to extract or how to summarize the content
- Additionally supports caching; same URL+prompt combo may hit a 15-minute cache

## Output
- The AI-generated response containing extracted information based on your prompt
- May be a summary, list of facts, answers to specific questions about the page, etc.

## Constraints
- URL must be absolute and properly formed
- HTTP URLs are automatically upgraded to HTTPS
- Large pages may be summarized or truncated to fit processing limits
- The tool is read-only; no modifications are made to the server

## Safety/Limitations
- Content from third-party websites may be unreliable; cross-check critical information
- Some sites may block fetchers or require JavaScript rendering; this tool only fetches static HTML
- Respect rate limits and robots.txt (the tool may enforce policies)
- Results may be biased by the prompt; be precise in what you ask

## Avoid Repetition
- Do not repeatedly fetch the same URL with similar prompts; if you need different information, adjust the prompt substantively, or fetch once and parse the result further yourself
- If a fetch fails (network error, 404, blocked), do not retry immediately—fix the URL or wait
- Avoid fetching many large pages in rapid succession; respect server load
- When you have already fetched a page and stored its content, reuse that content instead of fetching again within the same conversation

## Usage Notes
- IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions or better integration
- The tool includes a self-cleaning 15-minute cache; benefit from this by reusing the same URL+prompt if appropriate
- If a URL redirects to a different host, the tool will inform you and provide the redirect URL; make a new WebFetch request with the redirect URL to get the content
- Expected use case: extract facts, summarize articles, retrieve specific sections

## Examples
- Summarize an article: url="https://example.com/news", prompt="Provide a 2-sentence summary of the key points"
- Extract technical details: url="https://api.example.com/docs", prompt="List all endpoints and their HTTP methods"

## Additional
- This tool complements WebSearchTool: use WebSearch to discover URLs, then WebFetch to retrieve full content
- The prompt should be specific to get high-quality results`