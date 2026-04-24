export interface TaskState {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  isBackgrounded?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SessionState {
  id: string;
  active: boolean;
  taskId?: string;
  mode?: string;
}

export interface AppState {
  tasks: Record<string, TaskState>;
  sessions: Record<string, SessionState>;
  viewingTaskId?: string;
  viewingSessionId?: string;
  currentMode?: string;
}

export type ActiveAgentForInput =
  | { type: 'leader' }
  | { type: 'viewed'; task: TaskState }
  | { type: 'named_agent'; task: TaskState };

export function getViewedTask(state: Pick<AppState, 'viewingTaskId' | 'tasks'>): TaskState | undefined {
  const { viewingTaskId, tasks } = state;
  if (!viewingTaskId) return undefined;
  return tasks[viewingTaskId];
}

export function getActiveAgentForInput(state: AppState): ActiveAgentForInput {
  const viewedTask = getViewedTask(state);
  if (viewedTask) {
    return { type: 'viewed', task: viewedTask };
  }

  const { viewingSessionId, sessions } = state;
  if (viewingSessionId) {
    const session = sessions[viewingSessionId];
    if (session?.taskId) {
      const task = state.tasks[session.taskId];
      if (task) {
        return { type: 'named_agent', task };
      }
    }
  }

  return { type: 'leader' };
}

export function isBackgroundTask(task: TaskState): boolean {
  if (task.status !== 'running' && task.status !== 'pending') {
    return false;
  }
  if ('isBackgrounded' in task && task.isBackgrounded === false) {
    return false;
  }
  return true;
}

export function getBackgroundTasks(state: Pick<AppState, 'tasks'>): TaskState[] {
  return Object.values(state.tasks).filter(isBackgroundTask);
}

export function getRunningTasks(state: Pick<AppState, 'tasks'>): TaskState[] {
  return Object.values(state.tasks).filter((t) => t.status === 'running');
}

export function getCompletedTasks(state: Pick<AppState, 'tasks'>): TaskState[] {
  return Object.values(state.tasks).filter((t) => t.status === 'completed' || t.status === 'failed');
}

export function getActiveSessions(state: Pick<AppState, 'sessions'>): SessionState[] {
  return Object.values(state.sessions).filter((s) => s.active);
}

export function getTaskById(state: Pick<AppState, 'tasks'>, taskId: string): TaskState | undefined {
  return state.tasks[taskId];
}

export function getSessionById(state: Pick<AppState, 'sessions'>, sessionId: string): SessionState | undefined {
  return state.sessions[sessionId];
}

export function hasActiveTasks(state: Pick<AppState, 'tasks'>): boolean {
  return Object.values(state.tasks).some((t) => t.status === 'running' || t.status === 'pending');
}

export function getTaskCount(state: Pick<AppState, 'tasks'>): { running: number; pending: number; completed: number; failed: number } {
  const tasks = Object.values(state.tasks);
  return {
    running: tasks.filter((t) => t.status === 'running').length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
  };
}

export function createSelector<T extends Record<string, unknown>, R>(
  selector: (state: T) => R
): (state: T) => R {
  return selector;
}

export function memoizedSelector<T extends Record<string, unknown>, R>(
  selector: (state: T) => R,
  equalityFn: (a: R, b: R) => boolean = Object.is
): (state: T) => R {
  let lastValue: R | undefined;
  let lastState: T | undefined;

  return (state: T): R => {
    if (lastState === state && lastValue !== undefined) {
      return lastValue;
    }
    const newValue = selector(state);
    if (equalityFn(newValue, lastValue as R)) {
      return lastValue as R;
    }
    lastValue = newValue;
    lastState = state;
    return newValue;
  };
}
