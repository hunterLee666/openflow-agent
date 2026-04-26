import { CommandRegistry } from "./command-registry.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { GatewayConfig, PlatformConfig } from "../messaging/index.js";

const CONFIG_PATH = join(homedir(), ".openflow", "im-config.json");

interface IMPlatformConfig {
  enabled: boolean;
  [key: string]: any;
}

interface IMConfig {
  platforms: Record<string, IMPlatformConfig>;
}

export function createIMCommands(registry: CommandRegistry): void {
  registry.register({
    name: "im-setup",
    description: "配置 IM 平台连接凭证",
    handler: async (args: string) => {
      const parts = args.trim().split(/\s+/);
      const platform = parts[0]?.toLowerCase();
      const action = parts[1]?.toLowerCase();

      if (!platform) {
        return formatSetupHelp();
      }

      if (action === "enable") {
        return await enablePlatform(platform, parts.slice(2));
      }

      if (action === "disable") {
        return await disablePlatform(platform);
      }

      if (action === "show") {
        return await showPlatformConfig(platform);
      }

      return `用法: /im-setup <平台> <enable|disable|show> [参数...]\n${formatSetupHelp()}`;
    },
  });

  registry.register({
    name: "im-status",
    description: "查看所有 IM 平台连接状态",
    handler: async () => {
      return await showAllStatus();
    },
  });

  registry.register({
    name: "im-test",
    description: "测试 IM 平台连接",
    handler: async (args: string) => {
      const platform = args.trim().split(/\s+/)[0]?.toLowerCase();
      if (!platform) {
        return "用法: /im-test <平台>";
      }
      return await testConnection(platform);
    },
  });
}

async function loadConfig(): Promise<IMConfig> {
  try {
    const content = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return { platforms: {} };
  }
}

