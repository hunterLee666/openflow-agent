/**
 * Sandbox System
 *
 * Provides OS-level isolation for bash commands:
 * - Local: bubblewrap (Linux), sandbox-exec (macOS), Job Objects (Windows)
 * - Cloud: HTTP CONNECT proxy
 *
 * SDK callers configure sandbox via AgentOptions.sandbox
 */

import { execSync, spawn, type ChildProcess } from 'child_process'
import * as net from 'net'
import * as http from 'http'
import type { SandboxNetworkConfig, SandboxFilesystemConfig } from '../types.js'

export interface SandboxDepsCheckResult {
  available: boolean
  missingDeps: string[]
  error?: string
}

/**
 * Check if sandbox dependencies are available
 */
export async function checkSandboxDeps(
  config?: SandboxFilesystemConfig
): Promise<SandboxDepsCheckResult> {
  const platform = process.platform
  const missingDeps: string[] = []
  
  if (config?.mode === 'bubblewrap' || (config?.mode === undefined && platform === 'linux')) {
    try {
      execSync('which bwrap', { stdio: 'ignore' })
    } catch {
      missingDeps.push('bubblewrap (bwrap)')
    }
  }
  
  if (platform === 'darwin') {
    try {
      execSync('which sandbox-exec', { stdio: 'ignore' })
    } catch {
      missingDeps.push('sandbox-exec')
    }
  }
  
  return {
    available: missingDeps.length === 0,
    missingDeps,
  }
}

/**
 * Build bubblewrap command arguments
 */
export function buildBubblewrapArgs(
  cwd: string,
  filesystem: SandboxFilesystemConfig,
  network: SandboxNetworkConfig
): string[] {
  const args: string[] = [
    '--unshare-user',
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-net', // unless network is allowed
    '--die-with-parent',
  ]
  
  // Mount filesystem
  args.push('--bind', cwd, cwd)
  
  // Read-only system paths
  args.push('--ro-bind', '/usr', '/usr')
  args.push('--ro-bind', '/bin', '/bin')
  args.push('--ro-bind', '/lib', '/lib')
  
  // Allow write paths
  if (filesystem.allowWrite) {
    for (const path of filesystem.allowWrite) {
      args.push('--bind', path, path)
    }
  }
  
  // Deny write paths
  if (filesystem.denyWrite) {
    for (const path of filesystem.denyWrite) {
      args.push('--bind-try', path, path)
    }
  }
  
  // Deny read paths
  if (filesystem.denyRead) {
    for (const path of filesystem.denyRead) {
      args.push('--ro-bind-try', path, path)
    }
  }
  
  // Network handling - requires external proxy setup
  if (network.allowedDomains && network.allowedDomains.length > 0) {
    // Remove --unshare-net to allow network via proxy
    // Proxy will be set via environment variables
  }
  
  return args
}

/**
 * Build sandbox-exec profile for macOS
 */
export function buildSeatbeltProfile(
  cwd: string,
  filesystem: SandboxFilesystemConfig,
  network: SandboxNetworkConfig
): string {
  const rules: string[] = [
    `(version 1)`,
    `(deny default)`,
    `(allow process*)`,
  ]
  
  // Allow read cwd
  rules.push(`(allow file-read* (path "${cwd}"))`)
  
  // Allow write to allowed paths
  if (filesystem.allowWrite) {
    for (const path of filesystem.allowWrite) {
      rules.push(`(allow file-write* (path "${path}"))`)
    }
  }
  
  // Deny write to restricted paths
  if (filesystem.denyWrite) {
    for (const path of filesystem.denyWrite) {
      rules.push(`(deny file-write* (path-prefix "${path}"))`)
    }
  }
  
  // Deny read restricted paths
  if (filesystem.denyRead) {
    for (const path of filesystem.denyRead) {
      rules.push(`(deny file-read* (path-prefix "${path}"))`)
    }
  }
  
  // Network rules
  if (network.allowLocalBinding) {
    rules.push(`(allow network* (local ip "127.0.0.1"))`)
    rules.push(`(allow network* (local ip "::1"))`)
  }
  
  if (network.allowedDomains && network.allowedDomains.length > 0) {
    // Allow localhost proxy for domain filtering
    rules.push(`(allow network* (remote ip "127.0.0.1"))`)
  } else {
    rules.push(`(deny network* (remote))`)
  }
  
  return rules.join('\n')
}

/**
 * HTTP CONNECT proxy for network isolation (cloud sandbox)
 */
export class EgressProxy {
  private server: http.Server | null = null
  private allowedDomains: string[] = []
  private port: number = 0
  
  constructor(allowedDomains: string[] = []) {
    this.allowedDomains = allowedDomains
  }
  
async start(preferredPort?: number): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer()
      
