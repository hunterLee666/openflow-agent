import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";

const ApprovalInputSchema = z.object({
  action: z.enum(["request", "check", "cancel"]).describe("Action: request approval, check status, or cancel"),
  requestId: z.string().optional().describe("Request ID for check/cancel actions"),
  message: z.string().optional().describe("Message to show to the approver"),
  severity: z.enum(["low", "medium", "high", "critical"]).optional().default("medium").describe("Severity level"),
  timeout: z.number().optional().default(300).describe("Timeout in seconds to wait for approval"),
});

const pendingApprovals = new Map<string, {
  message: string;
  severity: string;
  createdAt: number;
  timeout: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  response?: string;
}>();

type ApprovalInput = z.infer<typeof ApprovalInputSchema>;

interface ApprovalResult {
  success: boolean;
  requestId?: string;
  status?: string;
  response?: string;
  message?: string;
  error?: string;
}

export function createApprovalTool(): ToolDefinition {
  return {
    name: "Approval",
    description: `Request human approval for sensitive or irreversible actions.
Use this tool when you need human confirmation before proceeding with:
- File deletions or destructive operations
- External API calls that modify data
- Commands that could affect system stability
- Operations requiring security clearance

The tool supports:
- request: Create a new approval request
- check: Check the status of an existing request
- cancel: Cancel a pending request`,
    inputSchema: ApprovalInputSchema,
    isReadOnly: false,
    isConcurrencySafe: true,
    async handler(rawInput: unknown): Promise<string> {
      const input = ApprovalInputSchema.parse(rawInput);
      console.log(`[Approval] Action: ${input.action}`);

      try {
        switch (input.action) {
          case "request": {
            const requestId = `apr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            pendingApprovals.set(requestId, {
              message: input.message || "Approval requested",
              severity: input.severity || "medium",
              createdAt: Date.now(),
              timeout: input.timeout || 300,
              status: "pending",
            });

            const result: ApprovalResult = {
              success: true,
              requestId,
              status: "pending",
              message: `[Approval Request Created]
Request ID: ${requestId}
Severity: ${input.severity || "medium"}
Message: ${input.message || "Approval requested"}
Timeout: ${input.timeout || 300}s

Waiting for human approval...`,
            };
            console.log(`[Approval] Request created: ${requestId}`);
            return JSON.stringify(result);
          }

          case "check": {
            if (!input.requestId) {
              return JSON.stringify({ success: false, error: "requestId is required for check action" });
            }
            const approval = pendingApprovals.get(input.requestId);
            if (!approval) {
              return JSON.stringify({ success: false, error: `Request ${input.requestId} not found` });
            }

            const result: ApprovalResult = {
              success: true,
              requestId: input.requestId,
              status: approval.status,
              response: approval.response,
              message: `[Approval Status]
Request ID: ${input.requestId}
Status: ${approval.status}
${approval.response ? `Response: ${approval.response}` : ""}
Created: ${new Date(approval.createdAt).toISOString()}`,
            };
            return JSON.stringify(result);
          }

          case "cancel": {
            if (!input.requestId) {
              return JSON.stringify({ success: false, error: "requestId is required for cancel action" });
            }
            const approval = pendingApprovals.get(input.requestId);
            if (!approval) {
              return JSON.stringify({ success: false, error: `Request ${input.requestId} not found` });
            }
            if (approval.status !== "pending") {
              return JSON.stringify({ success: false, error: `Request is already ${approval.status}` });
            }

            approval.status = "cancelled";
            const result: ApprovalResult = {
              success: true,
              requestId: input.requestId,
              status: "cancelled",
              message: `Approval request ${input.requestId} has been cancelled`,
            };
            console.log(`[Approval] Request cancelled: ${input.requestId}`);
            return JSON.stringify(result);
          }

          default:
            return JSON.stringify({ success: false, error: `Unknown action: ${input.action}` });
        }
      } catch (error) {
        const errorResult: ApprovalResult = {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
        console.error(`[Approval] Error: ${errorResult.error}`);
        return JSON.stringify(errorResult);
      }
    },
  };
}