async function saveConfig(config: IMConfig): Promise<void> {
  await mkdir(join(homedir(), ".openflow"), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function formatSetupHelp(): string {
  return `
IM 平台配置指南

用法:
  /im-setup <平台> enable [参数...]  - 启用平台
  /im-setup <平台> disable           - 禁用平台
  /im-setup <平台> show              - 查看配置
  /im-status                         - 查看所有状态
  /im-test <平台>                    - 测试连接

支持的平台及所需参数:

  telegram:
    /im-setup telegram enable --token BOT_TOKEN [--users 用户ID1,用户ID2]

  slack:
    /im-setup slack enable --token xoxb-... --secret SIGNING_SECRET

  dingtalk:
    /im-setup dingtalk enable --appid APP_ID --secret APP_SECRET [--port 8080]

  feishu:
    /im-setup feishu enable --appid APP_ID --secret APP_SECRET [--port 8081]

  wecom:
    /im-setup wecom enable --appid CORP_ID --secret CORP_SECRET [--port 8082]

  whatsapp:
    /im-setup whatsapp enable --phone 手机号 [--path 认证路径]

  line:
    /im-setup line enable --token CHANNEL_TOKEN --secret CHANNEL_SECRET [--port 8083]

  wechat:
    /im-setup wechat enable --appid APP_ID --secret APP_SECRET [--port 8084]

示例:
  /im-setup telegram enable --token 123456:ABC-DEF
  /im-setup dingtalk enable --appid ding123 --secret abc456 --port 9000
  /im-setup slack enable --token xoxb-xxx --secret yyy
`.trim();
}

async function enablePlatform(platform: string, args: string[]): Promise<string> {
  const config = await loadConfig();
  const params = parseArgs(args);

  const platformConfig: IMPlatformConfig = { enabled: true };

  switch (platform) {
    case "telegram":
      if (!params.token) return "错误: Telegram 需要 --token 参数";
      platformConfig.token = params.token;
      if (params.users) platformConfig.allowedUsers = params.users.split(",");
      break;

    case "slack":
      if (!params.token || !params.secret) return "错误: Slack 需要 --token 和 --secret 参数";
      platformConfig.token = params.token;
      platformConfig.appSecret = params.secret;
      break;

    case "dingtalk":
      if (!params.appid || !params.secret) return "错误: 钉钉需要 --appid 和 --secret 参数";
      platformConfig.appId = params.appid;
      platformConfig.appSecret = params.secret;
      if (params.port) platformConfig.webhookPort = parseInt(params.port);
      break;

    case "feishu":
      if (!params.appid || !params.secret) return "错误: 飞书需要 --appid 和 --secret 参数";
      platformConfig.appId = params.appid;
      platformConfig.appSecret = params.secret;
      if (params.port) platformConfig.webhookPort = parseInt(params.port);
      break;

    case "wecom":
      if (!params.appid || !params.secret) return "错误: 企业微信需要 --appid 和 --secret 参数";
      platformConfig.appId = params.appid;
      platformConfig.appSecret = params.secret;
      if (params.port) platformConfig.webhookPort = parseInt(params.port);
      break;

    case "whatsapp":
      if (!params.phone) return "错误: WhatsApp 需要 --phone 参数";
      platformConfig.token = params.phone;
      if (params.path) platformConfig.metadata = { authPath: params.path };
      break;

    case "line":
      if (!params.token || !params.secret) return "错误: LINE 需要 --token 和 --secret 参数";
      platformConfig.token = params.token;
      platformConfig.secret = params.secret;
      if (params.port) platformConfig.webhookPort = parseInt(params.port);
      break;

    case "wechat":
      if (!params.appid || !params.secret) return "错误: 微信需要 --appid 和 --secret 参数";
      platformConfig.appId = params.appid;
      platformConfig.appSecret = params.secret;
      if (params.port) platformConfig.webhookPort = parseInt(params.port);
      break;

    default:
      return `错误: 不支持的平台 "${platform}"\n支持的平台: telegram, slack, dingtalk, feishu, wecom, whatsapp, line, wechat`;
  }

  config.platforms[platform] = platformConfig;
  await saveConfig(config);

  return `✅ ${platform} 已启用！\n请重启 OpenFlow 以应用配置。\n使用 /im-status 查看状态，/im-test ${platform} 测试连接。`;
}

async function disablePlatform(platform: string): Promise<string> {
  const config = await loadConfig();

  if (!config.platforms[platform]) {
    return `错误: ${platform} 未配置`;
  }

  config.platforms[platform].enabled = false;
  await saveConfig(config);

  return `✅ ${platform} 已禁用`;
}

async function showPlatformConfig(platform: string): Promise<string> {
  const config = await loadConfig();
  const platformConfig = config.platforms[platform];

  if (!platformConfig) {
    return `${platform} 未配置。使用 /im-setup ${platform} enable 进行配置。`;
  }

  const status = platformConfig.enabled ? "✅ 已启用" : "❌ 已禁用";
  const masked = maskSensitiveData(platformConfig);

  return `${platform} 配置:\n状态: ${status}\n${JSON.stringify(masked, null, 2)}`;
}

async function showAllStatus(): Promise<string> {
  const config = await loadConfig();
  const platforms = Object.keys(config.platforms);

  if (platforms.length === 0) {
    return "未配置任何 IM 平台。\n使用 /im-setup 开始配置。";
  }

  let output = "IM 平台状态:\n";
  for (const platform of platforms) {
    const p = config.platforms[platform];
    const status = p.enabled ? "✅" : "❌";
    output += `${status} ${platform}\n`;
  }

  output += "\n使用 /im-test <平台> 测试连接";
  return output;
}

async function testConnection(platform: string): Promise<string> {
  const config = await loadConfig();
  const platformConfig = config.platforms[platform];

  if (!platformConfig || !platformConfig.enabled) {
    return `错误: ${platform} 未启用。使用 /im-setup ${platform} enable 进行配置。`;
  }

  try {
    switch (platform) {
      case "telegram":
        await testTelegram(platformConfig.token);
        return `✅ Telegram 连接测试成功！`;

      case "slack":
        await testSlack(platformConfig.token);
        return `✅ Slack 连接测试成功！`;

      case "dingtalk":
        await testDingTalk(platformConfig.appId, platformConfig.appSecret);
        return `✅ 钉钉连接测试成功！`;

      case "feishu":
        await testFeishu(platformConfig.appId, platformConfig.appSecret);
        return `✅ 飞书连接测试成功！`;

      case "wecom":
        await testWeCorp(platformConfig.appId, platformConfig.appSecret);
        return `✅ 企业微信连接测试成功！`;

      case "line":
        await testLine(platformConfig.token);
        return `✅ LINE 连接测试成功！`;

      case "wechat":
        await testWeChat(platformConfig.appId, platformConfig.appSecret);
        return `✅ 微信连接测试成功！`;

      case "whatsapp":
        return `⏳ WhatsApp 需要扫码登录，请在启动后查看终端二维码。`;

      default:
        return `错误: 不支持的平台 "${platform}"`;
    }
  } catch (error) {
    return `❌ ${platform} 连接测试失败: ${(error as Error).message}`;
  }
}

async function testTelegram(token: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.description);
}

async function testSlack(token: string): Promise<void> {
  const response = await fetch("https://slack.com/api/auth.test", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
}

async function testDingTalk(appId: string, appSecret: string): Promise<void> {
  const response = await fetch("https://oapi.dingtalk.com/gettoken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appid: appId, appsecret: appSecret }),
  });
  const data = await response.json();
  if (data.errcode !== 0) throw new Error(data.errmsg);
}

async function testFeishu(appId: string, appSecret: string): Promise<void> {
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await response.json();
  if (data.code !== 0) throw new Error(data.msg);
}

async function testWeCorp(appId: string, appSecret: string): Promise<void> {
  const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${appId}&corpsecret=${appSecret}`);
  const data = await response.json();
  if (data.errcode !== 0) throw new Error(data.errmsg);
}

async function testLine(token: string): Promise<void> {
  const response = await fetch("https://api.line.me/v2/bot/info", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
}

async function testWeChat(appId: string, appSecret: string): Promise<void> {
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`);
  const data = await response.json();
  if (data.errcode) throw new Error(data.errmsg);
}

