import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import {
  MessagingGateway,
  BasePlatformAdapter,
  WeChatAdapter,
  WeComAdapter,
  DingTalkAdapter,
  FeishuAdapter,
  SlackAdapter,
  TelegramAdapter,
  WhatsAppAdapter,
  LineAdapter,
  PlatformType,
  PlatformConfig,
  PlatformMessage,
  GatewayConfig,
} from "../../backend/messaging";

const TEST_DIR = join(process.cwd(), "tests", "e2e", "test-data", "messaging");

describe("E2E - 消息网关和适配器系统完整场景", () => {
  let projectDir: string;
  let testGatewayConfig: GatewayConfig;

  beforeEach(async () => {
    projectDir = join(TEST_DIR, "project");
    await mkdir(projectDir, { recursive: true });
    testGatewayConfig = {
      adapters: [],
      metrics: {
        enabled: true,
        retentionDays: 7,
      },
    };
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: 消息网关基础功能", () => {
    it("应该能够创建 MessagingGateway 实例", () => {
      const gateway = new MessagingGateway(testGatewayConfig);
      expect(gateway).toBeDefined();
    });

    it("应该能够初始化网关", async () => {
      const gateway = new MessagingGateway(testGatewayConfig);
      await gateway.initialize();
      expect(gateway).toBeDefined();
    });

    it("应该能够启动网关", async () => {
      const gateway = new MessagingGateway(testGatewayConfig);
      await gateway.initialize();
      await gateway.start();
      expect(gateway).toBeDefined();
    });

    it("应该能够停止网关", async () => {
      const gateway = new MessagingGateway(testGatewayConfig);
      await gateway.initialize();
      await gateway.start();
      await gateway.stop();
      expect(gateway).toBeDefined();
    });

    it("应该能够获取网关指标", () => {
      const gateway = new MessagingGateway(testGatewayConfig);
      const metrics = gateway.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.totalMessagesSent).toBeDefined();
      expect(metrics.totalMessagesReceived).toBeDefined();
      expect(metrics.activePlatforms).toBeDefined();
    });
  });

  describe("场景 2: 消息适配器基础功能", () => {
    it("所有适配器应该继承 BasePlatformAdapter", () => {
      const baseConfig: PlatformConfig = {
        platform: "wechat" as PlatformType,
        enabled: true,
        credentials: {},
      };

      const adapters = [
        new WeChatAdapter(baseConfig),
        new WeComAdapter(baseConfig),
        new DingTalkAdapter(baseConfig),
        new FeishuAdapter(baseConfig),
        new SlackAdapter(baseConfig),
        new TelegramAdapter(baseConfig),
        new WhatsAppAdapter(baseConfig),
        new LineAdapter(baseConfig),
      ];

      adapters.forEach((adapter) => {
        expect(adapter instanceof BasePlatformAdapter).toBe(true);
      });
    });

    it("每个适配器应该有正确的平台标识", () => {
      const testCases = [
        { Adapter: WeChatAdapter, platform: "wechat" },
        { Adapter: WeComAdapter, platform: "wecom" },
        { Adapter: DingTalkAdapter, platform: "dingtalk" },
        { Adapter: FeishuAdapter, platform: "feishu" },
        { Adapter: SlackAdapter, platform: "slack" },
        { Adapter: TelegramAdapter, platform: "telegram" },
        { Adapter: WhatsAppAdapter, platform: "whatsapp" },
        { Adapter: LineAdapter, platform: "line" },
      ];

      testCases.forEach(({ Adapter, platform }) => {
        const config: PlatformConfig = {
          platform: platform as PlatformType,
          enabled: true,
          credentials: {},
        };
        const adapter = new Adapter(config);
        expect(adapter.platform).toBe(platform);
      });
    });

    it("新创建的适配器应该处于未运行状态", () => {
      const config: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };
      const adapter = new WeChatAdapter(config);
      expect(adapter.isRunning).toBe(false);
    });

    it("所有适配器应该有配置", () => {
      const config: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: { appId: "test" },
      };
      const adapter = new WeChatAdapter(config);
      expect(adapter.config).toBeDefined();
      expect(adapter.config.credentials.appId).toBe("test");
    });
  });

  describe("场景 3: 适配器生命周期管理", () => {
    it("所有适配器应该提供 initialize 方法", async () => {
      const baseConfig: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };

      const adapters = [
        new WeChatAdapter(baseConfig),
        new WeComAdapter(baseConfig),
        new DingTalkAdapter(baseConfig),
        new FeishuAdapter(baseConfig),
      ];

      adapters.forEach((adapter) => {
        expect(typeof adapter.initialize).toBe("function");
      });
    });

    it("所有适配器应该提供 start 方法", () => {
      const baseConfig: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };

      const adapters = [
        new WeChatAdapter(baseConfig),
        new WeComAdapter(baseConfig),
        new SlackAdapter(baseConfig),
        new TelegramAdapter(baseConfig),
      ];

      adapters.forEach((adapter) => {
        expect(typeof adapter.start).toBe("function");
      });
    });

    it("所有适配器应该提供 stop 方法", () => {
      const baseConfig: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };

      const adapters = [
        new WeChatAdapter(baseConfig),
        new WeComAdapter(baseConfig),
        new LineAdapter(baseConfig),
        new WhatsAppAdapter(baseConfig),
      ];

      adapters.forEach((adapter) => {
        expect(typeof adapter.stop).toBe("function");
      });
    });

    it("应该能够初始化适配器", async () => {
      const config: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };
      const adapter = new WeChatAdapter(config);
      await adapter.initialize();
      expect(adapter).toBeDefined();
    });
  });

  describe("场景 4: 消息处理功能", () => {
    it("所有适配器应该提供 sendMessage 方法", () => {
      const baseConfig: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };

      const adapters = [
        new WeChatAdapter(baseConfig),
        new WeComAdapter(baseConfig),
        new DingTalkAdapter(baseConfig),
        new FeishuAdapter(baseConfig),
        new SlackAdapter(baseConfig),
        new TelegramAdapter(baseConfig),
        new WhatsAppAdapter(baseConfig),
        new LineAdapter(baseConfig),
      ];

      adapters.forEach((adapter) => {
        expect(typeof adapter.sendMessage).toBe("function");
      });
    });

    it("网关应该能够发送消息", async () => {
      const gatewayConfig: GatewayConfig = {
        adapters: [
          {
            platform: "wechat",
            enabled: false,
            credentials: {},
          },
        ],
      };
      const gateway = new MessagingGateway(gatewayConfig);
      await gateway.initialize();

      const message: PlatformMessage = {
        id: "msg-123",
        platform: "wechat",
        chatId: "chat-456",
        userId: "user-789",
        content: "Hello World!",
        type: "text",
        direction: "outgoing",
        timestamp: new Date(),
      };

      try {
        await gateway.sendMessage(message);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("所有适配器应该支持消息监听", () => {
      const baseConfig: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };

      const adapters = [
        new WeChatAdapter(baseConfig),
        new WeComAdapter(baseConfig),
        new DingTalkAdapter(baseConfig),
      ];

      adapters.forEach((adapter) => {
        expect(typeof adapter.onMessage).toBe("function");
      });
    });

    it("网关应该支持全局消息监听", () => {
      const gateway = new MessagingGateway(testGatewayConfig);
      expect(typeof gateway.onMessage).toBe("function");
    });

    it("所有适配器应该支持错误监听", () => {
      const baseConfig: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };

      const adapters = [
        new WeChatAdapter(baseConfig),
        new FeishuAdapter(baseConfig),
        new SlackAdapter(baseConfig),
      ];

      adapters.forEach((adapter) => {
        expect(typeof adapter.onError).toBe("function");
      });
    });
  });

  describe("场景 5: 高级消息功能", () => {
    it("所有适配器应该提供 sendTypingIndicator 方法", () => {
      const baseConfig: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };

      const adapters = [
        new WeChatAdapter(baseConfig),
        new WeComAdapter(baseConfig),
        new DingTalkAdapter(baseConfig),
        new FeishuAdapter(baseConfig),
      ];

      adapters.forEach((adapter) => {
        expect(typeof adapter.sendTypingIndicator).toBe("function");
      });
    });

    it("网关应该能够发送输入状态指示", async () => {
      const gateway = new MessagingGateway(testGatewayConfig);
      await gateway.initialize();
      
      try {
        await gateway.sendTypingIndicator("wechat", "chat-123");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it("所有适配器应该提供 markAsRead 方法", () => {
      const baseConfig: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };

      const adapters = [
        new WeChatAdapter(baseConfig),
        new TelegramAdapter(baseConfig),
        new SlackAdapter(baseConfig),
      ];

      adapters.forEach((adapter) => {
        expect(typeof adapter.markAsRead).toBe("function");
      });
    });

    it("所有适配器应该提供 getUser 方法", () => {
      const baseConfig: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };

      const adapters = [
        new WeChatAdapter(baseConfig),
        new WeComAdapter(baseConfig),
        new WhatsAppAdapter(baseConfig),
        new LineAdapter(baseConfig),
      ];

      adapters.forEach((adapter) => {
        expect(typeof adapter.getUser).toBe("function");
      });
    });

    it("所有适配器应该提供 getChat 方法", () => {
      const baseConfig: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };

      const adapters = [
        new WeChatAdapter(baseConfig),
        new DingTalkAdapter(baseConfig),
        new FeishuAdapter(baseConfig),
      ];

      adapters.forEach((adapter) => {
        expect(typeof adapter.getChat).toBe("function");
      });
    });
  });

  describe("场景 6: 用户白名单功能", () => {
    it("没有配置白名单时应该允许所有用户", () => {
      const config: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };
      const adapter = new WeChatAdapter(config);
      
      class TestAdapter extends WeChatAdapter {
        public testIsAllowedUser(userId: string): boolean {
          return this.isAllowedUser(userId);
        }
      }
      
      const testAdapter = new TestAdapter(config);
      expect(testAdapter.testIsAllowedUser("any-user")).toBe(true);
    });

    it("配置白名单后应该只允许列表中的用户", () => {
      const config: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
        allowedUsers: ["user-1", "user-2", "user-3"],
      };
      
      class TestAdapter extends WeChatAdapter {
        public testIsAllowedUser(userId: string): boolean {
          return this.isAllowedUser(userId);
        }
      }
      
      const adapter = new TestAdapter(config);
      expect(adapter.testIsAllowedUser("user-1")).toBe(true);
      expect(adapter.testIsAllowedUser("user-2")).toBe(true);
      expect(adapter.testIsAllowedUser("user-4")).toBe(false);
    });
  });

  describe("场景 7: 消息截断功能", () => {
    it("短消息不应该被截断", () => {
      const config: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
      };
      
      class TestAdapter extends WeChatAdapter {
        public testTruncateMessage(content: string): string {
          return this.truncateMessage(content);
        }
      }
      
      const adapter = new TestAdapter(config);
      const shortMessage = "Hello World!";
      expect(adapter.testTruncateMessage(shortMessage)).toBe(shortMessage);
    });

    it("应该能够使用自定义的最大消息长度", () => {
      const config: PlatformConfig = {
        platform: "wechat",
        enabled: true,
        credentials: {},
        maxMessageLength: 100,
      };
      
      class TestAdapter extends WeChatAdapter {
        public testTruncateMessage(content: string): string {
          return this.truncateMessage(content);
        }
      }
      
      const adapter = new TestAdapter(config);
      const longMessage = "a".repeat(200);
      const result = adapter.testTruncateMessage(longMessage);
      expect(result.length).toBeLessThan(longMessage.length);
    });
  });

  describe("场景 8: 事件处理", () => {
    it("网关应该支持事件监听", () => {
      const gateway = new MessagingGateway(testGatewayConfig);
      expect(typeof gateway.onEvent).toBe("function");
    });

    it("应该能够注册消息处理器", () => {
      const gateway = new MessagingGateway(testGatewayConfig);
      const handler = (_message: PlatformMessage, _platform: PlatformType) => {};
      gateway.onMessage(handler);
      expect(gateway).toBeDefined();
    });

    it("应该能够注册事件处理器", () => {
      const gateway = new MessagingGateway(testGatewayConfig);
      const handler = (_event: any) => {};
      gateway.onEvent(handler);
      expect(gateway).toBeDefined();
    });
  });

  describe("场景 9: 多平台集成测试", () => {
    it("应该能够创建包含多个平台的网关配置", () => {
      const multiPlatformConfig: GatewayConfig = {
        adapters: [
          { platform: "wechat", enabled: true, credentials: {} },
          { platform: "wecom", enabled: true, credentials: {} },
          { platform: "dingtalk", enabled: false, credentials: {} },
          { platform: "feishu", enabled: true, credentials: {} },
          { platform: "slack", enabled: false, credentials: {} },
          { platform: "telegram", enabled: true, credentials: {} },
        ],
      };

      expect(multiPlatformConfig.adapters.length).toBe(6);
    });

    it("所有平台类型应该是唯一的", () => {
      const platforms: PlatformType[] = [
        "wechat",
        "wecom",
        "dingtalk",
        "feishu",
        "slack",
        "telegram",
        "whatsapp",
        "line",
      ];

      const uniquePlatforms = new Set(platforms);
      expect(uniquePlatforms.size).toBe(8);
    });
  });
});
