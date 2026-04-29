export interface StandardToolPrompt {
  name: string
  description: string
  approach: string[]
  output: string[]
  constraints: string[]
}

export function buildToolPrompt(prompt: StandardToolPrompt): string {
  const sections: string[] = []

  sections.push(prompt.description)
  sections.push('')

  sections.push('Approach:')
  prompt.approach.forEach(item => {
    sections.push(`- ${item}`)
  })
  sections.push('')

  sections.push('Output:')
  prompt.output.forEach(item => {
    sections.push(`- ${item}`)
  })
  sections.push('')

  sections.push('Constraints:')
  prompt.constraints.forEach(item => {
    sections.push(`- ${item}`)
  })

  return sections.join('\n')
}

export const TOOL_PROMPT_TEMPLATE = `Each tool prompt should follow this structure:

1. Description (1-2 sentences)
   - Brief explanation of what the tool does

2. Approach (bullet points)
   - How to use the tool
   - When to use the tool
   - Best practices

3. Output (bullet points)
   - What the tool returns
   - Format of the output
   - How to interpret results

4. Constraints (bullet points)
   - Limitations
   - Safety considerations
   - Edge cases to avoid

Example:

\`\`\`
Read a file from the local filesystem.

Approach:
- Use this tool to read any file on the machine
- The file_path parameter must be an absolute path
- You can optionally specify offset and limit for large files
- Multiple files can be read in parallel

Output:
- File contents with line numbers (cat -n format)
- For images, returns visual representation
- For notebooks, returns all cells with outputs

Constraints:
- Cannot read directories (use Bash ls instead)
- Lines longer than 2000 characters are truncated
- Maximum 2000 lines per read by default
\`\`\`
`
