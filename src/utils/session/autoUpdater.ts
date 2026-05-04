import { execFileNoThrow } from '@utils/system/execFileNoThrow'
import { logError } from '@utils/log'

import { MACRO } from '@constants/macros'
import { PRODUCT_NAME } from '@constants/product'

async function getSemver() {
  const mod: any = await import('semver')
  return (mod?.default ?? mod) as {
    lt: (a: string, b: string) => boolean
    gt: (a: string, b: string) => boolean
  }
}

export type VersionConfig = {
  minVersion: string
}

export async function assertMinVersion(): Promise<void> {
  // Simplified: no version check
  return;
}

export async function getLatestVersion(): Promise<string | null> {
  try {
    const abortController = new AbortController()
    setTimeout(() => abortController.abort(), 5000)
    const result = await execFileNoThrow(
      'npm',
      ['view', MACRO.PACKAGE_URL, 'version'],
      abortController.signal,
    )
    if (result.code === 0) {
      const v = result.stdout.trim()
      if (v) return v
    }
  } catch {}

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(MACRO.PACKAGE_URL)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.npm.install-v1+json',
          'User-Agent': `${PRODUCT_NAME}/${MACRO.VERSION}`,
        },
        signal: controller.signal,
      },
    )
    clearTimeout(timer)
    if (!res.ok) return null
    const json: any = await res.json().catch(() => null)
    const latest = json && json['dist-tags'] && json['dist-tags'].latest
    return typeof latest === 'string' ? latest : null
  } catch {
    return null
  }
}

export async function getUpdateCommandSuggestions(): Promise<string[]> {
  return [
    `bun add -g ${MACRO.PACKAGE_URL}@latest`,
    `npm install -g ${MACRO.PACKAGE_URL}@latest`,
  ]
}

export async function checkAndNotifyUpdate(): Promise<void> {
  // Version update check disabled
  return
}
