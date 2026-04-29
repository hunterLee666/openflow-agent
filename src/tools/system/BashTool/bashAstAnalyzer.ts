export interface BashASTNode {
  type: 'command' | 'pipeline' | 'list' | 'subshell' | 'redirect' | 'assignment'
  raw: string
  children?: BashASTNode[]
  command?: string
  args?: string[]
  operator?: string
  redirects?: Array<{ type: string; target: string }>
  env?: Record<string, string>
}

export interface CommandAnalysis {
  command: string
  baseCommand: string
  args: string[]
  flags: string[]
  hasSudo: boolean
  hasPipe: boolean
  hasRedirect: boolean
  hasSubshell: boolean
  hasBackground: boolean
  hasConditional: boolean
  envVars: Record<string, string>
  redirects: Array<{ type: string; target: string }>
  pipelines: string[]
  riskIndicators: string[]
}

const SHELL_METACHARACTERS = ['|', '&', ';', '<', '>', '(', ')', '$', '`', '\\', '"', "'", '!', '*', '?', '[', ']', '{', '}']

const DANGEROUS_BASE_COMMANDS = new Set([
  'rm', 'dd', 'mkfs', 'fdisk', 'parted', 'shred', 'wipefs',
  'chmod', 'chown', 'chgrp',
  'shutdown', 'reboot', 'poweroff', 'halt', 'init',
  'systemctl', 'service',
  'iptables', 'ip6tables', 'nft',
  'crontab', 'at',
  'useradd', 'userdel', 'usermod', 'passwd',
  'visudo', 'vipw', 'vigr',
  'kubectl', 'docker', 'podman', 'terraform', 'pulumi', 'ansible',
  'git', 'svn', 'hg',
  'curl', 'wget', 'nc', 'netcat', 'socat',
  'python', 'python3', 'perl', 'ruby', 'node', 'php',
  'bash', 'sh', 'zsh', 'fish', 'dash',
  'eval', 'exec', 'source',
])

const DANGEROUS_FLAGS = new Set([
  '-rf', '-fr', '-r', '-f', '-R',
  '--force', '--no-preserve-root',
  '-exec', '-delete',
  '--hard', '--force-with-lease',
  '-prune', '--prune=now',
  '--amend',
])

export function parseBashCommand(command: string): BashASTNode {
  const trimmed = command.trim()
  if (!trimmed) {
    return { type: 'command', raw: '' }
  }

  if (trimmed.includes('&&') || trimmed.includes('||') || trimmed.includes(';')) {
    return parseList(trimmed)
  }

  if (trimmed.includes('|')) {
    return parsePipeline(trimmed)
  }

  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return parseSubshell(trimmed)
  }

  return parseSimpleCommand(trimmed)
}

function parseList(command: string): BashASTNode {
  const parts: Array<{ operator: string; command: string }> = []
  let current = ''
  let depth = 0
  let inQuote = false
  let quoteChar = ''

  for (let i = 0; i < command.length; i++) {
    const char = command[i]!

    if (inQuote) {
      current += char
      if (char === quoteChar && command[i - 1] !== '\\') {
        inQuote = false
      }
      continue
    }

    if (char === '"' || char === "'") {
      inQuote = true
      quoteChar = char
      current += char
      continue
    }

    if (char === '(') depth++
    if (char === ')') depth--

    if (depth === 0) {
      if (command.slice(i, i + 2) === '&&') {
        parts.push({ operator: '&&', command: current.trim() })
        current = ''
        i++
        continue
      }
      if (command.slice(i, i + 2) === '||') {
        parts.push({ operator: '||', command: current.trim() })
        current = ''
        i++
        continue
      }
      if (char === ';') {
        parts.push({ operator: ';', command: current.trim() })
        current = ''
        continue
      }
    }

    current += char
  }

  if (current.trim()) {
    parts.push({ operator: '', command: current.trim() })
  }

  return {
    type: 'list',
    raw: command,
    children: parts.map(p => parseBashCommand(p.command)),
    operator: parts.map(p => p.operator).filter(Boolean).join(' '),
  }
}

