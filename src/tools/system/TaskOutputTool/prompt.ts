export const TOOL_NAME_FOR_PROMPT = 'TaskOutput'

export const DESCRIPTION = 'Retrieves output from a running or completed task'

export const PROMPT = `Retrieve output from a running or completed task.

## When to Use
- To check the output of a background shell started with bash_run
- To get results from a delegated agent task (task_run) before it completes
- To monitor long-running operations without blocking the conversation

## Approach
- Set block=true to wait until the task finishes and capture full output (default)
- Set block=false to check status non-blocking; useful for polling long tasks
- Task IDs can be obtained from /tasks or from the result of a previous task_run call

## Parameters
- task_id (required): Identifier of the task to query
- block (optional): If true, wait for task completion (default: true)

## Output
- task_id: The queried task ID
- status: "running", "completed", "failed", or "cancelled"
- output: The task's stdout/stderr if available
- exit_code: For shell tasks, the process exit code (if completed)
- error: Error message if the task failed

## Constraints
- Only works for tasks started within the current session
- Non-blocking queries return immediately with current status; you may need to poll
- Output may be truncated for very large results

## Safety/Limitations
- Does not kill tasks; use KillShell for that
- Cannot retrieve output from tasks started in other sessions

## Avoid Repetition
- Do not poll the same task_id in a tight loop; add delays between block=false checks
- If a task consistently fails, do not keep re-querying—inspect the error and fix the root cause
- When waiting for a task, prefer block=true to let the system handle blocking; only poll manually if you need intermediate updates
- Avoid using TaskOutput for tasks that are already completed unless you need to re-read the output

## Examples
- Wait for a background shell: task_id="bash_12345", block=true
- Non-blocking status check: task_id="agent_67890", block=false
- Poll with delay: call TaskOutput block=false, then after a few seconds call again if still running`
