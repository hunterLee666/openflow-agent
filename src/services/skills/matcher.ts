export interface SkillFrontmatter {
  name: string
  description: string
  allowedTools?: string[]
  version?: string
  whenToUse?: string
  keywords?: string[]
  priority?: number
  model?: string
  disableModelInvocation?: boolean
}

export interface LoadedSkill {
  id: string
  frontmatter: SkillFrontmatter
  bodyMarkdown: string
  filePath?: string
  source?: 'project' | 'user' | 'plugin'
}

export interface SkillMatch {
  skill: LoadedSkill
  score: number
  matchedKeywords: string[]
  matchedDescription: boolean
}

export interface SkillMatcherOptions {
  minScore?: number
  maxResults?: number
  keywordWeight?: number
  descriptionWeight?: number
  semanticWeight?: number
}

const DEFAULT_OPTIONS: Required<SkillMatcherOptions> = {
  minScore: 0.3,
  maxResults: 5,
  keywordWeight: 0.4,
  descriptionWeight: 0.4,
  semanticWeight: 0.2,
}

export class SkillMatcher {
  private skills: Map<string, LoadedSkill> = new Map()
  private keywordIndex: Map<string, Set<string>> = new Map()
  private options: Required<SkillMatcherOptions>

  constructor(options?: SkillMatcherOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  register(skill: LoadedSkill): void {
    this.skills.set(skill.id, skill)
    this.indexSkill(skill)
  }

  unregister(skillId: string): void {
    const skill = this.skills.get(skillId)
    if (skill) {
      this.deindexSkill(skill)
      this.skills.delete(skillId)
    }
  }

  private indexSkill(skill: LoadedSkill): void {
    const keywords = this.extractKeywords(skill)
    for (const keyword of keywords) {
      const normalized = keyword.toLowerCase()
      const existing = this.keywordIndex.get(normalized) || new Set()
      existing.add(skill.id)
      this.keywordIndex.set(normalized, existing)
    }
  }

  private deindexSkill(skill: LoadedSkill): void {
    const keywords = this.extractKeywords(skill)
    for (const keyword of keywords) {
      const normalized = keyword.toLowerCase()
      const existing = this.keywordIndex.get(normalized)
      if (existing) {
        existing.delete(skill.id)
        if (existing.size === 0) {
          this.keywordIndex.delete(normalized)
        }
      }
    }
  }

  private extractKeywords(skill: LoadedSkill): string[] {
    const keywords: Set<string> = new Set()

    if (skill.frontmatter.keywords) {
      for (const kw of skill.frontmatter.keywords) {
        keywords.add(kw.toLowerCase())
      }
    }

    const description = skill.frontmatter.description.toLowerCase()
    const words = description.split(/\s+/)
    for (const word of words) {
      if (word.length >= 3) {
        keywords.add(word.replace(/[^a-z0-9]/g, ''))
      }
    }

    if (skill.frontmatter.whenToUse) {
      const whenToUse = skill.frontmatter.whenToUse.toLowerCase()
      const whenWords = whenToUse.split(/\s+/)
      for (const word of whenWords) {
        if (word.length >= 3) {
          keywords.add(word.replace(/[^a-z0-9]/g, ''))
        }
      }
    }

    return Array.from(keywords).filter(Boolean)
  }

  match(userPrompt: string): SkillMatch[] {
    const promptLower = userPrompt.toLowerCase()
    const promptWords = new Set(
      promptLower
        .split(/\s+/)
        .map((w) => w.replace(/[^a-z0-9]/g, ''))
        .filter((w) => w.length >= 2),
    )

    const candidates = new Map<string, { keywordScore: number; matchedKeywords: string[] }>()

    for (const [keyword, skillIds] of this.keywordIndex) {
      if (promptLower.includes(keyword) || promptWords.has(keyword)) {
        for (const skillId of skillIds) {
          const existing = candidates.get(skillId) || {
            keywordScore: 0,
            matchedKeywords: [],
          }
          existing.keywordScore++
          existing.matchedKeywords.push(keyword)
          candidates.set(skillId, existing)
        }
      }
    }

    const results: SkillMatch[] = []

    for (const [skillId, candidate] of candidates) {
      const skill = this.skills.get(skillId)
      if (!skill) continue

      const keywordScore = Math.min(candidate.keywordScore / 5, 1)
      const descriptionScore = this.scoreDescriptionMatch(
        promptLower,
        skill.frontmatter.description,
      )
      const semanticScore = this.scoreSemanticMatch(promptLower, skill)

      const totalScore =
        keywordScore * this.options.keywordWeight +
        descriptionScore * this.options.descriptionWeight +
        semanticScore * this.options.semanticWeight

      if (totalScore >= this.options.minScore) {
        results.push({
          skill,
          score: totalScore,
          matchedKeywords: [...new Set(candidate.matchedKeywords)],
          matchedDescription: descriptionScore > 0.5,
        })
      }
    }

    results.sort((a, b) => b.score - a.score)

    return results.slice(0, this.options.maxResults)
  }

  private scoreDescriptionMatch(prompt: string, description: string): number {
    const descLower = description.toLowerCase()
    const promptWords = prompt.split(/\s+/)

    let matches = 0
    for (const word of promptWords) {
      if (word.length >= 3 && descLower.includes(word.toLowerCase())) {
        matches++
      }
    }

    return Math.min(matches / promptWords.length, 1)
  }

  private scoreSemanticMatch(prompt: string, skill: LoadedSkill): number {
    let score = 0

    const patterns = [
      { pattern: /debug|fix|error|bug|issue/i, keywords: ['debug', 'fix', 'error', 'bug'] },
      { pattern: /test|spec|testing/i, keywords: ['test', 'spec'] },
      { pattern: /deploy|release|publish/i, keywords: ['deploy', 'release'] },
      { pattern: /refactor|clean|improve/i, keywords: ['refactor', 'clean'] },
      { pattern: /document|doc|readme/i, keywords: ['document', 'doc'] },
      { pattern: /security|audit|vulnerability/i, keywords: ['security', 'audit'] },
      { pattern: /performance|optimize|speed/i, keywords: ['performance', 'optimize'] },
      { pattern: /database|sql|migration/i, keywords: ['database', 'sql', 'migration'] },
      { pattern: /api|endpoint|rest|graphql/i, keywords: ['api', 'endpoint'] },
      { pattern: /ui|frontend|component/i, keywords: ['ui', 'frontend', 'component'] },
    ]

    const skillKeywords = new Set(this.extractKeywords(skill))

    for (const { pattern, keywords } of patterns) {
      if (pattern.test(prompt)) {
        for (const kw of keywords) {
          if (skillKeywords.has(kw)) {
            score += 0.2
          }
        }
      }
    }

    return Math.min(score, 1)
  }

  getSkill(skillId: string): LoadedSkill | undefined {
    return this.skills.get(skillId)
  }

  getAllSkills(): LoadedSkill[] {
    return Array.from(this.skills.values())
  }

  clear(): void {
    this.skills.clear()
    this.keywordIndex.clear()
  }
}

export function effectiveTools(
  globalAllow: Set<string>,
  skill?: LoadedSkill,
): Set<string> {
  if (!skill?.frontmatter.allowedTools?.length) return globalAllow

  const skillSet = new Set(skill.frontmatter.allowedTools)
  return new Set([...globalAllow].filter((t) => skillSet.has(t)))
}

export function mergeSkillTools(
  globalAllow: Set<string>,
  skills: LoadedSkill[],
): Set<string> {
  if (skills.length === 0) return globalAllow

  let result = globalAllow
  for (const skill of skills) {
    result = effectiveTools(result, skill)
  }
  return result
}

let matcherInstance: SkillMatcher | null = null

export function getSkillMatcher(options?: SkillMatcherOptions): SkillMatcher {
  if (!matcherInstance) {
    matcherInstance = new SkillMatcher(options)
  }
  return matcherInstance
}

export function resetSkillMatcher(): void {
  matcherInstance?.clear()
  matcherInstance = null
}

export function selectSkills(
  userPrompt: string,
  catalog: LoadedSkill[],
  options?: SkillMatcherOptions,
): LoadedSkill[] {
  const matcher = new SkillMatcher(options)
  for (const skill of catalog) {
    matcher.register(skill)
  }
  return matcher.match(userPrompt).map((m) => m.skill)
}
