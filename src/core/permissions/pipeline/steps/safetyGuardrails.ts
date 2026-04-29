import { PipelineContext, PipelineResult } from '../types'
import { createDenyResult, createAskResult, createContinueResult } from '../PipelineEngine'
import * as path from 'path'

const PROTECTED_PATHS = [
  '.git',
  '.claude',
  '.ssh',
  '.gnupg',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
]

const PROTECTED_FILES = [
  '.bashrc',
  '.zshrc',
  '.bash_profile',
  '.zprofile',
  '.profile',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  'id_dsa',
  '.pem',
  '.key',
  '.crt',
]

const PROTECTED_EXTENSIONS = [
  '.pem',
  '.key',
  '.crt',
  '.p12',
  '.pfx',
  '.jks',
  '.keystore',
]

export async function executeSafetyGuardrails(
  context: PipelineContext,
): Promise<PipelineResult> {
  const { tool, input, workingDirectory } = context

  if (['Write', 'Edit', 'MultiEdit'].includes(tool.name)) {
    const filePath = String(input.file_path || '')
    const result = checkProtectedPath(filePath, workingDirectory)
    if (result) {
      return result
    }
  }

  if (tool.name === 'Bash') {
    const command = String(input.command || '')
    const result = checkBashCommand(command, workingDirectory)
    if (result) {
      return result
    }
  }

  return createContinueResult(7, 'No safety guardrails triggered')
}

function checkProtectedPath(
  filePath: string,
  workingDirectory: string,
): PipelineResult | null {
  const normalized = path.normalize(filePath)
  const absolute = path.isAbsolute(normalized)
    ? normalized
    : path.resolve(workingDirectory, normalized)

  for (const protectedPath of PROTECTED_PATHS) {
    if (absolute.includes(`/${protectedPath}/`) || absolute.endsWith(`/${protectedPath}`)) {
      return createDenyResult(
        7,
        `Access to protected path '${protectedPath}' is not allowed`,
        {
          protectedPath,
          filePath: absolute,
        },
      )
    }
  }

  const basename = path.basename(absolute)
  const ext = path.extname(absolute).toLowerCase()

  for (const protectedFile of PROTECTED_FILES) {
    if (basename === protectedFile || ext === protectedFile) {
      return createAskResult(
        7,
        `Access to sensitive file '${basename}' requires confirmation`,
        {
          protectedFile: basename,
          filePath: absolute,
        },
      )
    }
  }

  for (const protectedExt of PROTECTED_EXTENSIONS) {
    if (ext === protectedExt) {
      return createAskResult(
        7,
        `Access to file with sensitive extension '${ext}' requires confirmation`,
        {
          protectedExtension: ext,
          filePath: absolute,
        },
      )
    }
  }

  if (absolute.includes('../') || filePath.includes('../')) {
    return createDenyResult(7, 'Path traversal outside working directory is not allowed', {
      filePath: absolute,
      workingDirectory,
    })
  }

  return null
}

function checkBashCommand(
  command: string,
  workingDirectory: string,
): PipelineResult | null {
  const protectedPatterns = [
    {
      pattern: /rm\s+-rf\s+\.git/i,
      reason: 'Removing .git directory is not allowed',
    },
    {
      pattern: /git\s+push\s+.*--force/i,
      reason: 'Force pushing to git repository requires confirmation',
      ask: true,
    },
    {
      pattern: /git\s+reset\s+--hard/i,
      reason: 'Hard git reset requires confirmation',
      ask: true,
    },
    {
      pattern: /chmod\s+[0-7]{3,4}\s+.*\.sh/i,
      reason: 'Making shell scripts executable requires confirmation',
      ask: true,
    },
    {
      pattern: />\s*~\/\.bashrc/i,
      reason: 'Overwriting .bashrc is not allowed',
    },
    {
      pattern: />\s*~\/\.zshrc/i,
      reason: 'Overwriting .zshrc is not allowed',
    },
    {
      pattern: /eval\s+\$/i,
      reason: 'Eval with variable expansion is potentially dangerous',
      ask: true,
    },
    {
      pattern: /source\s+~\/\./i,
      reason: 'Sourcing shell config files requires confirmation',
      ask: true,
    },
  ]

  for (const { pattern, reason, ask } of protectedPatterns) {
    if (pattern.test(command)) {
      if (ask) {
        return createAskResult(7, reason, {
          pattern: pattern.source,
          command: command.substring(0, 100),
        })
      } else {
        return createDenyResult(7, reason, {
          pattern: pattern.source,
          command: command.substring(0, 100),
        })
      }
    }
  }

  return null
}
