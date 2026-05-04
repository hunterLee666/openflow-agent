export const DESCRIPTION = 'Kill a background bash shell'

export const PROMPT = `Terminate a background bash process started with bash_run background=true.

## When to Use
- Clean up a long-running background process that is no longer needed
- Stop a hung or runaway process
- Free system resources when a background task has finished or is abandoned

## Approach
- Provide the shell_id returned by the original bash_run call
- After killing, the process will be terminated and cannot be restarted
- For safety, you may want to first check status with bash_logs to confirm it's running

## Parameters
- shell_id (required): The identifier of the background shell to kill

## Output
- Success status (boolean)
- Message indicating the result
- The shell_id of the terminated process

## Constraints
- Only processes started in the current session can be killed
- If the process already exited, the tool may still return success or an error depending on implementation

## Safety/Limitations
- Force termination may leave incomplete work, temporary files, or locks
- Cannot kill processes not started by the current user/session

## Avoid Repetition
- Do not repeatedly attempt to kill the same shell_id if it fails; check the error and context—perhaps it's already dead or you have the wrong ID
- After successfully killing a shell, do not call kill again on the same ID; it will likely error
- Avoid spawning many background processes without tracking them; maintain a list of active IDs and clean up promptly
- If a process exits on its own, there's no need to call bash_kill

## Examples
- After determining a background task is hung: const result = await bash_logs(shell_id); if result.status==='running' and hung, await bash_kill(shell_id)

## Notes
- Use bash_logs to monitor before deciding to kill
- Background processes consume resources; always clean up when done`