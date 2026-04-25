export interface Tier3Summary {
  intent: string;
  concepts: string[];
  files: { path: string; note: string }[];
  errors: { title: string; repro: string }[];
  messageHighlights: string[];
  tasks: { id: string; done: boolean; text: string }[];
  currentFocus: string;
  environment: string;
  strippedCoT: { keptConclusions: string[] };
}

export function buildTier3SummaryPrompt(messages: Array<{ role: string; content: unknown }>): string {
  const conversationText = messages
    .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n---\n");

  return `Analyze this conversation and produce a structured Tier3 summary with exactly these 9 sections:

## 1. INTENT
What is the user's ultimate deliverable?

## 2. CONCEPTS
What terms/constraints must be unified? (list as bullet points)

## 3. FILES
Which paths are the "main battlefield"? (format: path: note)

## 4. ERRORS
What failures is the user currently stuck on? Include reproduction steps. (format: title: repro)

## 5. MESSAGES
What user quotes cannot be rewritten? (preserve exact wording)

## 6. TASKS
TODO list with completion criteria. (format: [ ] or [x])

## 7. CURRENT FOCUS
What is the next minimal action?

## 8. ENVIRONMENT
Version, branch, running commands? (format: key: value)

## 9. STRIPPED CoT
What conclusions were kept after chain-of-thought removal? (bullet points)

Conversation to analyze:
${conversationText}

Output ONLY valid JSON matching this schema:
{
  "intent": "string",
  "concepts": ["string"],
  "files": [{"path": "string", "note": "string"}],
  "errors": [{"title": "string", "repro": "string"}],
  "messageHighlights": ["string"],
  "tasks": [{"id": "string", "done": false, "text": "string"}],
  "currentFocus": "string",
  "environment": "string",
  "strippedCoT": {"keptConclusions": ["string"]}
}`;
}

export function formatTier3Summary(summary: Tier3Summary): string {
  const lines: string[] = ["## Tier3 Context Summary"];

  lines.push("\n### 1. INTENT");
  lines.push(summary.intent);

  lines.push("\n### 2. CONCEPTS");
  for (const concept of summary.concepts) {
    lines.push(`- ${concept}`);
  }

  lines.push("\n### 3. FILES");
  for (const file of summary.files) {
    lines.push(`- ${file.path}: ${file.note}`);
  }

  lines.push("\n### 4. ERRORS");
  for (const error of summary.errors) {
    lines.push(`- ${error.title}: ${error.repro}`);
  }

  lines.push("\n### 5. MESSAGES");
  for (const msg of summary.messageHighlights) {
    lines.push(`- "${msg}"`);
  }

  lines.push("\n### 6. TASKS");
  for (const task of summary.tasks) {
    const check = task.done ? "[x]" : "[ ]";
    lines.push(`- ${check} ${task.text}`);
  }

  lines.push("\n### 7. CURRENT FOCUS");
  lines.push(summary.currentFocus);

  lines.push("\n### 8. ENVIRONMENT");
  lines.push(summary.environment);

  lines.push("\n### 9. STRIPPED CoT");
  for (const conclusion of summary.strippedCoT.keptConclusions) {
    lines.push(`- ${conclusion}`);
  }

  return lines.join("\n");
}
