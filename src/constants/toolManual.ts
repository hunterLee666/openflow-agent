export interface ToolManualSection {
  approach: string
  output: string
  constraints: string[]
}

export interface ToolManualOptions {
  name: string
  description: string
  approach: string
  output: string
  constraints?: string[]
  examples?: Array<{
    scenario: string
    usage: string
  }>
  tips?: string[]
}

export function buildToolManual(options: ToolManualOptions): string {
  const sections: string[] = []

  sections.push(`# ${options.name}`)
  sections.push('')
  sections.push(options.description)
  sections.push('')

  sections.push('## Approach')
  sections.push(options.approach)
  sections.push('')

  sections.push('## Output')
  sections.push(options.output)
  sections.push('')

  sections.push('## Constraints')
  if (options.constraints && options.constraints.length > 0) {
    for (const constraint of options.constraints) {
      sections.push(`- ${constraint}`)
    }
  } else {
    sections.push('- None specified')
  }
  sections.push('')

  if (options.examples && options.examples.length > 0) {
    sections.push('## Examples')
    for (const example of options.examples) {
      sections.push(`### ${example.scenario}`)
      sections.push('```')
      sections.push(example.usage)
      sections.push('```')
      sections.push('')
    }
  }

  if (options.tips && options.tips.length > 0) {
    sections.push('## Tips')
    for (const tip of options.tips) {
      sections.push(`- ${tip}`)
    }
    sections.push('')
  }

  return sections.join('\n')
}

export function buildToolManualFromSection(
  name: string,
  description: string,
  section: ToolManualSection
): string {
  return buildToolManual({
    name,
    description,
    approach: section.approach,
    output: section.output,
    constraints: section.constraints,
  })
}

export const COMMON_CONSTRAINTS = {
  readOnly: 'This tool is read-only and will not modify any files',
  requiresApproval: 'This tool requires user approval before execution',
  concurrencySafe: 'This tool is safe to run concurrently with other operations',
  noNetworkAccess: 'This tool does not have network access',
  noFileSystemWrite: 'This tool cannot write to the filesystem',
  noShellExecution: 'This tool cannot execute shell commands',
  mustBeAbsolute: 'File paths must be absolute paths',
  mustExist: 'The target file or directory must exist',
  maxFileSize: (bytes: number) => `Maximum file size is ${(bytes / 1024).toFixed(0)}KB`,
  maxResults: (count: number) => `Maximum of ${count} results returned`,
}

export const APPROACH_TEMPLATES = {
  fileRead: `Use this tool to read file contents from the local filesystem.

1. Provide the absolute path to the file you want to read
2. Optionally specify line range with offset and limit parameters
3. The tool returns the file content with line numbers

Best practices:
- Read multiple files in parallel when possible
- Use offset/limit for large files to avoid memory issues
- Check file existence before reading if uncertain`,

  fileSearch: `Use this tool to search for files matching a pattern.

1. Provide a glob pattern to match files (e.g., "**/*.ts")
2. Optionally specify a directory to search within
3. Results are sorted by modification time

Best practices:
- Use specific patterns to reduce result count
- Combine with Grep for content-based searches
- Use relative patterns from the project root`,

  contentSearch: `Use this tool to search for content within files.

1. Provide a regex pattern to search for
2. Optionally filter by file type or glob pattern
3. Results show matching lines with context

Best practices:
- Use specific patterns to reduce noise
- Combine with Glob for targeted searches
- Use output_mode to control result format`,

  fileEdit: `Use this tool to make targeted edits to existing files.

1. Provide the absolute path to the file
2. Specify the old_str to find (must be exact match)
3. Specify the new_str to replace it with

Best practices:
- Always read the file first to understand context
- Include enough context in old_str for unique match
- Make minimal, focused changes`,

  fileWrite: `Use this tool to create new files or overwrite existing ones.

1. Provide the absolute path for the new file
2. Provide the complete content to write
3. For existing files, must read first

Best practices:
- Use Edit for modifications to existing files
- Ensure directory exists before writing
- Follow project conventions for file structure`,

  shellCommand: `Use this tool to execute shell commands.

1. Provide the command to execute
2. Optionally specify working directory
3. Control blocking behavior based on command type

Best practices:
- Prefer specific tools over shell commands when available
- Use read-only commands when possible
- Be explicit about approval requirements`,
}

export const OUTPUT_TEMPLATES = {
  fileContent: `Returns file content with line numbers in cat -n format.

Example:
\`\`\`
     1  import { foo } from 'bar'
     2  
     3  export function baz() {
     4    return foo()
     5  }
\`\`\``,

  filePaths: `Returns a list of file paths matching the pattern, sorted by modification time.

Example:
\`\`\`
src/utils/helpers.ts
src/components/Button.tsx
src/hooks/useAuth.ts
\`\`\``,

  searchResults: `Returns matching lines with file paths and line numbers.

Example:
\`\`\`
src/utils/helpers.ts:42:export function formatDate(date: Date)
src/components/Button.tsx:15:const formattedDate = formatDate(new Date())
\`\`\``,

  commandResult: `Returns command output including:
- Standard output (stdout)
- Standard error (stderr) if any
- Exit code
- Execution time

For long-running commands, output is streamed progressively.`,

  editResult: `Returns confirmation of the edit:
- File path
- Lines modified
- Success status

Throws error if old_str not found or multiple matches exist.`,

  writeResult: `Returns confirmation of the write:
- File path
- Bytes written
- Success status

For existing files, requires prior read operation.`,
}
