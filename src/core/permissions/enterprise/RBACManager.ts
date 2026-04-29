export type Role =
  | 'admin'
  | 'security_team'
  | 'tech_lead'
  | 'developer'
  | 'viewer'
  | 'custom'

export type Permission =
  | 'read'
  | 'write'
  | 'execute'
  | 'delete'
  | 'admin'
  | 'bypass_permissions'
  | 'modify_rules'
  | 'view_audit_logs'
  | 'export_data'

export interface RoleDefinition {
  name: Role
  displayName: string
  description: string
  permissions: Set<Permission>
  canModifyRules: boolean
  canBypassPermissions: boolean
  maxSessionDuration?: number
  allowedModes: string[]
}

export interface UserRole {
  userId: string
  role: Role
  assignedAt: string
  assignedBy: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export class RBACManager {
  private roles: Map<Role, RoleDefinition> = new Map()
  private userRoles: Map<string, UserRole[]> = new Map()

  constructor() {
    this.initializeDefaultRoles()
  }

  private initializeDefaultRoles(): void {
    this.roles.set('admin', {
      name: 'admin',
      displayName: 'Administrator',
      description: 'Full system access with all permissions',
      permissions: new Set([
        'read',
        'write',
        'execute',
        'delete',
        'admin',
        'bypass_permissions',
        'modify_rules',
        'view_audit_logs',
        'export_data',
      ]),
      canModifyRules: true,
      canBypassPermissions: true,
      allowedModes: ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'],
    })

    this.roles.set('security_team', {
      name: 'security_team',
      displayName: 'Security Team',
      description: 'Security-focused role with audit and rule management capabilities',
      permissions: new Set([
        'read',
        'execute',
        'modify_rules',
        'view_audit_logs',
        'export_data',
      ]),
      canModifyRules: true,
      canBypassPermissions: false,
      allowedModes: ['default', 'plan', 'auto'],
    })

    this.roles.set('tech_lead', {
      name: 'tech_lead',
      displayName: 'Technical Lead',
      description: 'Team lead with elevated permissions for code review and deployment',
      permissions: new Set([
        'read',
        'write',
        'execute',
        'delete',
        'view_audit_logs',
      ]),
      canModifyRules: true,
      canBypassPermissions: false,
      allowedModes: ['default', 'acceptEdits', 'plan', 'auto'],
    })

    this.roles.set('developer', {
      name: 'developer',
      displayName: 'Developer',
      description: 'Standard developer role with read/write permissions',
      permissions: new Set(['read', 'write', 'execute']),
      canModifyRules: false,
      canBypassPermissions: false,
      allowedModes: ['default', 'acceptEdits', 'plan'],
    })

    this.roles.set('viewer', {
      name: 'viewer',
      displayName: 'Viewer',
      description: 'Read-only access for code review and analysis',
      permissions: new Set(['read']),
      canModifyRules: false,
      canBypassPermissions: false,
      allowedModes: ['plan'],
    })
  }

  assignRole(
    userId: string,
    role: Role,
    assignedBy: string,
    expiresAt?: string,
  ): void {
    const userRole: UserRole = {
      userId,
      role,
      assignedAt: new Date().toISOString(),
      assignedBy,
      expiresAt,
    }

    const existing = this.userRoles.get(userId) || []
    existing.push(userRole)
    this.userRoles.set(userId, existing)
  }

  revokeRole(userId: string, role: Role): boolean {
    const existing = this.userRoles.get(userId)
    if (!existing) return false

    const index = existing.findIndex((ur) => ur.role === role)
    if (index === -1) return false

    existing.splice(index, 1)
    return true
  }

  getUserRoles(userId: string): UserRole[] {
    const roles = this.userRoles.get(userId) || []
    const now = new Date()

    return roles.filter((role) => {
      if (role.expiresAt) {
        return new Date(role.expiresAt) > now
      }
      return true
    })
  }

  getUserPermissions(userId: string): Set<Permission> {
    const roles = this.getUserRoles(userId)
    const permissions = new Set<Permission>()

    for (const userRole of roles) {
      const roleDef = this.roles.get(userRole.role)
      if (roleDef) {
        for (const perm of roleDef.permissions) {
          permissions.add(perm)
        }
      }
    }

    return permissions
  }

  hasPermission(userId: string, permission: Permission): boolean {
    const permissions = this.getUserPermissions(userId)
    return permissions.has(permission)
  }

  canModifyRules(userId: string): boolean {
    const roles = this.getUserRoles(userId)

    for (const userRole of roles) {
      const roleDef = this.roles.get(userRole.role)
      if (roleDef && roleDef.canModifyRules) {
        return true
      }
    }

    return false
  }

  canBypassPermissions(userId: string): boolean {
    const roles = this.getUserRoles(userId)

    for (const userRole of roles) {
      const roleDef = this.roles.get(userRole.role)
      if (roleDef && roleDef.canBypassPermissions) {
        return true
      }
    }

    return false
  }

  getAllowedModes(userId: string): string[] {
    const roles = this.getUserRoles(userId)
    const modes = new Set<string>()

    for (const userRole of roles) {
      const roleDef = this.roles.get(userRole.role)
      if (roleDef) {
        for (const mode of roleDef.allowedModes) {
          modes.add(mode)
        }
      }
    }

    return Array.from(modes)
  }

  isModeAllowed(userId: string, mode: string): boolean {
    const allowedModes = this.getAllowedModes(userId)
    return allowedModes.includes(mode)
  }

  getRoleDefinition(role: Role): RoleDefinition | undefined {
    return this.roles.get(role)
  }

  getAllRoles(): RoleDefinition[] {
    return Array.from(this.roles.values())
  }

  createCustomRole(
    name: string,
    definition: Omit<RoleDefinition, 'name'>,
  ): void {
    this.roles.set('custom', {
      name: 'custom',
      ...definition,
    })
  }

  exportConfig(): {
    roles: Array<{ name: Role; definition: RoleDefinition }>
    userRoles: Array<{ userId: string; roles: UserRole[] }>
  } {
    const roles = Array.from(this.roles.entries()).map(([name, definition]) => ({
      name,
      definition,
    }))

    const userRoles = Array.from(this.userRoles.entries()).map(([userId, roles]) => ({
      userId,
      roles,
    }))

    return { roles, userRoles }
  }

  importConfig(config: {
    roles?: Array<{ name: Role; definition: RoleDefinition }>
    userRoles?: Array<{ userId: string; roles: UserRole[] }>
  }): void {
    if (config.roles) {
      for (const { name, definition } of config.roles) {
        this.roles.set(name, definition)
      }
    }

    if (config.userRoles) {
      for (const { userId, roles } of config.userRoles) {
        this.userRoles.set(userId, roles)
      }
    }
  }
}
