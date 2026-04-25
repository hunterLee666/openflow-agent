import type { ToolDefinition } from "../types/index.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface CommunicationConfig {
  slackWebhookUrl?: string;
  slackToken?: string;
  discordWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
}

export function createCommunicationTools(config: CommunicationConfig = {}): ToolDefinition[] {
  return [
    {
      name: "SlackSend",
      description: "Send a message to a Slack channel or user",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Slack channel (e.g., #general) or webhook URL" },
          message: { type: "string", description: "Message to send" },
          blocks: { type: "array", description: "Slack block kit blocks for rich formatting", items: { type: "object" } },
        },
        required: ["channel", "message"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { channel, message, blocks } = input as { channel: string; message: string; blocks?: any[] };

        const webhookUrl = channel.startsWith("http") ? channel : config.slackWebhookUrl;

        if (!webhookUrl && !config.slackToken) {
          return "Error: Slack webhook URL or token is required. Set SLACK_WEBHOOK_URL or provide in config.";
        }

        try {
          if (webhookUrl) {
            const payload = blocks
              ? JSON.stringify({ blocks })
              : JSON.stringify({ text: message });

            const command = `curl -s -X POST -H "Content-Type: application/json" -d '${payload.replace(/'/g, "'\\''")}' "${webhookUrl}"`;
            const { stdout } = await execAsync(command);

            if (stdout === "ok") {
              return `Message sent to Slack channel: ${channel}`;
            }
            return `Message sent to Slack. Response: ${stdout}`;
          }

          return "Slack token-based sending not yet implemented. Use webhook URL instead.";
        } catch (error) {
          return `Failed to send Slack message: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "DiscordSend",
      description: "Send a message to a Discord channel via webhook",
      inputSchema: {
        type: "object",
        properties: {
          webhookUrl: { type: "string", description: "Discord webhook URL" },
          content: { type: "string", description: "Message content" },
          embed: { type: "object", description: "Discord embed object for rich formatting" },
        },
        required: ["content"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { webhookUrl: inputWebhookUrl, content, embed } = input as { webhookUrl?: string; content: string; embed?: any };

        const webhookUrl = inputWebhookUrl || config.discordWebhookUrl;

        if (!webhookUrl) {
          return "Error: Discord webhook URL is required. Set DISCORD_WEBHOOK_URL or provide in input.";
        }

        try {
          const payload: any = { content };
          if (embed) {
            payload.embeds = [embed];
          }

          const command = `curl -s -X POST -H "Content-Type: application/json" -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}' "${webhookUrl}"`;
          await execAsync(command);

          return `Message sent to Discord channel`;
        } catch (error) {
          return `Failed to send Discord message: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "TelegramSend",
      description: "Send a message to a Telegram chat",
      inputSchema: {
        type: "object",
        properties: {
          chatId: { type: "string", description: "Telegram chat ID" },
          message: { type: "string", description: "Message to send" },
          parseMode: { type: "string", description: "Message parsing mode: HTML, Markdown, MarkdownV2", enum: ["HTML", "Markdown", "MarkdownV2"] },
        },
        required: ["message"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { chatId: inputChatId, message, parseMode = "MarkdownV2" } = input as { chatId?: string; message: string; parseMode?: string };

        const botToken = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
        const chatId = inputChatId || config.telegramChatId;

        if (!botToken || !chatId) {
          return "Error: Telegram bot token and chat ID are required. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID or provide in config.";
        }

        try {
          const encodedMessage = encodeURIComponent(message);
          const url = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodedMessage}&parse_mode=${parseMode}`;

          const command = `curl -s "${url}"`;
          const { stdout } = await execAsync(command);
          const response = JSON.parse(stdout);

          if (response.ok) {
            return `Message sent to Telegram chat: ${chatId}`;
          }
          return `Failed to send Telegram message: ${response.description || "Unknown error"}`;
        } catch (error) {
          return `Failed to send Telegram message: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "EmailSend",
      description: "Send an email (requires mailgun/sendgrid configuration)",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body (HTML or plain text)" },
          from: { type: "string", description: "Sender email address (optional)" },
        },
        required: ["to", "subject", "body"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { to, subject, body, from } = input as { to: string; subject: string; body: string; from?: string };

        const mailgunApiKey = process.env.MAILGUN_API_KEY;
        const mailgunDomain = process.env.MAILGUN_DOMAIN;
        const sender = from || `OpenFlow <noreply@${mailgunDomain}>`;

        if (!mailgunApiKey || !mailgunDomain) {
          return "Error: Mailgun API key and domain are required. Set MAILGUN_API_KEY and MAILGUN_DOMAIN environment variables.";
        }

        try {
          const command = `curl -s --user "api:${mailgunApiKey}" https://api.mailgun.net/v3/${mailgunDomain}/messages -F from="${sender}" -F to="${to}" -F subject="${subject}" -F text="${body.replace(/"/g, '\\"')}"`;
          const { stdout } = await execAsync(command);
          const response = JSON.parse(stdout);

          if (response.id) {
            return `Email sent to ${to}. Message ID: ${response.id}`;
          }
          return `Failed to send email: ${response.message || "Unknown error"}`;
        } catch (error) {
          return `Failed to send email: ${(error as Error).message}`;
        }
      },
    },
  ];
}
