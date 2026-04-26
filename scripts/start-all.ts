import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const isDev = args.includes("--dev") || args.includes("-d");
const apiKey = args.find((_, i) => args[i - 1] === "-k" || args[i - 1] === "--api-key") || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "";
const port = args.find((_, i) => args[i - 1] === "--port") || "8765";

if (!apiKey) {
  console.error("错误: 未设置 API 密钥。请使用 -k 参数或设置 OPENAI_API_KEY / ANTHROPIC_API_KEY 环境变量");
  console.error("\n用法:");
  console.error("  bun run all                    # 启动前后端");
  console.error("  bun run all -k your-api-key    # 指定 API 密钥");
  console.error("  bun run all --dev              # 开发模式（热重载）");
  console.error("  bun run all --port 9000        # 指定端口");
  process.exit(1);
}

console.log("🚀 正在启动 OpenFlow 前后端服务...\n");

const serverArgs = ["run", isDev ? "--watch" : "", "backend/main.tsx", "-k", apiKey, "--port", port].filter(Boolean);
const clientArgs = ["run", isDev ? "--watch" : "", "frontend/tui/client-app.tsx"].filter(Boolean);

console.log("📡 启动后端服务...");
const server = spawn("bun", serverArgs, {
  stdio: ["inherit", "pipe", "pipe"],
  cwd: process.cwd(),
});

server.stdout.on("data", (data) => {
  const output = data.toString();
  process.stdout.write(`[后端] ${output}`);

  if (output.includes("服务器已就绪") || output.includes("WebSocket 服务已启动")) {
    console.log("\n🖥️  启动前端客户端...");

    const client = spawn("bun", clientArgs, {
      stdio: ["inherit", "inherit", "inherit"],
      cwd: process.cwd(),
    });

    client.on("close", (code) => {
      console.log(`\n客户端已退出 (代码: ${code})`);
      server.kill();
      process.exit(code || 0);
    });

    client.on("error", (err) => {
      console.error("客户端启动失败:", err);
      server.kill();
      process.exit(1);
    });
  }
});

server.stderr.on("data", (data) => {
  process.stderr.write(`[后端] ${data}`);
});

server.on("close", (code) => {
  console.log(`\n后端服务已退出 (代码: ${code})`);
  process.exit(code || 0);
});

server.on("error", (err) => {
  console.error("后端服务启动失败:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n👋 正在关闭所有服务...");
  server.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n👋 正在关闭所有服务...");
  server.kill();
  process.exit(0);
});