function parseArgs(args: string[]): Record<string, string> {
  const params: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        params[key] = value;
        i++;
      }
    }
  }
  return params;
}

function maskSensitiveData(config: IMPlatformConfig): Record<string, any> {
  const masked = { ...config };
  if (masked.token) masked.token = masked.token.slice(0, 4) + "..." + masked.token.slice(-4);
  if (masked.appSecret) masked.appSecret = "****";
  if (masked.secret) masked.secret = "****";
  return masked;
}

export function loadIMConfigFromFile(): GatewayConfig | undefined {
  const configPath = join(homedir(), ".openflow", "im-config.json");
  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config: IMConfig = JSON.parse(content);

    const adapters: PlatformConfig[] = [];
    for (const [platform, platformConfig] of Object.entries(config.platforms)) {
      if (!platformConfig.enabled) continue;

      const adapter: PlatformConfig = {
        platform: platform as any,
        enabled: true,
      };

      if (platformConfig.token) adapter.token = platformConfig.token;
      if (platformConfig.appId) adapter.appId = platformConfig.appId;
      if (platformConfig.appSecret) adapter.appSecret = platformConfig.appSecret;
      if (platformConfig.secret) adapter.secret = platformConfig.secret;
      if (platformConfig.webhookPort) adapter.webhookPort = platformConfig.webhookPort;
      if (platformConfig.allowedUsers) adapter.allowedUsers = platformConfig.allowedUsers;
      if (platformConfig.metadata) adapter.metadata = platformConfig.metadata;
      if (platformConfig.enableTypingIndicator) adapter.enableTypingIndicator = platformConfig.enableTypingIndicator;
      if (platformConfig.enableReadReceipt) adapter.enableReadReceipt = platformConfig.enableReadReceipt;

      adapters.push(adapter);
    }

    if (adapters.length === 0) {
      return undefined;
    }

    return {
      adapters,
      enableLogging: true,
    };
  } catch {
    return undefined;
  }
}
