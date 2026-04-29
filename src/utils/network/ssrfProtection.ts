const PRIVATE_IP_RANGES = [
  { start: '0.0.0.0', end: '0.255.255.255', name: 'Current network' },
  { start: '10.0.0.0', end: '10.255.255.255', name: 'Private Class A' },
  { start: '127.0.0.0', end: '127.255.255.255', name: 'Loopback' },
  { start: '169.254.0.0', end: '169.254.255.255', name: 'Link-local' },
  { start: '172.16.0.0', end: '172.31.255.255', name: 'Private Class B' },
  { start: '192.0.0.0', end: '192.0.0.255', name: 'IETF Protocol Assignments' },
  { start: '192.0.2.0', end: '192.0.2.255', name: 'TEST-NET-1' },
  { start: '192.168.0.0', end: '192.168.255.255', name: 'Private Class C' },
  { start: '198.18.0.0', end: '198.19.255.255', name: 'Benchmark testing' },
  { start: '198.51.100.0', end: '198.51.100.255', name: 'TEST-NET-2' },
  { start: '203.0.113.0', end: '203.0.113.255', name: 'TEST-NET-3' },
  { start: '224.0.0.0', end: '239.255.255.255', name: 'Multicast' },
  { start: '240.0.0.0', end: '255.255.255.255', name: 'Reserved' },
]

const IPV6_PRIVATE_PATTERNS = [
  { pattern: /^::$/, name: 'Unspecified' },
  { pattern: /^::1$/, name: 'Loopback' },
  { pattern: /^fc[0-9a-f]{2}:/i, name: 'Unique local' },
  { pattern: /^fd[0-9a-f]{2}:/i, name: 'Unique local' },
  { pattern: /^fe[8-9a-b][0-9a-f]:/i, name: 'Link-local' },
  { pattern: /^ff[0-9a-f]{2}:/i, name: 'Multicast' },
]

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number)
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
}

export function isPrivateIPv4(ip: string): boolean {
  const ipNum = ipToNumber(ip)
  for (const range of PRIVATE_IP_RANGES) {
    const startNum = ipToNumber(range.start)
    const endNum = ipToNumber(range.end)
    if (ipNum >= startNum && ipNum <= endNum) {
      return true
    }
  }
  return false
}

export function isPrivateIPv6(ip: string): boolean {
  const normalizedIp = ip.toLowerCase().split('%')[0]
  for (const { pattern } of IPV6_PRIVATE_PATTERNS) {
    if (pattern.test(normalizedIp)) {
      return true
    }
  }
  return false
}

export function isPrivateIP(ip: string): boolean {
  if (ip.includes(':')) {
    return isPrivateIPv6(ip)
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return isPrivateIPv4(ip)
  }
  return false
}

export async function resolveHostname(hostname: string): Promise<string[]> {
  const dns = await import('node:dns').then(m => m.promises)
  try {
    const addresses = await dns.resolve4(hostname)
    return addresses
  } catch {
    try {
      const addresses = await dns.resolve6(hostname)
      return addresses
    } catch {
      return []
    }
  }
}

export interface SSRFCheckResult {
  allowed: boolean
  reason?: string
  resolvedIPs?: string[]
}

export async function checkSSRF(url: string): Promise<SSRFCheckResult> {
  try {
    const parsed = new URL(url)

    if (parsed.protocol === 'file:') {
      return {
        allowed: false,
        reason: 'file:// protocol is not allowed',
      }
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        allowed: false,
        reason: `Protocol ${parsed.protocol} is not allowed`,
      }
    }

    const hostname = parsed.hostname

    if (hostname === 'localhost' || hostname === 'localhost.localdomain') {
      return {
        allowed: false,
        reason: 'Access to localhost is not allowed',
      }
    }

    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      if (isPrivateIPv4(hostname)) {
        return {
          allowed: false,
          reason: `Access to private IP ${hostname} is not allowed`,
        }
      }
      return { allowed: true, resolvedIPs: [hostname] }
    }

    if (hostname.includes(':')) {
      if (isPrivateIPv6(hostname)) {
        return {
          allowed: false,
          reason: `Access to private IPv6 ${hostname} is not allowed`,
        }
      }
      return { allowed: true, resolvedIPs: [hostname] }
    }

    const resolvedIPs = await resolveHostname(hostname)

    for (const ip of resolvedIPs) {
      if (isPrivateIP(ip)) {
        return {
          allowed: false,
          reason: `Hostname ${hostname} resolves to private IP ${ip}`,
          resolvedIPs,
        }
      }
    }

    return {
      allowed: true,
      resolvedIPs,
    }
  } catch (error) {
    return {
      allowed: false,
      reason: `Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export function validateUrlForFetch(
  url: string,
  options?: {
    allowPrivateIP?: boolean
    allowedProtocols?: string[]
    blockedHosts?: string[]
    allowedHosts?: string[]
  },
): { valid: boolean; reason?: string } {
  const opts = {
    allowPrivateIP: false,
    allowedProtocols: ['http:', 'https:'],
    blockedHosts: [] as string[],
    allowedHosts: [] as string[],
    ...options,
  }

  try {
    const parsed = new URL(url)

    if (!opts.allowedProtocols.includes(parsed.protocol)) {
      return {
        valid: false,
        reason: `Protocol ${parsed.protocol} is not allowed`,
      }
    }

    const hostname = parsed.hostname.toLowerCase()

    if (opts.blockedHosts.some(h => h.toLowerCase() === hostname)) {
      return {
        valid: false,
        reason: `Host ${hostname} is blocked`,
      }
    }

    if (opts.allowedHosts.length > 0) {
      const isAllowed = opts.allowedHosts.some(h => {
        const allowed = h.toLowerCase()
        if (allowed.startsWith('*.')) {
          return hostname.endsWith(allowed.slice(1))
        }
        return allowed === hostname
      })

      if (!isAllowed) {
        return {
          valid: false,
          reason: `Host ${hostname} is not in the allowed list`,
        }
      }
    }

    if (!opts.allowPrivateIP) {
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        if (isPrivateIPv4(hostname)) {
          return {
            valid: false,
            reason: `Access to private IP ${hostname} is not allowed`,
          }
        }
      }

      if (hostname === 'localhost') {
        return {
          valid: false,
          reason: 'Access to localhost is not allowed',
        }
      }
    }

    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      reason: `Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
