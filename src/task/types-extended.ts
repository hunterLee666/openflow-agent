export type TaskType =
  | "shell"
  | "agent"
  | "remote"
  | "workflow"
  | "teammate"
  | "mcp"
  | "dream";

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export type BackgroundTaskState =
  | ShellTaskState
  | AgentTaskState
  | RemoteTaskState
  | WorkflowTaskState
  | TeammateTaskState
  | McpTaskState
  | DreamTaskState;

export interface BaseTaskState {
  id: string;
  type: TaskType;
  status: TaskStatus;
  name: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  isBackgrounded?: boolean;
}

export interface ShellTaskState extends BaseTaskState {
  type: "shell";
  command: string;
  cwd?: string;
  exitCode?: number;
  output?: string;
}

export interface AgentTaskState extends BaseTaskState {
  type: "agent";
  agentId: string;
  goal?: string;
  progress?: AgentProgress;
  toolsUsed?: number;
  tokensUsed?: number;
}

export interface AgentProgress {
  toolUseCount: number;
  tokenCount: number;
  lastActivity?: ToolActivity;
  recentActivities?: ToolActivity[];
  summary?: string;
}

export interface ToolActivity {
  toolName: string;
  input: Record<string, unknown>;
  activityDescription?: string;
  isSearch?: boolean;
  isRead?: boolean;
}

export interface RemoteTaskState extends BaseTaskState {
  type: "remote";
  remoteId: string;
  connectionUrl: string;
  statusDetail?: string;
}

export interface WorkflowTaskState extends BaseTaskState {
  type: "workflow";
  steps: WorkflowStep[];
  currentStep?: number;
  results?: Record<string, unknown>;
}

export interface WorkflowStep {
  id: string;
  name: string;
  status: TaskStatus;
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
}

export interface TeammateTaskState extends BaseTaskState {
  type: "teammate";
  teammateId: string;
  messages?: TeammateMessage[];
  isInProcess?: boolean;
}

export interface TeammateMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface McpTaskState extends BaseTaskState {
  type: "mcp";
  serverName: string;
  operation: string;
  result?: unknown;
  error?: string;
}

export interface DreamTaskState extends BaseTaskState {
  type: "dream";
  prompt?: string;
  outcome?: string;
  iterations?: number;
}

export type TaskState =
  | ShellTaskState
  | AgentTaskState
  | RemoteTaskState
  | WorkflowTaskState
  | TeammateTaskState
  | McpTaskState
  | DreamTaskState;

export function isBackgroundTask(task: TaskState): boolean {
  if (task.status !== "running" && task.status !== "pending") {
    return false;
  }
  if ("isBackgrounded" in task && task.isBackgrounded === false) {
    return false;
  }
  return true;
}

export function isTaskRunning(task: TaskState): boolean {
  return task.status === "running";
}

export function isTaskCompleted(task: TaskState): boolean {
  return task.status === "completed";
}

export function isTaskFailed(task: TaskState): boolean {
  return task.status === "failed";
}

export function isTaskCancellable(task: TaskState): boolean {
  return task.status === "pending" || task.status === "running" || task.status === "paused";
}

export function getTaskDuration(task: TaskState): number | null {
  if (!task.startedAt) {
    return null;
  }
  const endTime = task.completedAt || Date.now();
  return endTime - task.startedAt;
}

export function getTaskProgress(task: TaskState): number {
  if (task.status === "completed") {
    return 100;
  }
  if (task.status === "failed" || task.status === "cancelled") {
    return 0;
  }
  if ("progress" in task && typeof task.progress === "number") {
    return task.progress;
  }
  if (task.type === "workflow" && "steps" in task) {
    const completedSteps = task.steps.filter(
      (s) => s.status === "completed" || s.status === "failed"
    ).length;
    return Math.round((completedSteps / task.steps.length) * 100);
  }
  return 0;
}

