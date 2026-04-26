import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { createReadOnlyTool, createWriteTool } from "./tool-factory.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const GitHubListPRsInputSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  state: z.enum(["open", "closed", "all"]).optional(),
});

const GitHubGetPRInputSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  prNumber: z.number().int().positive("prNumber 必须是正整数"),
});

const GitHubListIssuesInputSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  state: z.enum(["open", "closed", "all"]).optional(),
  labels: z.string().optional(),
});

const GitHubCreateIssueInputSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  title: z.string().min(1, "title 不能为空"),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

const GitHubCommentOnPRInputSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  prNumber: z.number().int().positive("prNumber 必须是正整数"),
  body: z.string().min(1, "body 不能为空"),
});

const GitHubGetPRFilesInputSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  prNumber: z.number().int().positive("prNumber 必须是正整数"),
});

const GitHubSearchCodeInputSchema = z.object({
  query: z.string().min(1, "query 不能为空"),
});

const GitHubOutputSchema = z.object({
  message: z.string(),
  data: z.unknown().optional(),
});

export interface GitHubConfig {
  token?: string;
  owner?: string;
  repo?: string;
  baseUrl?: string;
}

const DEFAULT_CONFIG: GitHubConfig = {
  baseUrl: "https://api.github.com",
};

export function createGitHubTools(config: GitHubConfig = {}): ToolDefinition[] {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const token = config.token || process.env.GITHUB_TOKEN || "";
  const owner = config.owner || "";
  const repo = config.repo || "";

  const headers = token ? `-H "Authorization: token ${token}" -H "Accept: application/vnd.github.v3+json"` : "";

  const gitHubListPRsTool = createReadOnlyTool({
    name: "GitHubListPRs",
    description: "List pull requests in the repository",
    inputSchema: GitHubListPRsInputSchema,
    outputSchema: GitHubOutputSchema,
    resourceKeys: ["owner", "repo"],
    handler: async (input) => {
      const prOwner = input.owner || owner;
      const prRepo = input.repo || repo;
      const state = input.state || "open";

      if (!prOwner || !prRepo) {
        throw new Error("owner and repo are required. Provide them in config or input.");
      }

      const command = `curl -s ${headers} "${mergedConfig.baseUrl}/repos/${prOwner}/${prRepo}/pulls?state=${state}"`;
      const { stdout } = await execAsync(command);
      const prs = JSON.parse(stdout);

      if (prs.length === 0) {
        return { message: `No ${state} pull requests found in ${prOwner}/${prRepo}` };
      }

      const lines = [`# Pull Requests in ${prOwner}/${prRepo} (${state})`, ""];
      for (const pr of prs.slice(0, 20)) {
        lines.push(`- #${pr.number}: ${pr.title}`);
        lines.push(`  - Author: ${pr.user?.login || "unknown"}`);
        lines.push(`  - Created: ${new Date(pr.created_at).toLocaleDateString()}`);
        lines.push(`  - URL: ${pr.html_url}`);
        lines.push("");
      }

      return { message: lines.join("\n") };
    },
  });

  const gitHubGetPRTool = createReadOnlyTool({
    name: "GitHubGetPR",
    description: "Get details of a specific pull request",
    inputSchema: GitHubGetPRInputSchema,
    outputSchema: GitHubOutputSchema,
    resourceKeys: ["owner", "repo", "prNumber"],
    handler: async (input) => {
      const prOwner = input.owner || owner;
      const prRepo = input.repo || repo;

      if (!prOwner || !prRepo) {
        throw new Error("owner and repo are required.");
      }

      const command = `curl -s ${headers} "${mergedConfig.baseUrl}/repos/${prOwner}/${prRepo}/pulls/${input.prNumber}"`;
      const { stdout } = await execAsync(command);
      const pr = JSON.parse(stdout);

      if (pr.message) {
        throw new Error(pr.message);
      }

      const lines = [
        `# PR #${pr.number}: ${pr.title}`,
        "",
        `**Author:** ${pr.user?.login || "unknown"}`,
        `**State:** ${pr.state}`,
        `**Created:** ${new Date(pr.created_at).toLocaleDateString()}`,
        `**Updated:** ${new Date(pr.updated_at).toLocaleDateString()}`,
        "",
        "## Description",
        pr.body || "No description provided.",
        "",
        `**URL:** ${pr.html_url}`,
      ];

      return { message: lines.join("\n") };
    },
  });

  const gitHubListIssuesTool = createReadOnlyTool({
    name: "GitHubListIssues",
    description: "List issues in the repository",
    inputSchema: GitHubListIssuesInputSchema,
    outputSchema: GitHubOutputSchema,
    resourceKeys: ["owner", "repo"],
    handler: async (input) => {
      const issueOwner = input.owner || owner;
      const issueRepo = input.repo || repo;
      const state = input.state || "open";

      if (!issueOwner || !issueRepo) {
        throw new Error("owner and repo are required.");
      }

      let url = `${mergedConfig.baseUrl}/repos/${issueOwner}/${issueRepo}/issues?state=${state}`;
      if (input.labels) {
        url += `&labels=${input.labels}`;
      }

      const command = `curl -s ${headers} "${url}"`;
      const { stdout } = await execAsync(command);
      const issues = JSON.parse(stdout);

      if (issues.length === 0) {
        return { message: `No ${state} issues found in ${issueOwner}/${issueRepo}` };
      }

      const lines = [`# Issues in ${issueOwner}/${issueRepo} (${state})`, ""];
      for (const issue of issues.slice(0, 20)) {
        lines.push(`- #${issue.number}: ${issue.title}`);
        lines.push(`  - Author: ${issue.user?.login || "unknown"}`);
        lines.push(`  - Labels: ${(issue.labels || []).map((l: any) => l.name || l).join(", ")}`);
        lines.push(`  - URL: ${issue.html_url}`);
        lines.push("");
      }

      return { message: lines.join("\n") };
    },
  });

  const gitHubCreateIssueTool = createWriteTool({
    name: "GitHubCreateIssue",
    description: "Create a new issue in the repository",
    inputSchema: GitHubCreateIssueInputSchema,
    outputSchema: GitHubOutputSchema,
    resourceKeys: ["owner", "repo"],
    handler: async (input) => {
      const issueOwner = input.owner || owner;
      const issueRepo = input.repo || repo;

      if (!issueOwner || !issueRepo) {
        throw new Error("owner and repo are required.");
      }

      if (!token) {
        throw new Error("GITHUB_TOKEN environment variable is required.");
      }

      const bodyData = { title: input.title, body: input.body || "", labels: input.labels || [] };
      const command = `curl -s -X POST ${headers} -H "Content-Type: application/json" -d '${JSON.stringify(bodyData)}' "${mergedConfig.baseUrl}/repos/${issueOwner}/${issueRepo}/issues"`;
      const { stdout } = await execAsync(command);
      const issue = JSON.parse(stdout);

      if (issue.message) {
        throw new Error(issue.message);
      }

      return { message: `Created issue #${issue.number}: ${issue.title}\nURL: ${issue.html_url}` };
    },
  });

  const gitHubCommentOnPRTool = createWriteTool({
    name: "GitHubCommentOnPR",
    description: "Add a comment to a pull request",
    inputSchema: GitHubCommentOnPRInputSchema,
    outputSchema: GitHubOutputSchema,
    resourceKeys: ["owner", "repo", "prNumber"],
    handler: async (input) => {
      const commentOwner = input.owner || owner;
      const commentRepo = input.repo || repo;

      if (!commentOwner || !commentRepo) {
        throw new Error("owner and repo are required.");
      }

      if (!token) {
        throw new Error("GITHUB_TOKEN environment variable is required.");
      }

      const bodyData = { body: input.body };
      const command = `curl -s -X POST ${headers} -H "Content-Type: application/json" -d '${JSON.stringify(bodyData)}' "${mergedConfig.baseUrl}/repos/${commentOwner}/${commentRepo}/issues/${input.prNumber}/comments"`;
      const { stdout } = await execAsync(command);
      const comment = JSON.parse(stdout);

      if (comment.message) {
        throw new Error(comment.message);
      }

      return { message: `Comment added to PR #${input.prNumber}\nURL: ${comment.html_url}` };
    },
  });

  const gitHubGetPRFilesTool = createReadOnlyTool({
    name: "GitHubGetPRFiles",
    description: "Get the list of files changed in a pull request",
    inputSchema: GitHubGetPRFilesInputSchema,
    outputSchema: GitHubOutputSchema,
    resourceKeys: ["owner", "repo", "prNumber"],
    handler: async (input) => {
      const filesOwner = input.owner || owner;
      const filesRepo = input.repo || repo;

      if (!filesOwner || !filesRepo) {
        throw new Error("owner and repo are required.");
      }

      const command = `curl -s ${headers} "${mergedConfig.baseUrl}/repos/${filesOwner}/${filesRepo}/pulls/${input.prNumber}/files"`;
      const { stdout } = await execAsync(command);
      const files = JSON.parse(stdout);

      if (files.message) {
        throw new Error(files.message);
      }

      const lines = [`# Files changed in PR #${input.prNumber}`, ""];
      for (const file of files) {
        lines.push(`- ${file.filename}`);
        lines.push(`  - Status: ${file.status}`);
        lines.push(`  - Additions: ${file.additions}, Deletions: ${file.deletions}`);
        lines.push("");
      }

      return { message: lines.join("\n") };
    },
  });

  const gitHubSearchCodeTool = createReadOnlyTool({
    name: "GitHubSearchCode",
    description: "Search for code across repositories",
    inputSchema: GitHubSearchCodeInputSchema,
    outputSchema: GitHubOutputSchema,
    handler: async (input) => {
      if (!token) {
        throw new Error("GITHUB_TOKEN environment variable is required.");
      }

      const encodedQuery = encodeURIComponent(input.query);
      const command = `curl -s ${headers} "${mergedConfig.baseUrl}/search/code?q=${encodedQuery}"`;
      const { stdout } = await execAsync(command);
      const result = JSON.parse(stdout);

      if (result.message) {
        throw new Error(result.message);
      }

      const lines = [`# Search Results for: ${input.query}`, "", `Total: ${result.total_count} results`, ""];
      for (const item of (result.items || []).slice(0, 20)) {
        lines.push(`- ${item.path}`);
        lines.push(`  - Repository: ${item.repository.full_name}`);
        lines.push(`  - URL: ${item.html_url}`);
        lines.push("");
      }

      return { message: lines.join("\n") };
    },
  });

  return [gitHubListPRsTool, gitHubGetPRTool, gitHubListIssuesTool, gitHubCreateIssueTool, gitHubCommentOnPRTool, gitHubGetPRFilesTool, gitHubSearchCodeTool];
}
