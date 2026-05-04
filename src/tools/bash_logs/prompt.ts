export const DESCRIPTION = 'Get output from a background bash shell'

export const PROMPT = `Fetch stdout and stderr from a background bash process started with bash_run.

## When to Use
- Monitor the output of a long-running background process (like a dev server, build, or test)
- Check if a background task has completed and view its results
- Retrieve incremental logs while the process is still running

## Approach
- Provide the shell_id obtained from a previous bash_run call with background=true
- Output includes both stdout and stderr streams combined, plus status information
- You can call this tool repeatedly to get up-to-date logs; it returns the current buffer

## Parameters
- shell_id (required): Identifier of the background shell to query

## Output
- stdout: text output captured from standard output
- stderr: text output captured from standard error
- status: "running" or "completed"
- exit_code: If completed, the process exit code (may be undefined if still running)
- truncated: boolean if output was cut due to size limits

## Constraints
- Only processes started in the current session are accessible
- Process history is not persisted across SDK restarts
- Background processes must be explicitly killed with bash_kill when no longer needed

## Safety/Limitations
- Output buffers may be limited; extremely verbose processes may have older lines dropped
- No interactive input possible; this is read-only

## Avoid Repetition
- Do not poll the same shell_id in a tight loop; add a reasonable delay (e.g., 1-2 seconds) between checks
- If a process consistently fails (non-zero exit), do not keep restarting and polling—investigate the error first
- If you have already fetched the logs and the process is still running, wait for some time before fetching again unless you need immediate updates
- Avoid starting many background shells without tracking their IDs; keep a clean list and kill completed ones

## Examples
- After starting: const { shell_id } = await bash_run({ command: "npm run dev", background: true })
- Poll logs: await bash_logs({ shell_id }), check status
- When done: kill with bash_kill({ shell_id })

## Notes
- This tool complements bash_kill; use kill to terminate and logs to monitor
- Use TaskOutput for generic task polling across agents, but bash_logs is specific to bash shells`