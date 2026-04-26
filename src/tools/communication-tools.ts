import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { createWriteTool } from "./tool-factory.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const SlackSendInputSchema = z.object({
  channel: z.string().min(1, "channel 不能为空"),
  message: z.string().min(1, "message 不能为空"),
  blocks: z.array(z.unknown()).optional(),
});

const DiscordSendInputSchema = z.object({
  webhookUrl: z.string().url().optional(),
  content: z.string().min(1, "content 不能为空"),
  embed: z.unknown().optional(),
});

const TelegramSendInputSchema = z.object({
  chatId: z.string().optional(),
  message: z.string().min(1, "message 不能为空"),
  parseMode: z.enum(["HTML", "Markdown", "MarkdownV2"]).optional(),
});

const EmailSendInputSchema = z.object({
  to: z.string().email("to 必须是有效的邮箱地址"),
  subject: z.string().min(1, "subject 不能为空"),
  body: z.string().min(1, "body 不能为空"),
  from: z.string().email().optional(),
});

const CommunicationOutputSchema = z.object({
  message: z.string(),
  success: z.boolean().optional(),
});

export interface CommunicationConfig {
  slackWebhookUrl?: string;
  slackToken?: string;
  discordWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export function createCommunicationTools(config: CommunicationConfig = {}): ToolDefinition[] {
  const slackSendTool = createWriteTool({
    name: "SlackSend",
    description: "Send a message to a Slack channel or user",
    inputSchema: SlackSendInputSchema,
    outputSchema: CommunicationOutputSchema,
    resourceKeys: ["channel"],
    handler: async (input) => {
      const webhookUrl = input.channel.startsWith("http") ? input.channel : config.slackWebhookUrl;

      if (!webhookUrl && !config.slackToken) {
        throw new Error("Slack webhook URL or token is required. Set SLACK_WEBHOOK_URL or provide in config.");
      }

      if (webhookUrl) {
        const payload = input.blocks
          ? JSON.stringify({ blocks: input.blocks })
          : JSON.stringify({ text: input.message });

        const command = `curl -s -X POST -H "Content-Type: application/json" -d '${payload.replace(/'/g, "'\\''")}' "${webhookUrl}"`;
        const { stdout } = await execAsync(command);

        if (stdout === "ok") {
          return { message: `Message sent to Slack channel: ${input.channel}`, success: true };
        }
        return { message: `Message sent to Slack. Response: ${stdout}`, success: true };
      }

      throw new Error("Slack token-based sending not yet implemented. Use webhook URL instead.");
    },
  });

  const discordSendTool = createWriteTool({
    name: "DiscordSend",
    description: "Send a message to a Discord channel via webhook",
    inputSchema: DiscordSendInputSchema,
    outputSchema: CommunicationOutputSchema,
    resourceKeys: ["webhookUrl"],
    handler: async (input) => {
      const webhookUrl = input.webhookUrl || config.discordWebhookUrl;

      if (!webhookUrl) {
        throw new Error("Discord webhook URL is required. Set DISCORD_WEBHOOK_URL or provide in input.");
      }

      const payload: any = { content: input.content };
      if (input.embed) {
        payload.embeds = [input.embed];
      }

      const command = `curl -s -X POST -H "Content-Type: application/json" -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}' "${webhookUrl}"`;
      await execAsync(command);

      return { message: `Message sent to Discord channel`, success: true };
    },
  });

  const telegramSendTool = createWriteTool({
    name: "TelegramSend",
    description: "Send a message to a Telegram chat",
    inputSchema: TelegramSendInputSchema,
    outputSchema: CommunicationOutputSchema,
    resourceKeys: ["chatId"],
    handler: async (input) => {
      const botToken = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
      const chatId = input.chatId || config.telegramChatId;

      if (!botToken || !chatId) {
        throw new Error("Telegram bot token and chat ID are required. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID or provide in config.");
      }

      const encodedMessage = encodeURIComponent(input.message);
      const url = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodedMessage}&parse_mode=${input.parseMode || "MarkdownV2"}`;

      const command = `curl -s "${url}"`;
      const { stdout } = await execAsync(command);
      const response = JSON.parse(stdout);

      if (response.ok) {
        return { message: `Message sent to Telegram chat: ${chatId}`, success: true };
      }
      throw new Error(response.description || "Unknown error");
    },
  });

  const emailSendTool = createWriteTool({
    name: "EmailSend",
    description: "Send an email (requires mailgun/sendgrid configuration)",
    inputSchema: EmailSendInputSchema,
    outputSchema: CommunicationOutputSchema,
    resourceKeys: ["to"],
    handler: async (input) => {
      const mailgunApiKey = process.env.MAILGUN_API_KEY;
      const mailgunDomain = process.env.MAILGUN_DOMAIN;
      const sender = input.from || `OpenFlow <noreply@${mailgunDomain}>`;

      if (!mailgunApiKey || !mailgunDomain) {
        throw new Error("Mailgun API key and domain are required. Set MAILGUN_API_KEY and MAILGUN_DOMAIN environment variables.");
      }

      const command = `curl -s --user "api:${mailgunApiKey}" https://api.mailgun.net/v3/${mailgunDomain}/messages -F from="${sender}" -F to="${input.to}" -F subject="${input.subject}" -F text="${input.body.replace(/"/g, '\\"')}"`;
      const { stdout } = await execAsync(command);
      const response = JSON.parse(stdout);

      if (response.id) {
        return { message: `Email sent to ${input.to}. Message ID: ${response.id}`, success: true };
      }
      throw new Error(response.message || "Unknown error");
    },
  });

  return [slackSendTool, discordSendTool, telegramSendTool, emailSendTool];
}
