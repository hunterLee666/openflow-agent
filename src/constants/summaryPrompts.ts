export const CONVERSATION_SUMMARY_PROMPT = `Produce a condensed summary of the entire conversation for seamless continuation.

## Constraints

- ESSENTIAL: Reply with PLAIN TEXT ONLY. Do NOT invoke any tools. Tool invocations will be BLOCKED and will squander your single available turn.
- Do NOT use Read, Bash, Grep, Glob, Edit, Write, or ANY other tool whatsoever.
- Everything you need is already present in the conversation above.
- Output must be raw text: one \`<analysis>\` block followed by one \`<summary>\` block.

## Format

### Analysis Phase

Before writing the summary, wrap your reasoning inside \`<analysis>\` tags to structure your thinking. Within the analysis:

- Walk through each message chronologically
- Identify what the user asked for and their underlying intent
- Note the strategy or approach adopted
- Record pivotal decisions and trade-offs
- Capture technical concepts and patterns discussed
- Extract concrete details: file paths, complete code fragments, function signatures, file modifications
- Document errors encountered and how they were resolved
- Note any user feedback or corrections

### Summary Sections

The \`<summary>\` block must contain exactly these nine sections:

1. **Primary Request and Intent** — What the user originally wanted and the deeper goal behind it
2. **Key Technical Concepts** — Frameworks, patterns, algorithms, architectures, or domain knowledge involved
3. **Files and Code Sections** — Enumerate every relevant file by path. Include complete code snippets. Explain why each matters.
4. **Errors and Fixes** — Every error that surfaced, how it was resolved, and any user reactions or corrections
5. **Problem Solving** — Reasoning chains, alternative approaches considered, debugging strategies applied
6. **All User Messages** — List ALL non-tool-result messages from the user, preserving their substance
7. **Pending Tasks** — Work that remains unfinished or was deferred
8. **Current Work** — Precise description of what was actively being worked on at conversation end, with file names and code fragments
9. **Optional Next Step** — MUST align directly with the user's most recent explicit requests. Include direct quotes showing which task was underway.

## Variants

### Partial Compact

When performing a partial compact, only summarize the most recent portion of the conversation. Earlier messages remain untouched and are kept intact — do not re-summarize them.

### Continuation Behavior

After receiving a compacted summary, resume work immediately. Do not acknowledge the summary, do not ask follow-up questions, do not restate what was summarized. Pick up exactly where things left off.

## Additional Instructions

If supplementary summarization directives appear in the surrounding context, follow those as well.

FINAL REMINDER: Do NOT invoke any tools. Respond exclusively with plain text.`

export const SESSION_TITLE_PROMPT = `Generate a concise 3-7 word title that captures the essence of this conversation.

## Constraints

- Reply with ONLY the title, nothing else
- No punctuation at the end
- No quotes or markdown formatting
- Maximum 7 words
- Focus on the main task or topic

## Examples

Good titles:
- "Add authentication to API endpoints"
- "Fix memory leak in worker process"
- "Refactor database connection pooling"
- "Implement rate limiting middleware"

Bad titles (too vague or too long):
- "Working on stuff"
- "This is a conversation about adding user authentication to the API endpoints for better security"

Output ONLY the title.`

export const AWAY_RECAP_PROMPT = `Generate a "while you were away" recap of what happened in this session.

## Constraints

- Keep it under 200 words
- Focus on key accomplishments and current state
- Mention any pending tasks or blockers
- Use bullet points for clarity
- Do not use tools

## Format

\`\`\`
## Session Summary

**Completed:**
- [list of completed tasks]

**In Progress:**
- [current work status]

**Pending:**
- [remaining tasks]

**Blockers:**
- [any issues blocking progress]
\`\`\`

Output ONLY the recap in this format.`

export const MEMORY_EXTRACTION_PROMPT = `Act as a memory extraction subagent. Examine the most recent ~N messages in the conversation and persist useful memories to the designated memory directory.

## Constraints

- Available tools: Read, Grep, Glob, read-only Bash, and Edit/Write restricted to the memory directory only. The \`rm\` command is not permitted.
- You have a limited turn budget. Use an efficient two-turn strategy:
  - **Turn 1** — Issue all Read calls in parallel to gather existing memory state
  - **Turn 2** — Issue all Write/Edit calls in parallel to apply changes
- You MUST draw exclusively from the last ~N messages. Do not investigate further — no grepping source files, no reading application code, no verifying claims.
- If the user explicitly requests something be remembered, persist it immediately.
- If the user explicitly requests something be forgotten, locate the relevant entry and remove it.

## What to Capture

Keep memories general and durable. Suitable categories include:

- **User preferences** — coding style, tool choices, naming conventions, communication preferences
- **Project patterns** — architectural decisions, directory conventions, dependency choices
- **Error corrections** — recurring mistakes and their proven fixes
- **Workflow notes** — deployment steps, testing procedures, environment quirks

## Organization

- Group memories semantically by topic, not by the order they appeared.
- When information overlaps with an existing memory, update the existing entry rather than creating a duplicate.
- When stored information is contradicted by newer evidence, replace or remove the outdated version.
- Before writing a new memory, check whether an equivalent one already exists.

## Format

Each memory entry should contain:

- **Statement** — The fact or preference being recorded
- **Evidence** — Brief supporting context from the conversation
- **Confidence** — high / medium / low`

export const MEMORY_CONSOLIDATION_PROMPT = `Perform periodic memory cleanup and consolidation.

## Constraints

- Only use Read and Write tools within the memory directory
- Do not remove memories marked as "high confidence" unless explicitly contradicted
- Merge duplicate or highly similar memories
- Remove outdated or no-longer-relevant information

## Process

1. Read all existing memory files
2. Identify duplicates and contradictions
3. Merge related memories into consolidated entries
4. Remove stale information
5. Write updated memory files

## Output Format

Report the changes made:

\`\`\`
## Memory Consolidation Report

**Merged:**
- [list of merged entries]

**Removed:**
- [list of removed entries with reason]

**Updated:**
- [list of updated entries]

**Total memories:** [count before] → [count after]
\`\`\``
