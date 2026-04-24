export type CollapseGroupType =
  | "read_search"
  | "bash_stream"
  | "tool_use"
  | "agent_thinking"
  | "file_edit"
  | "git_operation"
  | "mcp_tool_call"
  | "generic";

export interface CollapseRule {
  type: CollapseGroupType;
  maxItems?: number;
  maxLines?: number;
  maxAgeMs?: number;
  priority: number;
  collapsible: boolean;
  autoCollapse?: boolean;
}

export interface CollapseConfig {
  enabled: boolean;
  rules: CollapseRule[];
  preserveLast?: boolean;
  preserveErrors?: boolean;
  maxCollapsedGroups?: number;
}

export const DEFAULT_COLLAPSE_CONFIG: CollapseConfig = {
  enabled: true,
  preserveLast: true,
  preserveErrors: true,
  maxCollapsedGroups: 20,
  rules: [
    {
      type: "read_search",
      maxItems: 10,
      maxLines: 100,
      priority: 10,
      collapsible: true,
      autoCollapse: true,
    },
    {
      type: "bash_stream",
      maxLines: 50,
      priority: 20,
      collapsible: true,
      autoCollapse: false,
    },
    {
      type: "tool_use",
      maxItems: 20,
      maxLines: 150,
      priority: 15,
      collapsible: true,
      autoCollapse: false,
    },
    {
      type: "agent_thinking",
      maxLines: 200,
      priority: 5,
      collapsible: true,
      autoCollapse: true,
    },
    {
      type: "file_edit",
      maxItems: 15,
      maxLines: 100,
      priority: 25,
      collapsible: true,
      autoCollapse: false,
    },
    {
      type: "git_operation",
      maxItems: 10,
      maxLines: 80,
      priority: 30,
      collapsible: true,
      autoCollapse: false,
    },
    {
      type: "mcp_tool_call",
      maxItems: 25,
      maxLines: 120,
      priority: 18,
      collapsible: true,
      autoCollapse: false,
    },
    {
      type: "generic",
      maxItems: 10,
      maxLines: 50,
      priority: 1,
      collapsible: false,
    },
  ],
};

export interface MessageGroup {
  id: string;
  type: CollapseGroupType;
  items: MessageItem[];
  collapsed: boolean;
  expandedPreview?: string;
  itemCount: number;
  totalLines: number;
  startTime: number;
  endTime: number;
  metadata?: Record<string, unknown>;
}

export interface MessageItem {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class MessageGrouper {
  private config: CollapseConfig;
  private groups: Map<string, MessageGroup> = new Map();
  private items: Map<string, MessageItem> = new Map();

  constructor(config: Partial<CollapseConfig> = {}) {
    this.config = { ...DEFAULT_COLLAPSE_CONFIG, ...config };
  }

  addItem(item: MessageItem): string | null {
    this.items.set(item.id, item);

    const groupType = this.classifyItem(item);
    const group = this.findOrCreateGroup(groupType, item);

    if (group) {
      group.items.push(item);
      group.itemCount = group.items.length;
      group.endTime = item.timestamp;
      group.totalLines += this.countLines(item.content);

      this.checkCollapse(group);

      if (this.config.preserveErrors && this.isErrorItem(item)) {
        group.collapsed = false;
      }

      return group.id;
    }

    return null;
  }

  private classifyItem(item: MessageItem): CollapseGroupType {
    const type = item.type.toLowerCase();

    if (type.includes("read") || type.includes("search")) {
      return "read_search";
    }
    if (type.includes("bash") || type.includes("shell") || type.includes("stream")) {
      return "bash_stream";
    }
    if (type.includes("tool") && type.includes("use")) {
      return "tool_use";
    }
    if (type.includes("think") || type.includes("reasoning")) {
      return "agent_thinking";
    }
    if (type.includes("edit") || type.includes("write") || type.includes("file")) {
      return "file_edit";
    }
    if (type.includes("git") || type.includes("commit") || type.includes("branch")) {
      return "git_operation";
    }
    if (type.includes("mcp") || type.includes("server")) {
      return "mcp_tool_call";
    }

    return "generic";
  }

