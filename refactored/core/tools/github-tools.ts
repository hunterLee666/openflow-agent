import type { ToolDefinition } from "../types/index.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

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

  return [
    {
      name: "GitHubListPRs",
      description: "List pull requests in the repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner (defaults to config)" },
          repo: { type: "string", description: "Repository name (defaults to config)" },
          state: { type: "string", description: "PR state: open, closed, all (default: open)", enum: ["open", "closed", "all"] },
        },
        required: [],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { owner: prOwner = owner, repo: prRepo = repo, state = "open" } = input as Record<string, string>;

        if (!prOwner || !prRepo) {
          return "Error: owner and repo are required. Provide them in config or input.";
        }

        try {
          const command = `curl -s ${headers} "${mergedConfig.baseUrl}/repos/${prOwner}/${prRepo}/pulls?state=${state}"`;
          const { stdout } = await execAsync(command);
          const prs = JSON.parse(stdout);

          if (prs.length === 0) {
            return `No ${state} pull requests found in ${prOwner}/${prRepo}`;
          }

          const lines = [`# Pull Requests in ${prOwner}/${prRepo} (${state})`, ""];
          for (const pr of prs.slice(0, 20)) {
            lines.push(`- #${pr.number}: ${pr.title}`);
            lines.push(`  - Author: ${pr.user?.login || "unknown"}`);
            lines.push(`  - Created: ${new Date(pr.created_at).toLocaleDateString()}`);
            lines.push(`  - URL: ${pr.html_url}`);
            lines.push("");
          }

          return lines.join("\n");
        } catch (error) {
          return `Failed to list PRs: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "GitHubGetPR",
      description: "Get details of a specific pull request",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          prNumber: { type: "number", description: "Pull request number" },
        },
        required: ["prNumber"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { owner: prOwner = owner, repo: prRepo = repo, prNumber } = input as Record<string, unknown> & { prNumber: number };

        if (!prOwner || !prRepo) {
          return "Error: owner and repo are required.";
        }

        try {
          const command = `curl -s ${headers} "${mergedConfig.baseUrl}/repos/${prOwner}/${prRepo}/pulls/${prNumber}"`;
          const { stdout } = await execAsync(command);
          const pr = JSON.parse(stdout);

          if (pr.message) {
            return `Error: ${pr.message}`;
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

          return lines.join("\n");
        } catch (error) {
          return `Failed to get PR details: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "GitHubListIssues",
      description: "List issues in the repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: { type: "string", description: "Issue state: open, closed, all", enum: ["open", "closed", "all"] },
          labels: { type: "string", description: "Comma-separated labels to filter by" },
        },
        required: [],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { owner: issueOwner = owner, repo: issueRepo = repo, state = "open", labels } = input as Record<string, string>;

        if (!issueOwner || !issueRepo) {
          return "Error: owner and repo are required.";
        }

        try {
          let url = `${mergedConfig.baseUrl}/repos/${issueOwner}/${issueRepo}/issues?state=${state}`;
          if (labels) {
            url += `&labels=${labels}`;
          }

          const command = `curl -s ${headers} "${url}"`;
          const { stdout } = await execAsync(command);
          const issues = JSON.parse(stdout);

          if (issues.length === 0) {
            return `No ${state} issues found in ${issueOwner}/${issueRepo}`;
          }

          const lines = [`# Issues in ${issueOwner}/${issueRepo} (${state})`, ""];
          for (const issue of issues.slice(0, 20)) {
            lines.push(`- #${issue.number}: ${issue.title}`);
            lines.push(`  - Author: ${issue.user?.login || "unknown"}`);
            lines.push(`  - Labels: ${(issue.labels || []).map((l: any) => l.name || l).join(", ")}`);
            lines.push(`  - URL: ${issue.html_url}`);
            lines.push("");
          }

          return lines.join("\n");
        } catch (error) {
          return `Failed to list issues: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "GitHubCreateIssue",
      description: "Create a new issue in the repository",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          title: { type: "string", description: "Issue title" },
          body: { type: "string", description: "Issue body/description" },
          labels: { type: "array", items: { type: "string" }, description: "Labels to apply" },
        },
        required: ["title"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { owner: issueOwner = owner, repo: issueRepo = repo, title, body = "", labels = [] } = input as Record<string, unknown> & { title: string; body?: string; labels?: string[] };

        if (!issueOwner || !issueRepo) {
          return "Error: owner and repo are required.";
        }

        if (!token) {
          return "Error: GITHUB_TOKEN environment variable is required.";
        }

        try {
          const bodyData = { title, body, labels };
          const command = `curl -s -X POST ${headers} -H "Content-Type: application/json" -d '${JSON.stringify(bodyData)}' "${mergedConfig.baseUrl}/repos/${issueOwner}/${issueRepo}/issues"`;
          const { stdout } = await execAsync(command);
          const issue = JSON.parse(stdout);

          if (issue.message) {
            return `Error: ${issue.message}`;
          }

          return `Created issue #${issue.number}: ${issue.title}\nURL: ${issue.html_url}`;
        } catch (error) {
          return `Failed to create issue: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "GitHubCommentOnPR",
      description: "Add a comment to a pull request",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          prNumber: { type: "number", description: "Pull request number" },
          body: { type: "string", description: "Comment body" },
        },
        required: ["prNumber", "body"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { owner: commentOwner = owner, repo: commentRepo = repo, prNumber, body } = input as Record<string, unknown> & { prNumber: number; body: string };

        if (!commentOwner || !commentRepo) {
          return "Error: owner and repo are required.";
        }

        if (!token) {
          return "Error: GITHUB_TOKEN environment variable is required.";
        }

        try {
          const bodyData = { body };
          const command = `curl -s -X POST ${headers} -H "Content-Type: application/json" -d '${JSON.stringify(bodyData)}' "${mergedConfig.baseUrl}/repos/${commentOwner}/${commentRepo}/issues/${prNumber}/comments"`;
          const { stdout } = await execAsync(command);
          const comment = JSON.parse(stdout);

          if (comment.message) {
            return `Error: ${comment.message}`;
          }

          return `Comment added to PR #${prNumber}\nURL: ${comment.html_url}`;
        } catch (error) {
          return `Failed to comment on PR: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "GitHubGetPRFiles",
      description: "Get the list of files changed in a pull request",
      inputSchema: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          prNumber: { type: "number", description: "Pull request number" },
        },
        required: ["prNumber"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { filesOwner = owner, filesRepo = repo, prNumber } = input as Record<string, unknown> & { prNumber: number };

        if (!filesOwner || !filesRepo) {
          return "Error: owner and repo are required.";
        }

        try {
          const command = `curl -s ${headers} "${mergedConfig.baseUrl}/repos/${filesOwner}/${filesRepo}/pulls/${prNumber}/files"`;
          const { stdout } = await execAsync(command);
          const files = JSON.parse(stdout);

          if (files.message) {
            return `Error: ${files.message}`;
          }

          const lines = [`# Files changed in PR #${prNumber}`, ""];
          for (const file of files) {
            lines.push(`- ${file.filename}`);
            lines.push(`  - Status: ${file.status}`);
            lines.push(`  - Additions: ${file.additions}, Deletions: ${file.deletions}`);
            lines.push("");
          }

          return lines.join("\n");
        } catch (error) {
          return `Failed to get PR files: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "GitHubSearchCode",
      description: "Search for code across repositories",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (e.g., 'function_name repo:owner/repo')" },
        },
        required: ["query"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { query } = input as { query: string };

        if (!token) {
          return "Error: GITHUB_TOKEN environment variable is required.";
        }

        try {
          const encodedQuery = encodeURIComponent(query);
          const command = `curl -s ${headers} "${mergedConfig.baseUrl}/search/code?q=${encodedQuery}"`;
          const { stdout } = await execAsync(command);
          const result = JSON.parse(stdout);

          if (result.message) {
            return `Error: ${result.message}`;
          }

          const lines = [`# Search Results for: ${query}`, "", `Total: ${result.total_count} results`, ""];
          for (const item of (result.items || []).slice(0, 20)) {
            lines.push(`- ${item.path}`);
            lines.push(`  - Repository: ${item.repository.full_name}`);
            lines.push(`  - URL: ${item.html_url}`);
            lines.push("");
          }

          return lines.join("\n");
        } catch (error) {
          return `Failed to search code: ${(error as Error).message}`;
        }
      },
    },
  ];
}
