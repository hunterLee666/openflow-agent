export const TOOL_NAME_FOR_PROMPT = 'Skill'

export const DESCRIPTION = `Executes predefined skills by name
- Input: skill string
- Fails if the skill is not available`

export const PROMPT = `Execute a predefined skill by its identifier.

## When to Use
- To invoke a specialized capability that has been configured in the project (e.g., "code-review", "security-audit", "refactor-module")
- When a slash command or user request maps to a known skill

## Approach
- Provide the skill name exactly as registered (e.g., "security-review", "test-generation")
- The skill will run with its built-in prompt and may use its own set of tools
- Skills are project-specific or globally defined; they encapsulate complex workflows

## Parameters
- skill (required): The identifier of the skill to execute

## Output
- The skill's result message(s)
- May include tool calls if the skill uses tools internally

## Constraints
- The skill must be available in the current environment; unknown skills return an error
- Skills may have their own requirements, inputs, or preconditions

## Safety/Limitations
- Skills run with the same permissions and sandbox as the caller
- Some skills may perform high-impact operations; ensure you trust the skill definition

## Avoid Repetition
- Do not call the same skill repeatedly with identical arguments expecting different results; skills should be idempotent or you should adjust inputs
- If a skill fails, analyze the error before retrying; do not blindly retry
- Avoid using skills for ad-hoc tasks that are not covered by their design; use your own tools instead

## Examples
- Run security review: skill="security-review"
- Generate tests: skill="test-generation"

## Notes
- Skills are defined in the project's configuration or global setup
- The set of available skills varies across repositories; use ListMcpResources or check project docs if unsure`