export function createShellTask(
  id: string,
  name: string,
  command: string,
  options?: { cwd?: string; isBackgrounded?: boolean }
): ShellTaskState {
  return {
    id,
    type: "shell",
    status: "pending",
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    command,
    cwd: options?.cwd,
    isBackgrounded: options?.isBackgrounded,
  };
}

export function createAgentTask(
  id: string,
  name: string,
  agentId: string,
  options?: { goal?: string; isBackgrounded?: boolean }
): AgentTaskState {
  return {
    id,
    type: "agent",
    status: "pending",
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agentId,
    goal: options?.goal,
    isBackgrounded: options?.isBackgrounded,
  };
}

export function createRemoteTask(
  id: string,
  name: string,
  remoteId: string,
  connectionUrl: string,
  options?: { isBackgrounded?: boolean }
): RemoteTaskState {
  return {
    id,
    type: "remote",
    status: "pending",
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    remoteId,
    connectionUrl,
    isBackgrounded: options?.isBackgrounded,
  };
}

export function createWorkflowTask(
  id: string,
  name: string,
  steps: { name: string }[],
  options?: { isBackgrounded?: boolean }
): WorkflowTaskState {
  return {
    id,
    type: "workflow",
    status: "pending",
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    steps: steps.map((step, index) => ({
      id: `${id}-step-${index}`,
      name: step.name,
      status: "pending" as TaskStatus,
    })),
    currentStep: 0,
    isBackgrounded: options?.isBackgrounded,
  };
}

export function createTeammateTask(
  id: string,
  name: string,
  teammateId: string,
  options?: { isBackgrounded?: boolean }
): TeammateTaskState {
  return {
    id,
    type: "teammate",
    status: "pending",
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    teammateId,
    messages: [],
    isInProcess: false,
    isBackgrounded: options?.isBackgrounded,
  };
}

export function createMcpTask(
  id: string,
  name: string,
  serverName: string,
  operation: string,
  options?: { isBackgrounded?: boolean }
): McpTaskState {
  return {
    id,
    type: "mcp",
    status: "pending",
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    serverName,
    operation,
    isBackgrounded: options?.isBackgrounded,
  };
}

export function createDreamTask(
  id: string,
  name: string,
  prompt?: string,
  options?: { isBackgrounded?: boolean }
): DreamTaskState {
  return {
    id,
    type: "dream",
    status: "pending",
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt,
    iterations: 0,
    isBackgrounded: options?.isBackgrounded,
  };
}

export interface TaskFilter {
  type?: TaskType;
  status?: TaskStatus;
  isBackgrounded?: boolean;
  olderThan?: number;
  newerThan?: number;
}

export function filterTasks(tasks: TaskState[], filter: TaskFilter): TaskState[] {
  return tasks.filter((task) => {
    if (filter.type !== undefined && task.type !== filter.type) {
      return false;
    }
    if (filter.status !== undefined && task.status !== filter.status) {
      return false;
    }
    if (filter.isBackgrounded !== undefined) {
      const isBackgrounded = task.isBackgrounded ?? false;
      if (isBackgrounded !== filter.isBackgrounded) {
        return false;
      }
    }
    if (filter.olderThan !== undefined && task.createdAt > filter.olderThan) {
      return false;
    }
    if (filter.newerThan !== undefined && task.createdAt < filter.newerThan) {
      return false;
    }
    return true;
  });
}

export function sortTasks(
  tasks: TaskState[],
  sortBy: "createdAt" | "updatedAt" | "name" | "status" = "updatedAt",
  order: "asc" | "desc" = "desc"
): TaskState[] {
  return [...tasks].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "createdAt":
        comparison = a.createdAt - b.createdAt;
        break;
      case "updatedAt":
        comparison = a.updatedAt - b.updatedAt;
        break;
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "status":
        comparison = a.status.localeCompare(b.status);
        break;
    }
    return order === "desc" ? -comparison : comparison;
  });
}
