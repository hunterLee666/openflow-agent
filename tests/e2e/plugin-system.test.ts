import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PluginManager, PluginStatus } from "../../backend/plugins/plugin-manager.js";
import type { PluginInfo, PluginComponent } from "../../backend/plugins/plugin-types.js";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-plugin-e2e-${Date.now()}`);

describe("E2E - 插件系统完整场景", () => {
  let pluginManager: PluginManager;
  let pluginDir: string;

  function createTestPlugin(name: string, components: PluginComponent[] = []): PluginInfo {
    return {
      name,
      version: "1.0.0",
      description: `测试插件 ${name}`,
      path: join(pluginDir, name),
      enabled: true,
      components,
      loadedAt: Date.now(),
    };
  }

  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    pluginDir = join(TEST_DIR, "plugins");
    await mkdir(pluginDir, { recursive: true });

    pluginManager = new PluginManager({
      telemetry: {
        log: (event: string, data?: Record<string, unknown>) => {
          console.log(`[Telemetry] ${event}`, data);
        },
      },
    });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: 插件发现", () => {
    it("应该能够发现插件目录", async () => {
      const pluginBaseDir = join(pluginDir, ".openflow-plugins");
      const pluginPath = join(pluginBaseDir, "test-plugin");
      await mkdir(pluginPath, { recursive: true });

      const manifest = {
        name: "test-plugin",
        version: "1.0.0",
        description: "测试插件",
        components: [],
      };

      await writeFile(
        join(pluginPath, "plugin.json"),
        JSON.stringify(manifest, null, 2)
      );

      const plugins = await pluginManager.discover(pluginDir);
      expect(plugins.length).toBeGreaterThan(0);
      expect(plugins[0].name).toBe("test-plugin");
    });

    it("应该能够发现多个插件", async () => {
      const pluginBaseDir = join(pluginDir, ".openflow-plugins");
      await mkdir(pluginBaseDir, { recursive: true });

      for (let i = 1; i <= 3; i++) {
        const pluginPath = join(pluginBaseDir, `plugin-${i}`);
        await mkdir(pluginPath, { recursive: true });

        const manifest = {
          name: `plugin-${i}`,
          version: "1.0.0",
          description: `测试插件 ${i}`,
          components: [],
        };

        await writeFile(
          join(pluginPath, "plugin.json"),
          JSON.stringify(manifest, null, 2)
        );
      }

      const plugins = await pluginManager.discover(pluginDir);
      expect(plugins.length).toBe(3);
    });

    it("应该能够处理空插件目录", async () => {
      const plugins = await pluginManager.discover(pluginDir);
      expect(plugins.length).toBe(0);
    });
  });

  describe("场景 2: 插件注册", () => {
    it("应该能够注册插件", async () => {
      const pluginInfo = createTestPlugin("register-test");

      let eventFired = false;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "registered") {
          eventFired = true;
        }
      });

      await pluginManager.register(pluginInfo, "manual");
      expect(eventFired).toBe(true);
    });

    it("应该能够注册多个插件", async () => {
      let registerCount = 0;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "registered") {
          registerCount++;
        }
      });

      for (let i = 1; i <= 3; i++) {
        const pluginInfo = createTestPlugin(`plugin-${i}`);
        await pluginManager.register(pluginInfo);
      }

      expect(registerCount).toBe(3);
    });

    it("重复注册同名插件应该被忽略", async () => {
      let registerCount = 0;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "registered") {
          registerCount++;
        }
      });

      const pluginInfo = createTestPlugin("duplicate-test");
      
      await pluginManager.register(pluginInfo);
      await pluginManager.register(pluginInfo);

      expect(registerCount).toBe(1);
    });
  });

  describe("场景 3: 插件激活与停用", () => {
    it("应该能够激活插件", async () => {
      const pluginInfo = createTestPlugin("activate-test");
      await pluginManager.register(pluginInfo);

      let eventFired = false;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "activated") {
          eventFired = true;
        }
      });

      await pluginManager.activate("activate-test");
      expect(eventFired).toBe(true);
    });

    it("应该能够停用插件", async () => {
      const pluginInfo = createTestPlugin("deactivate-test");
      await pluginManager.register(pluginInfo);
      await pluginManager.activate("deactivate-test");

      let eventFired = false;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "deactivated") {
          eventFired = true;
        }
      });

      await pluginManager.deactivate("deactivate-test");
      expect(eventFired).toBe(true);
    });

    it("激活不存在的插件应该失败", async () => {
      await expect(pluginManager.activate("nonexistent")).rejects.toThrow();
    });

    it("停用未激活的插件不应该出错", async () => {
      const pluginInfo = createTestPlugin("inactive-plugin");
      await pluginManager.register(pluginInfo);
      
      try {
        await pluginManager.deactivate("inactive-plugin");
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeUndefined();
      }
    });
  });

  describe("场景 4: 插件启用与禁用", () => {
    it("应该能够禁用插件", async () => {
      const pluginInfo = createTestPlugin("disable-test");
      await pluginManager.register(pluginInfo);

      let eventFired = false;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "disabled") {
          eventFired = true;
        }
      });

      await pluginManager.disable("disable-test");
      expect(eventFired).toBe(true);
    });

    it("应该能够启用插件", async () => {
      const pluginInfo = createTestPlugin("enable-test");
      pluginInfo.enabled = false;
      
      await pluginManager.register(pluginInfo);

      let eventFired = false;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "enabled") {
          eventFired = true;
        }
      });

      await pluginManager.enable("enable-test");
      expect(eventFired).toBe(true);
    });

    it("禁用激活的插件应该先停用", async () => {
      const pluginInfo = createTestPlugin("disable-active");
      await pluginManager.register(pluginInfo);
      await pluginManager.activate("disable-active");

      const events: string[] = [];
      pluginManager.on("pluginEvent", (event: any) => {
        events.push(event.type);
      });

      await pluginManager.disable("disable-active");
      expect(events).toContain("deactivated");
      expect(events).toContain("disabled");
    });
  });

  describe("场景 5: 插件事件系统", () => {
    it("应该在注册插件时触发事件", async () => {
      let eventFired = false;

      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "registered") {
          eventFired = true;
        }
      });

      const pluginInfo = createTestPlugin("event-test");
      await pluginManager.register(pluginInfo);

      expect(eventFired).toBe(true);
    });

    it("应该在激活插件时触发事件", async () => {
      let eventFired = false;

      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "activated") {
          eventFired = true;
        }
      });

      const pluginInfo = createTestPlugin("activate-event");
      await pluginManager.register(pluginInfo);
      await pluginManager.activate("activate-event");

      expect(eventFired).toBe(true);
    });

    it("应该在停用插件时触发事件", async () => {
      let eventFired = false;

      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "deactivated") {
          eventFired = true;
        }
      });

      const pluginInfo = createTestPlugin("deactivate-event");
      await pluginManager.register(pluginInfo);
      await pluginManager.activate("deactivate-event");
      await pluginManager.deactivate("deactivate-event");

      expect(eventFired).toBe(true);
    });
  });

  describe("场景 6: 插件依赖管理", () => {
    it("应该能够注册带依赖的插件", async () => {
      const pluginInfo: PluginInfo = {
        name: "dependency-test",
        version: "1.0.0",
        description: "依赖测试",
        path: join(pluginDir, "dependency-test"),
        enabled: true,
        components: [],
        loadedAt: Date.now(),
      };

      let eventFired = false;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "registered") {
          eventFired = true;
        }
      });

      await pluginManager.register(pluginInfo);
      expect(eventFired).toBe(true);
    });
  });

  describe("场景 7: 插件重载", () => {
    it("应该能够重新加载插件", async () => {
      const pluginInfo = createTestPlugin("reload-test");
      await pluginManager.register(pluginInfo);
      await pluginManager.activate("reload-test");

      let eventFired = false;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "reloaded") {
          eventFired = true;
        }
      });

      await pluginManager.reload("reload-test");
      expect(eventFired).toBe(true);
    });

    it("重载未激活的插件应该保持未激活状态", async () => {
      const pluginInfo = createTestPlugin("reload-inactive");
      await pluginManager.register(pluginInfo);

      const events: string[] = [];
      pluginManager.on("pluginEvent", (event: any) => {
        events.push(event.type);
      });

      await pluginManager.reload("reload-inactive");
      expect(events).toContain("reloaded");
      expect(events).not.toContain("activated");
    });
  });

  describe("场景 8: 插件组件管理", () => {
    it("应该能够注册带命令组件的插件", async () => {
      const commandComponent: PluginComponent = {
        type: "command",
        name: "test-command",
        description: "测试命令",
        entry: "./commands/test.js",
        config: {
          slashCommand: "/test",
          permission: "read-only",
        },
      };

      const pluginInfo = createTestPlugin("command-plugin", [commandComponent]);
      
      let eventFired = false;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "registered") {
          eventFired = true;
        }
      });

      await pluginManager.register(pluginInfo);
      expect(eventFired).toBe(true);
    });

    it("应该能够注册带技能组件的插件", async () => {
      const skillComponent: PluginComponent = {
        type: "skill",
        name: "test-skill",
        description: "测试技能",
        config: {
          trigger: ["test"],
        },
      };

      const pluginInfo = createTestPlugin("skill-plugin", [skillComponent]);
      
      let eventFired = false;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "registered") {
          eventFired = true;
        }
      });

      await pluginManager.register(pluginInfo);
      expect(eventFired).toBe(true);
    });

    it("应该能够注册带多个组件的插件", async () => {
      const components: PluginComponent[] = [
        {
          type: "command",
          name: "cmd1",
          description: "命令1",
          entry: "./cmd1.js",
          config: { slashCommand: "/cmd1" },
        },
        {
          type: "skill",
          name: "skill1",
          description: "技能1",
          config: { trigger: ["skill1"] },
        },
      ];

      const pluginInfo = createTestPlugin("multi-component-plugin", components);
      
      let eventFired = false;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "registered") {
          eventFired = true;
        }
      });

      await pluginManager.register(pluginInfo);
      expect(eventFired).toBe(true);
    });
  });

  describe("场景 9: 插件卸载", () => {
    it("应该能够卸载插件", async () => {
      const pluginInfo = createTestPlugin("unload-test");
      await pluginManager.register(pluginInfo);

      let eventFired = false;
      pluginManager.on("pluginEvent", (event: any) => {
        if (event.type === "unregistered") {
          eventFired = true;
        }
      });

      await pluginManager.unregister("unload-test");
      expect(eventFired).toBe(true);
    });

    it("卸载激活的插件应该先停用", async () => {
      const pluginInfo = createTestPlugin("unload-active");
      await pluginManager.register(pluginInfo);
      await pluginManager.activate("unload-active");

      const events: string[] = [];
      pluginManager.on("pluginEvent", (event: any) => {
        events.push(event.type);
      });

      await pluginManager.unregister("unload-active");
      expect(events).toContain("deactivated");
      expect(events).toContain("unregistered");
    });
  });

  describe("场景 10: 错误处理", () => {
    it("操作不存在的插件应该失败", async () => {
      await expect(pluginManager.activate("nonexistent")).rejects.toThrow();
      await expect(pluginManager.deactivate("nonexistent")).rejects.toThrow();
      await expect(pluginManager.enable("nonexistent")).rejects.toThrow();
      await expect(pluginManager.disable("nonexistent")).rejects.toThrow();
      await expect(pluginManager.reload("nonexistent")).rejects.toThrow();
    });

    it("应该能够处理无效的插件清单", async () => {
      const pluginPath = join(pluginDir, "invalid-plugin");
      await mkdir(pluginPath, { recursive: true });

      await writeFile(
        join(pluginPath, "plugin.json"),
        "invalid json"
      );

      const plugins = await pluginManager.discover(pluginDir);
      expect(plugins.length).toBe(0);
    });

    it("应该能够处理缺少清单文件的插件目录", async () => {
      const pluginPath = join(pluginDir, "no-manifest");
      await mkdir(pluginPath, { recursive: true });

      const plugins = await pluginManager.discover(pluginDir);
      expect(plugins.length).toBe(0);
    });
  });

  describe("场景 11: 插件生命周期", () => {
    it("应该能够完成完整的插件生命周期", async () => {
      const pluginInfo = createTestPlugin("lifecycle-test");
      
      const events: string[] = [];
      pluginManager.on("pluginEvent", (event: any) => {
        events.push(event.type);
      });

      await pluginManager.register(pluginInfo);
      expect(events).toContain("registered");

      await pluginManager.activate("lifecycle-test");
      expect(events).toContain("activated");

      await pluginManager.deactivate("lifecycle-test");
      expect(events).toContain("deactivated");

      await pluginManager.enable("lifecycle-test");
      expect(events).toContain("enabled");

      await pluginManager.disable("lifecycle-test");
      expect(events).toContain("disabled");

      await pluginManager.unregister("lifecycle-test");
      expect(events).toContain("unregistered");
    });
  });
});
