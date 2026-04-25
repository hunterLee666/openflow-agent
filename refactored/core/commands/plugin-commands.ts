import type { PluginManager, PluginRegistryEntry } from "../plugins/index.js";

export function createPluginCommands(manager: PluginManager): Record<string, (args: string) => Promise<string>> {
  return {
    async list(args: string): Promise<string> {
      const filter = args.trim() as "command" | "agent" | "skill" | "hook" | "mcp" | undefined;
      const plugins = manager.list(filter);

      if (plugins.length === 0) {
        return "No plugins found.";
      }

      const lines = [
        `Found ${plugins.length} plugin(s):\n`,
        `Name`.padEnd(25) + `Status`.padEnd(12) + `Source`,
        "─".repeat(70),
      ];

      for (const plugin of plugins) {
        const entry = manager.getEntry(plugin.name);
        const status = entry?.status || "unknown";
        const source = entry?.source || "unknown";
        lines.push(
          plugin.name.padEnd(25) +
          status.padEnd(12) +
          source
        );
      }

      return lines.join("\n");
    },

    async enable(args: string): Promise<string> {
      const name = args.trim();
      if (!name) {
        return "Usage: /plugin enable <name>";
      }

      try {
        await manager.enable(name);
        return `Plugin "${name}" enabled.`;
      } catch (error) {
        return `Failed to enable "${name}": ${(error as Error).message}`;
      }
    },

    async disable(args: string): Promise<string> {
      const name = args.trim();
      if (!name) {
        return "Usage: /plugin disable <name>";
      }

      try {
        await manager.disable(name);
        return `Plugin "${name}" disabled.`;
      } catch (error) {
        return `Failed to disable "${name}": ${(error as Error).message}`;
      }
    },

    async reload(args: string): Promise<string> {
      const name = args.trim();
      if (!name) {
        return "Usage: /plugin reload <name>";
      }

      try {
        await manager.reload(name);
        return `Plugin "${name}" reloaded.`;
      } catch (error) {
        return `Failed to reload "${name}": ${(error as Error).message}`;
      }
    },

    async info(args: string): Promise<string> {
      const name = args.trim();
      if (!name) {
        return "Usage: /plugin info <name>";
      }

      const plugin = manager.get(name);
      if (!plugin) {
        return `Plugin "${name}" not found.`;
      }

      const entry = manager.getEntry(name);
      const status = entry?.status || "unknown";
      const lines = [
        `Plugin: ${plugin.name}`,
        `Version: ${plugin.version}`,
        `Status: ${status}`,
        `Description: ${plugin.description}`,
        `Components: ${plugin.components.map(c => c.type).join(", ")}`,
      ];

      return lines.join("\n");
    },

    async health(args: string): Promise<string> {
      const results = await manager.healthCheck();
      const lines = ["Plugin Health Check:\n"];

      for (const [name, healthy] of results.entries()) {
        lines.push(`${healthy ? "✓" : "✗"} ${name}`);
      }

      const healthyCount = Array.from(results.values()).filter(Boolean).length;
      lines.push(`\n${healthyCount}/${results.size} plugins healthy`);

      return lines.join("\n");
    },

    async stats(args: string): Promise<string> {
      const activeCount = manager.getActiveCount();
      const totalCount = manager.list().length;

      const commandCount = manager.getCountByType("command");
      const agentCount = manager.getCountByType("agent");
      const skillCount = manager.getCountByType("skill");
      const hookCount = manager.getCountByType("hook");
      const mcpCount = manager.getCountByType("mcp");

      return [
        "Plugin Statistics:",
        `Total: ${totalCount}`,
        `Active: ${activeCount}`,
        `Disabled: ${totalCount - activeCount}`,
        "",
        "By Type:",
        `  Commands: ${commandCount}`,
        `  Agents: ${agentCount}`,
        `  Skills: ${skillCount}`,
        `  Hooks: ${hookCount}`,
        `  MCP: ${mcpCount}`,
      ].join("\n");
    },
  };
}
