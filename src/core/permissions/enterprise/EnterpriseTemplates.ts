import { PermissionRule, RuleLayer, RuleSource } from '../rules/types'

export interface EnterpriseTemplate {
  name: string
  description: string
  version: string
  rules: RuleLayer[]
  metadata?: Record<string, unknown>
}

export const STRICT_SECURITY_TEMPLATE: EnterpriseTemplate = {
  name: 'strict-security',
  description: 'Strict security template with maximum protection',
  version: '1.0.0',
  rules: [
    {
      source: 'organization',
      priority: 100,
      rules: [
        {
          id: 'org-deny-curl-wget',
          behavior: 'deny',
          source: 'organization',
          target: 'command',
          pattern: 'curl',
          priority: 100,
          description: 'Block curl commands',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-deny-wget',
          behavior: 'deny',
          source: 'organization',
          target: 'command',
          pattern: 'wget',
          priority: 100,
          description: 'Block wget commands',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-deny-rm-rf',
          behavior: 'deny',
          source: 'organization',
          target: 'command',
          pattern: 'rm -rf',
          priority: 100,
          description: 'Block rm -rf commands',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-deny-parent-dir-write',
          behavior: 'deny',
          source: 'organization',
          target: 'path',
          pattern: '../',
          priority: 100,
          description: 'Block writes to parent directories',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-deny-dot-git',
          behavior: 'deny',
          source: 'organization',
          target: 'path',
          pattern: '.git',
          priority: 100,
          description: 'Block access to .git directory',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  ],
}

export const BALANCED_TEMPLATE: EnterpriseTemplate = {
  name: 'balanced',
  description: 'Balanced template with moderate security and usability',
  version: '1.0.0',
  rules: [
    {
      source: 'organization',
      priority: 80,
      rules: [
        {
          id: 'org-ask-curl',
          behavior: 'ask',
          source: 'organization',
          target: 'command',
          pattern: 'curl',
          priority: 80,
          description: 'Ask for curl commands',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-ask-wget',
          behavior: 'ask',
          source: 'organization',
          target: 'command',
          pattern: 'wget',
          priority: 80,
          description: 'Ask for wget commands',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-allow-git-status',
          behavior: 'allow',
          source: 'organization',
          target: 'command',
          pattern: 'git status',
          priority: 80,
          description: 'Allow git status',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-allow-npm-test',
          behavior: 'allow',
          source: 'organization',
          target: 'command',
          pattern: 'npm test',
          priority: 80,
          description: 'Allow npm test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  ],
}

export const DEVELOPER_FRIENDLY_TEMPLATE: EnterpriseTemplate = {
  name: 'developer-friendly',
  description: 'Developer-friendly template with minimal restrictions',
  version: '1.0.0',
  rules: [
    {
      source: 'organization',
      priority: 60,
      rules: [
        {
          id: 'org-deny-rm-rf-root',
          behavior: 'deny',
          source: 'organization',
          target: 'command',
          pattern: 'rm -rf /',
          priority: 60,
          description: 'Block rm -rf /',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-allow-read',
          behavior: 'allow',
          source: 'organization',
          target: 'tool',
          pattern: 'Read',
          priority: 60,
          description: 'Allow Read tool',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-allow-grep',
          behavior: 'allow',
          source: 'organization',
          target: 'tool',
          pattern: 'Grep',
          priority: 60,
          description: 'Allow Grep tool',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-allow-glob',
          behavior: 'allow',
          source: 'organization',
          target: 'tool',
          pattern: 'Glob',
          priority: 60,
          description: 'Allow Glob tool',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  ],
}

export const CI_CD_TEMPLATE: EnterpriseTemplate = {
  name: 'ci-cd',
  description: 'CI/CD template with pre-approved commands for automation',
  version: '1.0.0',
  rules: [
    {
      source: 'organization',
      priority: 100,
      rules: [
        {
          id: 'org-allow-npm-ci',
          behavior: 'allow',
          source: 'organization',
          target: 'command',
          pattern: 'npm ci',
          priority: 100,
          description: 'Allow npm ci for CI',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-allow-npm-run-build',
          behavior: 'allow',
          source: 'organization',
          target: 'command',
          pattern: 'npm run build',
          priority: 100,
          description: 'Allow npm run build',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-allow-npm-run-test',
          behavior: 'allow',
          source: 'organization',
          target: 'command',
          pattern: 'npm run test',
          priority: 100,
          description: 'Allow npm run test',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-allow-git-diff',
          behavior: 'allow',
          source: 'organization',
          target: 'command',
          pattern: 'git diff',
          priority: 100,
          description: 'Allow git diff',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'org-deny-all-others',
          behavior: 'deny',
          source: 'organization',
          target: 'tool',
          pattern: '*',
          priority: 0,
          description: 'Deny all other tools by default',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  ],
}

export class EnterpriseTemplateManager {
  private templates: Map<string, EnterpriseTemplate> = new Map()

  constructor() {
    this.initializeDefaultTemplates()
  }

  private initializeDefaultTemplates(): void {
    this.templates.set('strict-security', STRICT_SECURITY_TEMPLATE)
    this.templates.set('balanced', BALANCED_TEMPLATE)
    this.templates.set('developer-friendly', DEVELOPER_FRIENDLY_TEMPLATE)
    this.templates.set('ci-cd', CI_CD_TEMPLATE)
  }

  getTemplate(name: string): EnterpriseTemplate | undefined {
    return this.templates.get(name)
  }

  getAllTemplates(): EnterpriseTemplate[] {
    return Array.from(this.templates.values())
  }

  addTemplate(template: EnterpriseTemplate): void {
    this.templates.set(template.name, template)
  }

  removeTemplate(name: string): boolean {
    return this.templates.delete(name)
  }

  applyTemplate(
    templateName: string,
    ruleManager: any,
  ): boolean {
    const template = this.templates.get(templateName)
    if (!template) return false

    for (const layer of template.rules) {
      ruleManager.addLayer(layer)
    }

    return true
  }

  exportTemplate(name: string): string {
    const template = this.templates.get(name)
    if (!template) {
      throw new Error(`Template '${name}' not found`)
    }

    return JSON.stringify(template, null, 2)
  }

  importTemplate(json: string): EnterpriseTemplate {
    const template = JSON.parse(json) as EnterpriseTemplate
    this.templates.set(template.name, template)
    return template
  }

  validateTemplate(template: EnterpriseTemplate): {
    valid: boolean
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []

    if (!template.name || template.name.trim() === '') {
      errors.push('Template name is required')
    }

    if (!template.version || template.version.trim() === '') {
      warnings.push('Template version is recommended')
    }

    if (!template.rules || template.rules.length === 0) {
      warnings.push('Template has no rules defined')
    }

    for (const layer of template.rules) {
      if (!layer.source) {
        errors.push(`Layer missing source`)
      }

      if (!layer.rules || layer.rules.length === 0) {
        warnings.push(`Layer from '${layer.source}' has no rules`)
      }

      for (const rule of layer.rules) {
        if (!rule.pattern || rule.pattern.trim() === '') {
          errors.push(`Rule '${rule.id}' has empty pattern`)
        }

        if (!['deny', 'ask', 'allow'].includes(rule.behavior)) {
          errors.push(`Rule '${rule.id}' has invalid behavior: ${rule.behavior}`)
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }
}
