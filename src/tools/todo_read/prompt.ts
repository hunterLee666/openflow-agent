export const DESCRIPTION = 'Read the current todo list managed by the agent'

export const PROMPT = `Retrieve the current session's todo list to track progress and pending tasks.

## When to Use
- Before planning or reprioritizing work to see what's already in progress
- To check what remains to be done
- To present progress to the user

## Approach
- Call this tool to get the canonical list of todos tracked by the agent
- The list includes each todo's id, title, status, and optional assignee/notes
- Todos have three states: pending, in_progress, completed

## Output
- Array of todo objects with fields:
  - id: unique identifier
  - title: description of the task
  - status: "pending" | "in_progress" | "completed"
  - assignee (optional)
  - notes (optional)

## Constraints
- Returns empty list if todo service is not enabled for this agent
- The list is session-specific; not shared across conversations

## Safety/Limitations
- Read-only; does not modify todos
- Reflects the agent's self-maintained list; may not include tasks you haven't explicitly added

## Avoid Repetition
- Do not poll the todo list repeatedly without a reason; cache in memory after first read
- If no todos exist, avoid repeatedly calling; instead, create a new todo list with TodoWriteTool
- When using todos proactively, update them as you work rather than re-reading to confirm—write updates immediately after completing a step

## Examples
- Check status: calls todo_read
- After reading, you might say: "I see you have 3 pending tasks. Let's start with the first one."

## Notes
- Use TodoWriteTool to create, update, or replace the todo list
- Maintain exactly one in_progress task at a time for clarity`