import { z } from 'zod'

export const AdversarialProbeResultSchema = z.object({
  probeName: z.string(),
  target: z.string(),
  executed: z.boolean(),
  passed: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
})

export type AdversarialProbeResult = z.infer<typeof AdversarialProbeResultSchema>

export interface AdversarialProbe {
  name: string
  category: 'api' | 'function' | 'file' | 'security'
  description: string
  execute: (target: string, context?: Record<string, unknown>) => Promise<AdversarialProbeResult>
}

export const API_PROBES: AdversarialProbe[] = [
  {
    name: 'empty_body',
    category: 'api',
    description: 'Send request with empty body to API endpoint',
    async execute(target: string): Promise<AdversarialProbeResult> {
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: `curl -X POST "${target}" -H "Content-Type: application/json" -d '{}'`,
      }
    },
  },
  {
    name: 'missing_headers',
    category: 'api',
    description: 'Send request without required headers',
    async execute(target: string): Promise<AdversarialProbeResult> {
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: `curl -X POST "${target}" -d '{}' # Missing Content-Type header`,
      }
    },
  },
  {
    name: 'invalid_json',
    category: 'api',
    description: 'Send malformed JSON body',
    async execute(target: string): Promise<AdversarialProbeResult> {
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: `curl -X POST "${target}" -H "Content-Type: application/json" -d '{invalid json}'`,
      }
    },
  },
  {
    name: 'oversized_payload',
    category: 'api',
    description: 'Send payload larger than 1MB',
    async execute(target: string): Promise<AdversarialProbeResult> {
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: `curl -X POST "${target}" -H "Content-Type: application/json" -d '{"data": "<1MB of data>"}'`,
      }
    },
  },
  {
    name: 'sql_injection',
    category: 'security',
    description: 'Attempt SQL injection in parameters',
    async execute(target: string): Promise<AdversarialProbeResult> {
      const payloads = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        '1; SELECT * FROM users',
        "' UNION SELECT NULL --",
      ]
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: payloads.map(p => `curl "${target}?id=${encodeURIComponent(p)}"`).join('\n'),
      }
    },
  },
  {
    name: 'xss_payload',
    category: 'security',
    description: 'Attempt XSS in input fields',
    async execute(target: string): Promise<AdversarialProbeResult> {
      const payloads = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        'javascript:alert(1)',
        '<svg onload=alert(1)>',
      ]
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: payloads.map(p => `curl "${target}?input=${encodeURIComponent(p)}"`).join('\n'),
      }
    },
  },
]

export const FUNCTION_PROBES: AdversarialProbe[] = [
  {
    name: 'null_input',
    category: 'function',
    description: 'Pass null/undefined as input',
    async execute(target: string): Promise<AdversarialProbeResult> {
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: `${target}(null)\n${target}(undefined)`,
      }
    },
  },
  {
    name: 'empty_collection',
    category: 'function',
    description: 'Pass empty array/object',
    async execute(target: string): Promise<AdversarialProbeResult> {
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: `${target}([])\n${target}({})`,
      }
    },
  },
  {
    name: 'negative_number',
    category: 'function',
    description: 'Pass negative where positive expected',
    async execute(target: string): Promise<AdversarialProbeResult> {
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: `${target}(-1)\n${target}(-999)`,
      }
    },
  },
  {
    name: 'boundary_values',
    category: 'function',
    description: 'Test with 0, MAX_INT, -1',
    async execute(target: string): Promise<AdversarialProbeResult> {
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: `${target}(0)\n${target}(Number.MAX_SAFE_INTEGER)\n${target}(-1)`,
      }
    },
  },
  {
    name: 'special_string',
    category: 'function',
    description: 'Pass string with special characters',
    async execute(target: string): Promise<AdversarialProbeResult> {
      const payloads = [
        'test\\nwith\\nnewlines',
        'test\\twith\\ttabs',
        'test"with"quotes',
        "test'with'quotes",
        'test\\u0000with\\u0000null',
      ]
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: payloads.map(p => `${target}("${p}")`).join('\n'),
      }
    },
  },
]

export const FILE_PROBES: AdversarialProbe[] = [
  {
    name: 'nonexistent_path',
    category: 'file',
    description: 'Access non-existent file path',
    async execute(target: string): Promise<AdversarialProbeResult> {
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: `cat "${target}/nonexistent_file_12345.txt"`,
      }
    },
  },
  {
    name: 'path_traversal',
    category: 'security',
    description: 'Attempt path traversal with ../',
    async execute(target: string): Promise<AdversarialProbeResult> {
      const payloads = [
        '../../../etc/passwd',
        '..\\\\..\\\\..\\\\etc\\\\passwd',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd',
      ]
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: payloads.map(p => `cat "${target}/${p}"`).join('\n'),
      }
    },
  },
  {
    name: 'symlink_attack',
    category: 'security',
    description: 'Follow malicious symlink',
    async execute(target: string): Promise<AdversarialProbeResult> {
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: `# Check if symlinks are followed safely\nls -la "${target}"`,
      }
    },
  },
  {
    name: 'permission_denied',
    category: 'file',
    description: 'Access path without permissions',
    async execute(target: string): Promise<AdversarialProbeResult> {
      return {
        probeName: this.name,
        target,
        executed: true,
        passed: false,
        output: `# Try to access root-owned files\ncat "/root/${target}"`,
      }
    },
  },
]

export const ALL_PROBES: AdversarialProbe[] = [
  ...API_PROBES,
  ...FUNCTION_PROBES,
  ...FILE_PROBES,
]

export function getProbesByCategory(category: AdversarialProbe['category']): AdversarialProbe[] {
  return ALL_PROBES.filter(probe => probe.category === category)
}

export function getProbesForType(type: 'api' | 'function' | 'file'): AdversarialProbe[] {
  switch (type) {
    case 'api':
      return [...API_PROBES, ...getProbesByCategory('security')]
    case 'function':
      return FUNCTION_PROBES
    case 'file':
      return [...FILE_PROBES, ...getProbesByCategory('security')]
    default:
      return ALL_PROBES
  }
}

export function generateProbeReport(results: AdversarialProbeResult[]): string {
  const lines: string[] = ['### Adversarial Probe Results', '']

  const passed = results.filter(r => r.passed)
  const failed = results.filter(r => !r.passed && r.executed)
  const skipped = results.filter(r => !r.executed)

  lines.push(`**Summary**: ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`)
  lines.push('')

  if (failed.length > 0) {
    lines.push('#### Failed Probes')
    for (const result of failed) {
      lines.push(`- **${result.probeName}**: ${result.target}`)
      if (result.output) {
        lines.push(`  \`\`\`${result.output}\`\`\``)
      }
    }
    lines.push('')
  }

  if (passed.length > 0) {
    lines.push('#### Passed Probes')
    for (const result of passed) {
      lines.push(`- ${result.probeName}: ${result.target}`)
    }
  }

  return lines.join('\n')
}

export function generateProbeCommands(type: 'api' | 'function' | 'file', target: string): string {
  const probes = getProbesForType(type)
  const lines: string[] = ['### Adversarial Probe Commands', '']

  for (const probe of probes) {
    lines.push(`#### ${probe.name}`)
    lines.push(`${probe.description}`)
    lines.push(`Target: ${target}`)
    lines.push('')
  }

  return lines.join('\n')
}