function parsePipeline(command: string): BashASTNode {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let inQuote = false
  let quoteChar = ''

  for (let i = 0; i < command.length; i++) {
    const char = command[i]!

    if (inQuote) {
      current += char
      if (char === quoteChar && command[i - 1] !== '\\') {
        inQuote = false
      }
      continue
    }

    if (char === '"' || char === "'") {
      inQuote = true
      quoteChar = char
      current += char
      continue
    }

    if (char === '(') depth++
    if (char === ')') depth--

    if (depth === 0 && char === '|') {
      if (command[i + 1] === '|') {
        current += char
        continue
      }
      parts.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) {
    parts.push(current.trim())
  }

  return {
    type: 'pipeline',
    raw: command,
    children: parts.map(p => parseSimpleCommand(p)),
  }
}

function parseSubshell(command: string): BashASTNode {
  const inner = command.slice(1, -1).trim()
  return {
    type: 'subshell',
    raw: command,
    children: [parseBashCommand(inner)],
  }
}

function parseSimpleCommand(command: string): BashASTNode {
  const envVars: Record<string, string> = {}
  const redirects: Array<{ type: string; target: string }> = []
  let remaining = command

  const envPattern = /^([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|(\S+))\s*/
  let match
  while ((match = remaining.match(envPattern))) {
    envVars[match[1]!] = match[2] ?? match[3] ?? match[4] ?? ''
    remaining = remaining.slice(match[0].length)
  }

  const redirectPattern = /([<>]{1,2}|>>)\s*(\S+)/g
  remaining = remaining.replace(redirectPattern, (_, type, target) => {
    redirects.push({ type, target })
    return ''
  }).trim()

  const tokens = tokenize(remaining)
  const cmd = tokens[0] || ''
  const args = tokens.slice(1)

  return {
    type: 'command',
    raw: command,
    command: cmd,
    args,
    env: Object.keys(envVars).length > 0 ? envVars : undefined,
    redirects: redirects.length > 0 ? redirects : undefined,
  }
}

function tokenize(command: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inQuote = false
  let quoteChar = ''

  for (let i = 0; i < command.length; i++) {
    const char = command[i]!

    if (inQuote) {
      if (char === quoteChar && command[i - 1] !== '\\') {
        inQuote = false
        tokens.push(current)
        current = ''
        continue
      }
      current += char
      continue
    }

    if (char === '"' || char === "'") {
      inQuote = true
      quoteChar = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

export function analyzeCommand(command: string): CommandAnalysis {
  const ast = parseBashCommand(command)
  const analysis: CommandAnalysis = {
    command,
    baseCommand: '',
    args: [],
    flags: [],
    hasSudo: false,
    hasPipe: false,
    hasRedirect: false,
    hasSubshell: false,
    hasBackground: false,
    hasConditional: false,
    envVars: {},
    redirects: [],
    pipelines: [],
    riskIndicators: [],
  }

  analyzeAST(ast, analysis)

  return analysis
}

function analyzeAST(node: BashASTNode, analysis: CommandAnalysis): void {
  switch (node.type) {
    case 'list':
      analysis.hasConditional = node.operator?.includes('&&') || node.operator?.includes('||') || false
      node.children?.forEach(child => analyzeAST(child, analysis))
      break

    case 'pipeline':
      analysis.hasPipe = true
      node.children?.forEach((child, index) => {
        analyzeAST(child, analysis)
        if (child.command) {
          analysis.pipelines.push(child.command)
        }
      })
      break

    case 'subshell':
      analysis.hasSubshell = true
      node.children?.forEach(child => analyzeAST(child, analysis))
      break

    case 'command':
      if (node.command) {
        if (node.command === 'sudo') {
          analysis.hasSudo = true
          if (node.args && node.args.length > 0) {
            analysis.baseCommand = node.args[0] || ''
            analysis.args = node.args.slice(1)
          }
        } else {
          analysis.baseCommand = node.command
          analysis.args = node.args || []
        }
      }

      if (node.args) {
        analysis.flags = node.args.filter(arg => arg.startsWith('-'))
      }

      if (node.env) {
        analysis.envVars = { ...analysis.envVars, ...node.env }
      }

      if (node.redirects && node.redirects.length > 0) {
        analysis.hasRedirect = true
        analysis.redirects = [...analysis.redirects, ...node.redirects]
      }
      break
  }

  if (analysis.baseCommand && DANGEROUS_BASE_COMMANDS.has(analysis.baseCommand)) {
    analysis.riskIndicators.push(`Dangerous base command: ${analysis.baseCommand}`)
  }

  analysis.flags.forEach(flag => {
    if (DANGEROUS_FLAGS.has(flag)) {
      analysis.riskIndicators.push(`Dangerous flag: ${flag}`)
    }
  })

  if (analysis.hasSudo) {
    analysis.riskIndicators.push('Privilege escalation via sudo')
  }

  if (analysis.hasPipe && analysis.pipelines.some(p => ['bash', 'sh', 'zsh'].includes(p))) {
    analysis.riskIndicators.push('Pipe to shell interpreter')
  }

  analysis.redirects.forEach(redirect => {
    if (redirect.type === '>' || redirect.type === '>>') {
      if (redirect.target.startsWith('/dev/')) {
        analysis.riskIndicators.push(`Redirect to device: ${redirect.target}`)
      }
    }
  })
}

export function extractCommandsFromAST(node: BashASTNode): string[] {
  const commands: string[] = []

  function traverse(n: BashASTNode) {
    if (n.type === 'command' && n.command) {
      commands.push(n.command)
    }
    n.children?.forEach(traverse)
  }

  traverse(node)
  return commands
}

export function findSensitivePatterns(command: string): Array<{ pattern: string; match: string; risk: string }> {
  const findings: Array<{ pattern: string; match: string; risk: string }> = []

  const patterns = [
    { pattern: /\bpassword\s*=\s*\S+/gi, risk: 'Password in command' },
    { pattern: /\bapi[_-]?key\s*=\s*\S+/gi, risk: 'API key in command' },
    { pattern: /\bsecret\s*=\s*\S+/gi, risk: 'Secret in command' },
    { pattern: /\btoken\s*=\s*\S+/gi, risk: 'Token in command' },
    { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi, risk: 'Private key exposed' },
    { pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g, risk: 'AWS access key ID' },
    { pattern: /\b(?:sk-)[a-zA-Z0-9]{20,}\b/g, risk: 'API key pattern' },
    { pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/g, risk: 'GitHub token' },
  ]

  for (const { pattern, risk } of patterns) {
    const matches = command.match(pattern)
    if (matches) {
      matches.forEach(match => {
        findings.push({ pattern: pattern.source, match, risk })
      })
    }
  }

  return findings
}
