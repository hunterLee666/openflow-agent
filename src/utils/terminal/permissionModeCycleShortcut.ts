import semver from 'semver'
import type { Key } from 'ink'

export type InputShortcut = {
  displayText: string
  check: (input: string, key: Key) => boolean
}

type RuntimeInfo = {
  platform: string
  bunVersion?: string
  nodeVersion?: string
}

function supportsShiftTabOnWindows(runtime: RuntimeInfo): boolean {
  if (runtime.platform !== 'win32') return true

  try {
    const bunVersion = runtime.bunVersion
    if (bunVersion) {
      return semver.satisfies(bunVersion, '>=1.2.23')
    }

    const nodeVersion = runtime.nodeVersion
    if (!nodeVersion) return false

    return semver.satisfies(nodeVersion, '>=22.17.0 <23.0.0 || >=24.2.0')
  } catch {
    return false
  }
}

function getRuntimeInfo(): RuntimeInfo {
  return {
    platform: process.platform,
    bunVersion: process.versions?.bun,
    nodeVersion: process.versions?.node,
  };
}

export function __getPermissionModeCycleShortcutForTests(
  _runtime: RuntimeInfo,
): InputShortcut {
  // 统一使用 shift+tab 作为权限模式切换快捷键
  return {
    displayText: 'shift+tab',
    check: (_input, key) => Boolean(key.tab) && Boolean(key.shift),
  }
}

export function getPermissionModeCycleShortcut(): InputShortcut {
  return __getPermissionModeCycleShortcutForTests(getRuntimeInfo())
}