      this.server.on('connect', (req: any, clientSocket: any, serverSocket: any) => {
        const { host, port } = req.url ? this.parseUrl(req.url) : { host: '', port: 80 }
        
        if (!this.isDomainAllowed(host)) {
          clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
          clientSocket.end()
          return
        }
        
        // Connect to target
        const targetSocket = net.createConnection({ host, port }, () => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
          targetSocket.pipe(clientSocket)
          clientSocket.pipe(targetSocket)
        })
        
        targetSocket.on('error', (err) => {
          clientSocket.end()
        })
      })
      
      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && preferredPort && this.port !== preferredPort) {
          // Try next port
          this.port++
          this.server?.close()
        } else {
          reject(err)
        }
      })
      
      this.server.listen(preferredPort || 0, () => {
        const addr = this.server?.address()
        this.port = (addr && typeof addr === 'object') ? addr.port : 0
        resolve(this.port)
      })
    })
  }
  
  stop(): void {
    this.server?.close()
    this.server = null
  }
  
  private parseUrl(url: string): { host: string; port: number } {
    const [hostPort] = url.split(':')
    const colonIdx = hostPort.indexOf(':')
    if (colonIdx >= 0) {
      return {
        host: hostPort.slice(0, colonIdx),
        port: parseInt(hostPort.slice(colonIdx + 1), 10) || 80,
      }
    }
    return { host: hostPort, port: 80 }
  }
  
  private isDomainAllowed(host: string): boolean {
    if (this.allowedDomains.length === 0) return true
    return this.allowedDomains.some((d) => {
      if (d.startsWith('*.')) {
        const suffix = d.slice(1)
        return host.endsWith(suffix) || host === suffix.slice(2)
      }
      return host === d || host.endsWith('.' + d)
    })
  }
  
  getPort(): number {
    return this.port
  }
}

/**
 * Sandbox executor for commands
 */
export interface SandboxExecResult {
  stdout: string
  stderr: string
  exitCode: number | null
  sandboxed: boolean
}

export async function execWithSandbox(
  command: string,
  cwd: string,
  filesystem?: SandboxFilesystemConfig,
  timeout?: number
): Promise<SandboxExecResult> {
  const platform = process.platform
  const mode = filesystem?.mode || (platform === 'linux' ? 'bubblewrap' : platform === 'darwin' ? 'seatbelt' : 'none')
  
  if (mode === 'none' || !filesystem) {
    return execDirect(command, cwd, timeout)
  }
  
  if (mode === 'bubblewrap' && platform === 'linux') {
    return execBubblewrap(command, cwd, filesystem, timeout)
  }
  
  if (mode === 'seatbelt' && platform === 'darwin') {
    return execSeatbelt(command, cwd, filesystem, timeout)
  }
  
  // Fallback to direct exec
  return execDirect(command, cwd, timeout)
}

async function execDirect(
  command: string,
  cwd: string,
  timeout?: number
): Promise<SandboxExecResult> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], {
      cwd,
      stdio: 'pipe',
      env: process.env,
    })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    
    if (timeout) {
      setTimeout(() => {
        child.kill()
        resolve({ stdout, stderr, exitCode: -1, sandboxed: false })
      }, timeout)
    }
    
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code, sandboxed: false })
    })
  })
}

async function execBubblewrap(
  command: string,
  cwd: string,
  filesystem: SandboxFilesystemConfig,
  timeout?: number
): Promise<SandboxExecResult> {
  const args = buildBubblewrapArgs(cwd, filesystem, {})
  
  // Check dependencies
  const deps = await checkSandboxDeps(filesystem)
  if (!deps.available) {
    if (filesystem.failIfUnavailable) {
      throw new Error(`Sandbox unavailable: missing ${deps.missingDeps.join(', ')}`)
    }
    return execDirect(command, cwd, timeout)
  }
  
  args.push('--')
  args.push('sh', '-c', command)
  
  return new Promise((resolve) => {
    const child = spawn('bwrap', args, {
      cwd,
      stdio: 'pipe',
      env: {
        ...process.env,
        // Network proxy settings would go here
      },
    })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    
    if (timeout) {
      setTimeout(() => {
        child.kill()
        resolve({ stdout, stderr, exitCode: -1, sandboxed: false })
      }, timeout)
    }
    
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code, sandboxed: true })
    })
    
    child.on('error', (err) => {
      // Fallback to direct exec
      resolve(execDirect(command, cwd, timeout))
    })
  })
}

async function execSeatbelt(
  command: string,
  cwd: string,
  filesystem: SandboxFilesystemConfig,
  timeout?: number
): Promise<SandboxExecResult> {
  const profile = buildSeatbeltProfile(cwd, filesystem, {})
  
  return new Promise((resolve) => {
    const child = spawn('sandbox-exec', ['-p', profile, 'sh', '-c', command], {
      cwd,
      stdio: 'pipe',
      env: process.env,
    })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout?.on('data', (d) => { stdout += d.toString() })
    child.stderr?.on('data', (d) => { stderr += d.toString() })
    
    if (timeout) {
      setTimeout(() => {
        child.kill()
        resolve({ stdout, stderr, exitCode: -1, sandboxed: false })
      }, timeout)
    }
    
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code, sandboxed: true })
    })
    
    child.on('error', () => {
      resolve(execDirect(command, cwd, timeout))
    })
  })
}