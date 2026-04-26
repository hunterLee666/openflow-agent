import { z } from "zod";

export const StructuredMessageSchema = z.object({
  summary: z.string(),
  evidence: z.array(z.string()),
  touchedFiles: z.array(z.string()),
  commandsRun: z.array(z.string()),
  openQuestions: z.array(z.string()),
  verdict: z.enum(["PASS", "FAIL", "PARTIAL"]).optional(),
});

export type StructuredMessage = z.infer<typeof StructuredMessageSchema>;

export const MessageRouteConfigSchema = z.object({
  maxEvidenceLength: z.number(),
  maxFilesCount: z.number(),
  enableSanitization: z.boolean(),
});

export type MessageRouteConfig = z.infer<typeof MessageRouteConfigSchema>;

const DEFAULT_CONFIG: MessageRouteConfig = {
  maxEvidenceLength: 2000,
  maxFilesCount: 20,
  enableSanitization: true,
};

export class MessageRouter {
  private config: MessageRouteConfig;

  constructor(config?: Partial<MessageRouteConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  parseStructuredResponse(content: string): StructuredMessage {
    const message: StructuredMessage = {
      summary: "",
      evidence: [],
      touchedFiles: [],
      commandsRun: [],
      openQuestions: [],
    };

    const summaryMatch = content.match(/###\s*Summary\s*\n([\s\S]*?)(?=\n###|$)/);
    if (summaryMatch) {
      message.summary = summaryMatch[1].trim();
    }

    const evidenceMatch = content.match(/###\s*Evidence\s*\n([\s\S]*?)(?=\n###|$)/);
    if (evidenceMatch) {
      message.evidence = this.parseList(evidenceMatch[1]);
    }

    const filesMatch = content.match(/###\s*(?:Touched\s*Files|Files)\s*\n([\s\S]*?)(?=\n###|$)/);
    if (filesMatch) {
      message.touchedFiles = this.parseList(filesMatch[1]);
    }

    const commandsMatch = content.match(/###\s*(?:Commands\s*Run|Commands)\s*\n([\s\S]*?)(?=\n###|$)/);
    if (commandsMatch) {
      message.commandsRun = this.parseList(commandsMatch[1]);
    }

    const questionsMatch = content.match(/###\s*(?:Open\s*Questions|Questions)\s*\n([\s\S]*?)(?=\n###|$)/);
    if (questionsMatch) {
      message.openQuestions = this.parseList(questionsMatch[1]);
    }

    const verdictMatch = content.match(/###\s*Verdict:\s*(PASS|FAIL|PARTIAL)/i);
    if (verdictMatch) {
      message.verdict = verdictMatch[1].toUpperCase() as "PASS" | "FAIL" | "PARTIAL";
    }

    if (!message.summary) {
      message.summary = this.extractFallbackSummary(content);
    }

    return this.sanitize(message);
  }

  mergeResults(results: StructuredMessage[]): StructuredMessage {
    const merged: StructuredMessage = {
      summary: "",
      evidence: [],
      touchedFiles: [],
      commandsRun: [],
      openQuestions: [],
    };

    const allFiles = new Set<string>();
    const allCommands = new Set<string>();
    const allEvidence = new Set<string>();
    const allQuestions = new Set<string>();

    for (const result of results) {
      for (const file of result.touchedFiles) {
        allFiles.add(file);
      }
      for (const cmd of result.commandsRun) {
        allCommands.add(cmd);
      }
      for (const ev of result.evidence) {
        allEvidence.add(ev);
      }
      for (const q of result.openQuestions) {
        allQuestions.add(q);
      }
    }

    merged.touchedFiles = Array.from(allFiles).slice(0, this.config.maxFilesCount);
    merged.commandsRun = Array.from(allCommands);
    merged.evidence = Array.from(allEvidence).slice(0, this.config.maxEvidenceLength);
    merged.openQuestions = Array.from(allQuestions);

    const conflicts = this.detectConflicts(results);
    if (conflicts.length > 0) {
      merged.openQuestions.push(...conflicts);
    }

    merged.summary = this.generateMergeSummary(results);

    return merged;
  }

  detectConflicts(results: StructuredMessage[]): string[] {
    const conflicts: string[] = [];
    const fileSources = new Map<string, string[]>();

    for (const result of results) {
      for (const file of result.touchedFiles) {
        if (!fileSources.has(file)) {
          fileSources.set(file, []);
        }
        fileSources.get(file)!.push(result.summary);
      }
    }

    for (const [file, sources] of fileSources) {
      if (sources.length > 1) {
        conflicts.push(`Multiple agents touched ${file} — verify for conflicts`);
      }
    }

    const verdicts = results.map((r) => r.verdict).filter(Boolean);
    if (verdicts.length > 1) {
      const uniqueVerdicts = new Set(verdicts);
      if (uniqueVerdicts.size > 1) {
        conflicts.push(`Conflicting verdicts: ${Array.from(uniqueVerdicts).join(", ")}`);
      }
    }

    return conflicts;
  }

  formatForParent(message: StructuredMessage): string {
    const parts = [
      `### Summary`,
      message.summary,
      ``,
      `### Evidence`,
      ...message.evidence.map((e) => `- ${e}`),
      ``,
      `### Touched Files`,
      ...message.touchedFiles.map((f) => `- ${f}`),
      ``,
      `### Commands Run`,
      ...message.commandsRun.map((c) => `- ${c}`),
      ``,
      `### Open Questions`,
      ...message.openQuestions.map((q) => `- ${q}`),
    ];

    if (message.verdict) {
      parts.push(``, `### Verdict: ${message.verdict}`);
    }

    return parts.join("\n");
  }

  private parseList(text: string): string[] {
    return text
      .split("\n")
      .map((line) => line.replace(/^[-*\d.]+\s*/, "").trim())
      .filter((line) => line.length > 0);
  }

  private extractFallbackSummary(content: string): string {
    const lines = content.split("\n").filter((l) => l.trim());
    const firstMeaningful = lines.find((l) => !l.startsWith("#") && !l.startsWith("-") && l.trim().length > 20);
    return firstMeaningful?.trim() || content.slice(0, 200);
  }

  private generateMergeSummary(results: StructuredMessage[]): string {
    const summaries = results.map((r) => r.summary).filter(Boolean);
    if (summaries.length === 0) return "No summary available";
    if (summaries.length === 1) return summaries[0];
    return `Merged from ${results.length} sub-agents: ${summaries.slice(0, 3).join("; ")}${results.length > 3 ? ` and ${results.length - 3} more` : ""}`;
  }

  private sanitize(message: StructuredMessage): StructuredMessage {
    if (!this.config.enableSanitization) return message;

    const sanitized = { ...message };
    sanitized.evidence = sanitized.evidence.map((e) => this.sanitizeText(e));
    sanitized.touchedFiles = sanitized.touchedFiles.map((f) => this.sanitizeText(f));
    sanitized.commandsRun = sanitized.commandsRun.map((c) => this.sanitizeText(c));
    sanitized.openQuestions = sanitized.openQuestions.map((q) => this.sanitizeText(q));
    sanitized.summary = this.sanitizeText(sanitized.summary);

    return sanitized;
  }

  private sanitizeText(text: string): string {
    const patterns = [
      /(?:password|secret|token|key|api_key)\s*[=:]\s*\S+/gi,
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
    ];

    let sanitized = text;
    for (const pattern of patterns) {
      sanitized = sanitized.replace(pattern, "[REDACTED]");
    }

    return sanitized;
  }
}

export function createMessageRouter(config?: Partial<MessageRouteConfig>): MessageRouter {
  return new MessageRouter(config);
}
