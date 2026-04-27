import { spawn } from "node:child_process"

const args = process.argv.slice(2)
const isDev = args.includes("--dev") || args.includes("-d")
const apiKey =
  args.find((_, i) => args[i - 1] === "-k" || args[i - 1] === "--api-key") ||
  process.env.OPENAI_API_KEY ||
  process.env.ANTHROPIC_API_KEY ||
  ""
const port = args.find((_, i) => args[i - 1] === "--port") || "8765"
const provider =
  args.find((_, i) => args[i - 1] === "-p" || args[i - 1] === "--provider") || ""
const model =
  args.find((_, i) => args[i - 1] === "-m" || args[i - 1] === "--model") || ""
const baseURL =
  args.find((_, i) => args[i - 1] === "-b" || args[i - 1] === "--base-url") || ""

if (!apiKey) {
  console.error("错误: 未设置 API 密钥。请使用 -k 参数或设置 OPENAI_API_KEY / ANTHROPIC_API_KEY 环境变量")
  console.error("\n用法:")
  console.error("  bun run all                    # 启动前后端")
  console.error("  bun run all -k your-api-key    # 指定 API 密钥")
  console.error("  bun run all -p provider       # 指定供应商 (如 Bailian, openai, anthropic)")
  console.error("  bun run all -m model-name     # 指定模型")
  console.error("  bun run all -b base-url     # 指定 API 基础 URL")
  console.error("  bun run all --dev              # 开发模式（热重载）")
  console.error("  bun run all --port 9000        # 指定端口")
  process.exit(1)
}

const serverArgs = ["run", isDev ? "--watch" : "", "backend/main.tsx", "-k", apiKey, "--port", port].filter(Boolean)

if (provider) serverArgs.push("-p", provider)
if (model) serverArgs.push("-m", model)
if (baseURL) serverArgs.push("-b", baseURL)
const clientArgs = ["run", isDev ? "--watch" : "", "frontend/tui-v2/index.ts", `ws://localhost:${port}`, provider || "Bailian", model || "qwen2.5-vl-3b-instruct", baseURL || "https://dashscope.aliyuncs.com/compatible-mode/v1"].filter(Boolean)

const server = spawn("bun", serverArgs, {
  stdio: ["inherit", "pipe", "pipe"],
  cwd: process.cwd(),
})

let serverReady = false

server.stdout.on("data", (data) => {
  const output = data.toString()
  if (output.includes("服务器已就绪") || output.includes("WebSocket 服务已启动")) {
    serverReady = true
  }
})

server.stderr.on("data", (data) => {
  // 后端错误输出到 stderr，不干扰 TUI
})

server.on("close", (code) => {
  process.exit(code || 0)
})

server.on("error", (err) => {
  console.error("后端服务启动失败:", err)
  process.exit(1)
})

const startClient = () => {
  const client = spawn("bun", clientArgs, {
    stdio: ["inherit", "inherit", "inherit"],
    cwd: process.cwd(),
  })

  client.on("close", (code) => {
    server.kill()
    process.exit(code || 0)
  })

  client.on("error", (err) => {
    console.error("客户端启动失败:", err)
    server.kill()
    process.exit(1)
  })
}

const checkReady = setInterval(() => {
  if (serverReady) {
    clearInterval(checkReady)
    startClient()
  }
}, 100)

process.on("SIGINT", () => {
  server.kill()
  process.exit(0)
})

process.on("SIGTERM", () => {
  server.kill()
  process.exit(0)
})
