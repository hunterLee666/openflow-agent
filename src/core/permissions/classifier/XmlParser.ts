import {
  XmlClassifierOutput,
  PermissionVerdict,
  RiskLevel,
  RiskFamily,
} from './types'

export function parseXmlClassifierOutput(xmlString: string): XmlClassifierOutput {
  const parseErrors: string[] = []
  let parsed = false

  try {
    const verdict = extractXmlValue(xmlString, 'verdict') as PermissionVerdict
    const riskLevel = extractXmlValue(xmlString, 'risk_level') as RiskLevel
    const riskFamily = extractXmlValue(xmlString, 'risk_family') as RiskFamily
    const confidenceStr = extractXmlValue(xmlString, 'confidence')
    const rationale = extractXmlValue(xmlString, 'rationale')
    const suggestedActions = extractXmlActions(xmlString)

    if (!isValidVerdict(verdict)) {
      parseErrors.push(`Invalid verdict: ${verdict}`)
    }

    if (!isValidRiskLevel(riskLevel)) {
      parseErrors.push(`Invalid risk level: ${riskLevel}`)
    }

    if (!isValidRiskFamily(riskFamily)) {
      parseErrors.push(`Invalid risk family: ${riskFamily}`)
    }

    const confidence = parseConfidence(confidenceStr)

    parsed = parseErrors.length === 0

    if (!parsed) {
      return createFailClosedOutput(xmlString, parseErrors)
    }

    return {
      verdict,
      riskLevel,
      riskFamily,
      confidence,
      rationale: rationale || 'No rationale provided',
      suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
      xml: xmlString,
      parsed: true,
    }
  } catch (error) {
    parseErrors.push(`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return createFailClosedOutput(xmlString, parseErrors)
  }
}

function extractXmlValue(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1].trim() : ''
}

function extractXmlActions(xml: string): string[] {
  const actions: string[] = []
  const actionsMatch = xml.match(/<suggested_actions[^>]*>([\s\S]*?)<\/suggested_actions>/i)

  if (actionsMatch) {
    const actionsContent = actionsMatch[1]
    const actionMatches = actionsContent.matchAll(/<action[^>]*>([^<]*)<\/action>/gi)
    for (const match of actionMatches) {
      const action = match[1].trim()
      if (action) {
        actions.push(action)
      }
    }
  }

  return actions
}

function parseConfidence(value: string): number {
  if (!value) return 0.5

  const num = parseFloat(value)
  if (isNaN(num)) return 0.5

  if (num >= 0 && num <= 1) return num
  if (num > 1 && num <= 100) return num / 100

  return 0.5
}

function isValidVerdict(value: string): value is PermissionVerdict {
  return ['allow', 'ask', 'deny'].includes(value)
}

function isValidRiskLevel(value: string): value is RiskLevel {
  return ['low', 'medium', 'high', 'critical'].includes(value)
}

function isValidRiskFamily(value: string): value is RiskFamily {
  const validFamilies: RiskFamily[] = [
    'file_read',
    'file_write',
    'file_delete',
    'bash_command',
    'network_fetch',
    'network_exfil',
    'privilege_escalation',
    'supply_chain',
    'data_exposure',
    'system_modification',
    'unknown',
  ]
  return validFamilies.includes(value as RiskFamily)
}

function createFailClosedOutput(
  xml: string,
  parseErrors: string[],
): XmlClassifierOutput {
  return {
    verdict: 'ask',
    riskLevel: 'high',
    riskFamily: 'unknown',
    confidence: 0.0,
    rationale: 'Failed to parse classifier output. Defaulting to ask for safety.',
    suggestedActions: [
      'Review the tool call manually',
      'Check classifier configuration',
    ],
    xml,
    parsed: false,
    parseErrors,
  }
}

export function validateXmlStructure(xml: string): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!xml.includes('<permission_decision')) {
    errors.push('Missing <permission_decision> root element')
  }

  if (!xml.includes('</permission_decision>')) {
    errors.push('Missing closing </permission_decision> tag')
  }

  const requiredTags = ['verdict', 'risk_level', 'risk_family', 'confidence']
  for (const tag of requiredTags) {
    if (!xml.includes(`<${tag}>`) || !xml.includes(`</${tag}>`)) {
      errors.push(`Missing required tag: ${tag}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function sanitizeXmlInput(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/<\?[^?]*\?>/g, '')
    .replace(/<!\[CDATA\[.*?\]\]>/gs, '')
    .trim()
}
