export const TOOL_NAME_FOR_PROMPT = 'AskUserQuestion'
export const DESCRIPTION =
  'Asks the user multiple choice questions to gather information, clarify ambiguity, understand preferences, make decisions or offer them choices.'

export const PROMPT = `Pose multiple-choice or custom-input questions to the user to gather information, make decisions, or clarify requirements.

## When to Use
- When you need user input to proceed (e.g., choosing between implementation options)
- To clarify ambiguous instructions or requirements
- To confirm preferences (e.g., color scheme, file naming, approach)
- When presenting choices and letting the user decide

## Approach
- Define a clear, concise question
- Provide an array of options, each with a label and a description
- If you recommend a specific option, include it first with "(Recommended)" appended to the label
- Set multiSelect: true if the user can select multiple answers
- The user will always see an "Other" option to provide custom text input

## Parameters
- question (required): The question text to display
- options (required): Array of { label, description } objects
- multiSelect (optional): Boolean; if true, allows multiple selections
- header (optional): Short label for the question (max 30 chars)

## Output
- User's selection(s): label(s) for single-select, or array of labels for multi-select
- If "Other" is chosen, the custom text input is returned

## Constraints
- Must provide at least two options
- Option labels should be short (1-5 words) and descriptive
- The UI will present the question and options in a user-friendly format

## Safety/Limitations
- The tool blocks further execution until the user responds
- Avoid asking questions that are unnecessary or overly frequent; minimize disruption

## Avoid Repetition
- Do not ask the same question repeatedly; if the user's answer is unclear, ask a clarifying follow-up instead
- Avoid rapid-fire multiple questions; batch them when possible or ask one at a time with context
- If the user already provided the information earlier in the conversation, do not ask again—use what you already know
- When presenting options, ensure they are mutually exclusive (unless multiSelect) and cover the likely choices; if none fit, the user can select "Other"

## Examples
- Ask about preferences: question="Which testing library do you prefer?", options=[{label: "Vitest"}, {label: "Jest"}, {label: "Mocha"}]
- Multi-select for features: question="Which features should we implement?", options=[...], multiSelect=true
- Recommend an option: first option label includes "(Recommended)"

## Notes
- Only use emojis if the user explicitly requests it
- The question should be clear and self-contained; avoid ambiguous wording
- This tool is the primary way to get user decisions; use it instead of guessing`