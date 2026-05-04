export const DESCRIPTION = 'Execute a bash command in the sandbox'

export const PROMPT = `Execute shell commands inside the sandbox environment.

## When to Use
- Run shell commands for tasks like: listing files, checking processes, building, testing, or package management
- Prefer using specialized tools (fs_read, fs_write, fs_grep, etc.) for file operations when possible—they are safer and provide better UX
- Use background mode (background=true) for long-running processes that you need to poll

## Approach
- Choose commands that are idempotent when possible; avoid destructive operations like rm -rf unless absolutely necessary
- Capture only the needed output; large outputs are truncated and saved to temp files
- Respect project policies and request approval when running high-impact commands if required
- For interactive commands, you may need to handle prompts or use non-interactive flags

## Parameters
- command (required): The shell command to execute
- timeout (optional): Maximum execution time in milliseconds (default: 120000)
- background (optional): If true, runs the command asynchronously and returns immediately (default: false)
- workdir (optional): Working directory for the command; defaults to sandbox root

## Output
- stdout and stderr streams captured as text
- exit code indicating success (0) or failure (non-zero)
- For background processes: shell_id to use with bash_logs or bash_kill
- Large outputs may be truncated; actual content saved to a temp file with path returned

## Constraints
- Commands are sandboxed and cannot escape the workspace directory
- Only commands allowed by the sandbox policy can be executed; certain operations may be blocked
- Background processes must be explicitly killed with bash_kill when no longer needed

## Safety/Limitations
- Environment is restricted; not all system utilities may be available
- Network access may be limited depending on policy
- File writes are confined to the project directory
- No privileged operations allowed

## Avoid Repetition
- If the same command fails repeatedly, analyze the error and adjust your approach instead of retrying
- If a command hangs or times out, try a simpler alternative or break it into smaller steps
- When listing directory contents, use ls or find efficiently—avoid running the same ls command multiple times in succession
- If you need to search for something, use fs_grep appropriately rather than manually scanning file-by-file
- Do not loop on the same failing command without adaptation

## Examples
- Execute a simple ls: command="ls -la"
- Run grep across src: command="grep -r 'TODO' src/"
- Long-running background process (like a dev server): command="npm run dev", background=true
- With custom timeout: command="npm test", timeout=300000`
