function todayISO(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const TOOL_NAME_FOR_PROMPT = 'WebSearch'

export const PROMPT = `Search the web and return up-to-date results to inform your response.

## When to Use
- Access information beyond the model's knowledge cutoff
- Get current events, recent data, or latest documentation
- Verify facts or gather recent context

## Approach
- Craft a concise query that captures the user's intent
- Use domain filtering if you need to restrict results to specific sites (include or block domains)
- The search is performed in a single API call; results are returned as search result blocks with titles, snippets, and URLs
- Process the results to extract relevant information and answer the user's question

## Parameters
- query (required): The search query string
- include (optional): Comma-separated list of domains to include (e.g., "github.com,stackoverflow.com")
- exclude (optional): Comma-separated list of domains to exclude
- num_results (optional): Desired number of results (default may be 10)
- location (optional): Geographic boost (e.g., "US") if needed

## Output
- Array of search result items with:
  - title: page title
  - URL: clickable link
  - snippet: short excerpt
  - sometimes additional metadata

## Constraints
- Web search is only available in the US region (as of current implementation)
- Queries are limited in length; avoid excessively long queries
- Rate limits may apply

## Safety/Limitations
- Search results are from the open web; evaluate credibility
- May return outdated or irrelevant results; use critical thinking
- Content is summarized; you may need to fetch the full page with WebFetchTool if details are needed

## CRITICAL REQUIREMENT - SOURCES CITATION
- After answering the user's question, you MUST include a "Sources:" section at the end of your response
- In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
- This is MANDATORY; never skip including sources
- Example format:

[Your answer here]

Sources:
- [Source Title 1](https://example.com/page1)
- [Source Title 2](https://example.com/page2)

## Date Handling
- Today's date is ${todayISO()}. You MUST use this year when searching for recent information, documentation, or current events.
- Example: If today is 2025-07-15 and the user asks for "latest React docs", search for "React documentation 2025", NOT "React documentation 2024"

## Avoid Repetition
- Do not issue the same search query repeatedly; if the first results are insufficient, refine the query with additional keywords or filters instead of repeating
- If a search returns an error (rate limit, network), do not hammer the tool—wait or ask the user to retry later
- Avoid searching for trivial facts that can be reasoned from known information; reserve web search for truly time-sensitive or unknown data
- When you have already obtained a set of results, do not search again with a slightly rephrased query expecting different high-quality results; instead, refine significantly or move on
- If you need to fetch multiple pages from the same search, use WebFetchTool on specific URLs rather than performing another broad search

## Examples
- Query for latest docs: "React 19 documentation 2025"
- Include only GitHub: query="openflow issue", include="github.com"
- Exclude Wikipedia: query="quantum computing", exclude="wikipedia.org"

## Usage Notes
- Prefer using an MCP-provided web fetch tool if available (for later content extraction)
- HTTP URLs are upgraded to HTTPS automatically
- This tool does not modify any files; it's read-only
- Cache helps with performance when the same query is repeated within ~15 minutes, but avoid unnecessary repeats

## Additional
- This tool integrates with the WebFetchTool for full page content retrieval when needed`