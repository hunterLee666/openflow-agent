export const TOOL_NAME_FOR_PROMPT = 'SlashCommand'

export const DESCRIPTION = `Executes predefined project commands stored in .claude/.openflow/commands/*.md
- Input: command string (e.g., "/test" or "/deploy staging")
- Only executes known commands; otherwise returns an error`

export const PROMPT = `Execute a predefined slash command from the project's configuration.

## When to Use
- To run common project tasks via short-hand commands (e.g., /test, /build, /deploy)
- When the user invokes a slash command or when you need to perform a routine operation defined by the project team

## Approach
- Provide the command string exactly as invoked (e.g., "/test" or "/deploy staging")
- The command will be looked up in the project's configured command definitions (typically in .claude/.openflow/commands/*.md)
- Only commands that exist will execute; unknown commands return an error

## Parameters
- command (required): The slash command to execute, including any arguments

## Output
- The result of the command execution, which may be output text, status, or an error if the command is not defined

## Constraints
- Commands are predefined; you cannot create new ones on the fly
- Command definitions reside in the project's configuration directory

## Safety/Limitations
- Commands run with the same permissions as the agent; they can invoke tools, run shells, etc.
- Unknown commands are rejected; check available commands via project documentation if needed

## Avoid Repetition
- Do not invoke the same slash command repeatedly without changes; if the command fails, diagnose the error before retrying
- If a command is undefined, do not retry the same command—tell the user or choose an alternative approach
- Avoid using slash commands for ad-hoc operations; they are meant for standardized workflows

## Examples
- Run tests: command="/test"
- Deploy to staging: command="/deploy staging"
- Lint the code: command="/lint"

## Notes
- Only use emojis if the user explicitly requests it
- Slash commands are project-specific; available commands may vary across repositories`