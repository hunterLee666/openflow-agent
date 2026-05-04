export const TOOL_NAME_FOR_PROMPT = 'KillShell'
export const DESCRIPTION = 'Kill a background bash shell by ID'

export const PROMPT = `Terminate a running background bash shell process.

## When to Use
- When a background process (started with bash_run background=true) is no longer needed
- To clean up resources and avoid leaving orphaned processes
- When a background process has hung or become unresponsive

## Parameters
- shell_id (required): The ID of the background shell to kill (obtained from bash_logs or /tasks)

## Output
- Success status (true/false)
- Message indicating the result
- The shell_id of the terminated process

## Constraints
- Only background shells started within this session can be killed
- If the shell is already finished, this tool may return an error or success
- Shell IDs are session-specific and cannot target processes from other sessions

## Safety/Limitations
- No force-kill escalation; relies on process termination via the sandbox
- Cannot kill processes not started by the current user/session

## Avoid Repetition
- Do not repeatedly try to kill the same shell_id if it fails; investigate the error
- If a shell exits on its own, no need to call KillShell—check status with bash_logs first
- Avoid spawning many background shells without cleaning; track and kill promptly

## Examples
- Kill a specific background task: shell_id="bash_123456789"
- After checking status with bash_logs and finding a hung process: kill it to free resources`
