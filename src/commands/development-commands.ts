import { analyzeProject, formatProjectAnalysis } from "./dev-commands.js";
import { reviewCode, formatReviewResults, type ReviewConfig } from "./code-review.js";
import { initializeProject } from "./init-commands.js";
import {
  createCheckpoint,
  listCheckpoints,
  undoToCheckpoint,
  undoLastChange,
  getDiff,
  getStagedDiff,
  formatCheckpoints,
} from "./undo-commands.js";

export function createDevCommands(workspaceRoot: string) {
  return {
    review: async (args: string) => {
      const parts = args.trim().split(/\s+/);
      const target = parts[0] || ".";
      const targetPath = target === "." ? workspaceRoot : `${workspaceRoot}/${target}`;

      const config: ReviewConfig = {
        categories: ["security", "performance", "style", "bug", "maintainability"],
      };

      try {
        const results = await reviewCode(targetPath, config);
        if (results.length === 0) {
          return "No files found to review.";
        }
        return formatReviewResults(results);
      } catch (error) {
        return `Error reviewing code: ${(error as Error).message}`;
      }
    },

    init: async (args: string) => {
      try {
        const result = await initializeProject({
          workspaceRoot,
          projectName: args.trim() || undefined,
        });
        return `Project initialized successfully!\n\n${result}`;
      } catch (error) {
        return `Error initializing project: ${(error as Error).message}`;
      }
    },

    tree: async (args: string) => {
      const target = args.trim() || ".";
      const targetPath = target === "." ? workspaceRoot : `${workspaceRoot}/${target}`;

      try {
        const analysis = await analyzeProject(targetPath);
        return formatProjectAnalysis(analysis);
      } catch (error) {
        return `Error generating tree: ${(error as Error).message}`;
      }
    },

    overview: async () => {
      try {
        const analysis = await analyzeProject(workspaceRoot);
        return formatProjectAnalysis(analysis);
      } catch (error) {
        return `Error generating overview: ${(error as Error).message}`;
      }
    },

    diff: async (args: string) => {
      const target = args.trim() || undefined;
      try {
        return await getDiff(workspaceRoot, target);
      } catch (error) {
        return `Error getting diff: ${(error as Error).message}`;
      }
    },

    staged: async () => {
      try {
        return await getStagedDiff(workspaceRoot);
      } catch (error) {
        return `Error getting staged diff: ${(error as Error).message}`;
      }
    },

    undo: async (args: string) => {
      const parts = args.trim().split(/\s+/);
      const action = parts[0] || "last";

      if (action === "last") {
        const result = await undoLastChange(workspaceRoot);
        return result.message;
      }

      if (action === "to") {
        const checkpointId = parts[1];
        if (!checkpointId) {
          return "Usage: /undo to <checkpoint-id>";
        }
        const result = await undoToCheckpoint(workspaceRoot, checkpointId);
        return result.message;
      }

      return "Usage: /undo [last|to <checkpoint-id>]";
    },

    checkpoint: async (args: string) => {
      const parts = args.trim().split(/\s+/);
      const action = parts[0] || "list";

      if (action === "create") {
        const description = parts.slice(1).join(" ") || "Manual checkpoint";
        const result = await createCheckpoint(workspaceRoot, description);
        return `Checkpoint created: ${result.id}\nFiles changed: ${result.filesChanged}`;
      }

      if (action === "list") {
        const checkpoints = await listCheckpoints(workspaceRoot);
        return formatCheckpoints(checkpoints);
      }

      return "Usage: /checkpoint [create <description>|list]";
    },
  };
}