  private findOrCreateGroup(type: CollapseGroupType, item: MessageItem): MessageGroup | null {
    const rule = this.getRule(type);
    if (!rule || !rule.collapsible) {
      return null;
    }

    const now = Date.now();
    const timeWindow = rule.maxAgeMs || 60000;

    for (const [, group] of this.groups) {
      if (
        group.type === type &&
        !group.collapsed &&
        now - group.endTime < timeWindow
      ) {
        return group;
      }
    }

    const newGroup: MessageGroup = {
      id: `group_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      items: [],
      collapsed: rule.autoCollapse || false,
      itemCount: 0,
      totalLines: 0,
      startTime: item.timestamp,
      endTime: item.timestamp,
    };

    this.groups.set(newGroup.id, newGroup);
    this.enforceMaxGroups();

    return newGroup;
  }

  private checkCollapse(group: MessageGroup): void {
    const rule = this.getRule(group.type);
    if (!rule) return;

    let shouldCollapse = false;

    if (rule.maxItems && group.itemCount > rule.maxItems) {
      shouldCollapse = true;
    }

    if (rule.maxLines && group.totalLines > rule.maxLines) {
      shouldCollapse = true;
    }

    if (shouldCollapse && rule.autoCollapse) {
      group.collapsed = true;
      group.expandedPreview = this.generatePreview(group);
    }
  }

  private generatePreview(group: MessageGroup): string {
    const lastFewItems = group.items.slice(-3);
    const previews = lastFewItems.map((item) => {
      const lines = item.content.split("\n").slice(0, 3);
      return lines.join("\n");
    });

    return `[${group.type}] ${group.itemCount} items total\n${previews.join("\n---\n")}`;
  }

  private getRule(type: CollapseGroupType): CollapseRule | undefined {
    return this.config.rules.find((r) => r.type === type);
  }

  private countLines(content: string): number {
    return content.split("\n").length;
  }

  private isErrorItem(item: MessageItem): boolean {
    const content = item.content.toLowerCase();
    return (
      content.includes("error") ||
      content.includes("fail") ||
      content.includes("exception") ||
      item.metadata?.["isError"] === true
    );
  }

  private enforceMaxGroups(): void {
    if (!this.config.maxCollapsedGroups) return;

    const groups = Array.from(this.groups.values());

    if (groups.length > this.config.maxCollapsedGroups) {
      const sorted = groups.sort((a, b) => {
        const priorityA = this.getRule(a.type)?.priority || 0;
        const priorityB = this.getRule(b.type)?.priority || 0;
        return priorityB - priorityA;
      });

      const toRemove = sorted.slice(this.config.maxCollapsedGroups);

      for (const group of toRemove) {
        this.groups.delete(group.id);
      }
    }
  }

  getGroup(id: string): MessageGroup | undefined {
    return this.groups.get(id);
  }

  getAllGroups(): MessageGroup[] {
    return Array.from(this.groups.values());
  }

  getGroupsByType(type: CollapseGroupType): MessageGroup[] {
    return this.getAllGroups().filter((g) => g.type === type);
  }

  toggleCollapse(groupId: string): boolean | null {
    const group = this.groups.get(groupId);
    if (!group) return null;

    group.collapsed = !group.collapsed;
    return group.collapsed;
  }

  expandGroup(groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;

    group.collapsed = false;
    return true;
  }

  collapseGroup(groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;

    group.collapsed = true;
    if (!group.expandedPreview) {
      group.expandedPreview = this.generatePreview(group);
    }
    return true;
  }

  removeGroup(groupId: string): boolean {
    return this.groups.delete(groupId);
  }

  clear(): void {
    this.groups.clear();
    this.items.clear();
  }

  getStats(): {
    totalGroups: number;
    collapsedGroups: number;
    totalItems: number;
    byType: Record<CollapseGroupType, number>;
  } {
    const groups = this.getAllGroups();

    return {
      totalGroups: groups.length,
      collapsedGroups: groups.filter((g) => g.collapsed).length,
      totalItems: this.items.size,
      byType: {
        read_search: groups.filter((g) => g.type === "read_search").length,
        bash_stream: groups.filter((g) => g.type === "bash_stream").length,
        tool_use: groups.filter((g) => g.type === "tool_use").length,
        agent_thinking: groups.filter((g) => g.type === "agent_thinking").length,
        file_edit: groups.filter((g) => g.type === "file_edit").length,
        git_operation: groups.filter((g) => g.type === "git_operation").length,
        mcp_tool_call: groups.filter((g) => g.type === "mcp_tool_call").length,
        generic: groups.filter((g) => g.type === "generic").length,
      },
    };
  }
}

export function createMessageGrouper(
  config?: Partial<CollapseConfig>
): MessageGrouper {
  return new MessageGrouper(config);
}

export const defaultMessageGrouper = createMessageGrouper();
