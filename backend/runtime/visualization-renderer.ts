import { createServer, Server } from "node:http";
import { readFile, stat, access } from "node:fs/promises";
import { join, resolve, extname, dirname } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";

const execAsync = promisify(exec);

export enum OutputType {
  HTML = "html",
  CHART = "chart",
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
  ANIMATION = "animation",
  PDF = "pdf",
  MARKDOWN = "markdown",
}

export enum DisplayMode {
  BROWSER = "browser",
  SYSTEM_APP = "system_app",
  INLINE = "inline",
  FILE = "file",
}

export interface VisualizationOutput {
  id: string;
  type: OutputType;
  content: string;
  displayMode: DisplayMode;
  title?: string;
  metadata?: Record<string, unknown>;
  files?: string[];
}

export interface LocalServerConfig {
  port: number;
  basePath: string;
  autoOpen: boolean;
  browser?: string;
}

const DEFAULT_MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export class VisualizationRenderer extends EventEmitter {
  private server: Server | null = null;
  private port: number;
  private basePath: string;
  private outputDir: string;
  private outputs: Map<string, VisualizationOutput> = new Map();
  private fileServer: Map<string, string> = new Map();
  private autoOpen: boolean;
  private browser?: string;

  constructor(options?: {
    port?: number;
    basePath?: string;
    outputDir?: string;
    autoOpen?: boolean;
    browser?: string;
  }) {
    super();
    this.port = options?.port || 0;
    this.basePath = options?.basePath || process.cwd();
    this.outputDir = options?.outputDir || join(this.basePath, ".openflow", "output");
    this.autoOpen = options?.autoOpen ?? true;
    this.browser = options?.browser;
  }

  async initialize(): Promise<void> {
    try {
      await access(this.outputDir);
    } catch {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(this.outputDir, { recursive: true });
    }
  }

  async renderHTML(htmlContent: string, options?: { title?: string; filename?: string }): Promise<VisualizationOutput> {
    const id = `html_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filename = options?.filename || `${id}.html`;
    const filePath = join(this.outputDir, filename);

    const fullHTML = this.ensureFullHTML(htmlContent, options?.title);

    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, fullHTML, "utf-8");

    const output: VisualizationOutput = {
      id,
      type: OutputType.HTML,
      content: fullHTML,
      displayMode: DisplayMode.BROWSER,
      title: options?.title,
      files: [filePath],
    };

    this.outputs.set(id, output);
    this.fileServer.set(id, filePath);

    this.emit("output:ready", output);

    return output;
  }

  async renderChart(chartConfig: {
    title: string;
    goal: "trend" | "compare" | "composition" | "distribution" | "ranking" | "correlation";
    data: Array<Record<string, string | number | boolean | null>>;
    fields: {
      x: string;
      y: string | string[];
      series?: string;
      category?: string;
    };
    chartType?: "line" | "bar" | "stacked_bar" | "pie" | "donut" | "scatter" | "area" | "table";
    theme?: "light" | "dark";
    width?: number;
    height?: number;
    animation?: boolean;
  }): Promise<VisualizationOutput> {
    const id = `chart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filename = `${id}.html`;
    const filePath = join(this.outputDir, filename);

    const htmlContent = this.generateEChartsHTML(chartConfig);

    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, htmlContent, "utf-8");

    const output: VisualizationOutput = {
      id,
      type: OutputType.CHART,
      content: htmlContent,
      displayMode: DisplayMode.BROWSER,
      title: chartConfig.title,
      metadata: {
        chartType: chartConfig.chartType,
        goal: chartConfig.goal,
        dataPoints: chartConfig.data.length,
      },
      files: [filePath],
    };

    this.outputs.set(id, output);
    this.fileServer.set(id, filePath);

    this.emit("output:ready", output);

    return output;
  }

  async renderAnimation(animationConfig: {
    title: string;
    type: "css" | "lottie" | "canvas";
    content: string;
    width?: number;
    height?: number;
  }): Promise<VisualizationOutput> {
    const id = `anim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filename = `${id}.html`;
    const filePath = join(this.outputDir, filename);

    let htmlContent: string;

    switch (animationConfig.type) {
      case "css":
        htmlContent = this.generateCSSAnimationHTML(animationConfig);
        break;
      case "lottie":
        htmlContent = this.generateLottieHTML(animationConfig);
        break;
      case "canvas":
        htmlContent = this.generateCanvasAnimationHTML(animationConfig);
        break;
      default:
        htmlContent = animationConfig.content;
    }

    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, htmlContent, "utf-8");

    const output: VisualizationOutput = {
      id,
      type: OutputType.ANIMATION,
      content: htmlContent,
      displayMode: DisplayMode.BROWSER,
      title: animationConfig.title,
      metadata: {
        animationType: animationConfig.type,
      },
      files: [filePath],
    };

    this.outputs.set(id, output);
    this.fileServer.set(id, filePath);

    this.emit("output:ready", output);

    return output;
  }

  async renderMedia(filePath: string): Promise<VisualizationOutput> {
    const absolutePath = resolve(this.basePath, filePath);
    await access(absolutePath);

    const ext = extname(absolutePath).toLowerCase();
    let type: OutputType;
    let displayMode: DisplayMode;

    switch (ext) {
      case ".png":
      case ".jpg":
      case ".jpeg":
      case ".gif":
      case ".svg":
      case ".webp":
        type = OutputType.IMAGE;
        displayMode = DisplayMode.SYSTEM_APP;
        break;
      case ".mp4":
      case ".webm":
      case ".mov":
      case ".avi":
        type = OutputType.VIDEO;
        displayMode = DisplayMode.SYSTEM_APP;
        break;
      case ".mp3":
      case ".wav":
      case ".ogg":
      case ".flac":
        type = OutputType.AUDIO;
        displayMode = DisplayMode.SYSTEM_APP;
        break;
      case ".pdf":
        type = OutputType.PDF;
        displayMode = DisplayMode.SYSTEM_APP;
        break;
      default:
        type = OutputType.HTML;
        displayMode = DisplayMode.FILE;
    }

    const id = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const output: VisualizationOutput = {
      id,
      type,
      content: absolutePath,
      displayMode,
      title: filePath.split("/").pop(),
      files: [absolutePath],
    };

    this.outputs.set(id, output);

    this.emit("output:ready", output);

    return output;
  }

  async startServer(config?: Partial<LocalServerConfig>): Promise<string> {
    if (this.server) {
      return this.getServerUrl();
    }

    const serverConfig: LocalServerConfig = {
      port: config?.port || this.port || 0,
      basePath: config?.basePath || this.basePath,
      autoOpen: config?.autoOpen ?? this.autoOpen,
      browser: config?.browser || this.browser,
    };

    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        try {
          const urlPath = req.url?.split("?")[0] || "/";
          const filePath = urlPath === "/" ? "index.html" : urlPath.slice(1);
          const fullPath = join(this.outputDir, filePath);

          await access(fullPath);
          const fileStat = await stat(fullPath);

          if (fileStat.isDirectory()) {
            const indexFile = join(fullPath, "index.html");
            await access(indexFile);
            const content = await readFile(indexFile, "utf-8");
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(content);
            return;
          }

          const ext = extname(fullPath).toLowerCase();
          const mimeType = DEFAULT_MIME_TYPES[ext] || "application/octet-stream";

          const content = await readFile(fullPath);
          res.writeHead(200, {
            "Content-Type": mimeType,
            "Content-Length": content.length,
            "Cache-Control": "no-cache",
          });
          res.end(content);
        } catch (error) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        }
      });

      this.server.listen(serverConfig.port, "127.0.0.1", () => {
        const address = this.server!.address();
        if (typeof address === "object" && address) {
          this.port = address.port;
        }

        const url = this.getServerUrl();
        this.emit("server:start", { url, port: this.port });

        if (serverConfig.autoOpen) {
          this.openInBrowser(url, serverConfig.browser);
        }

        resolve(url);
      });

      this.server.on("error", reject);
    });
  }

  async stopServer(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          this.server = null;
          this.emit("server:stop");
          resolve();
        });
      });
    }
  }

  async openInBrowser(url: string, browser?: string): Promise<void> {
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      const command = browser ? `${browser} "${url}"` : `open "${url}"`;
      await execAsync(command);
      this.emit("browser:open", { url });
    } catch (error) {
      await this.fallbackOpen(url);
    }
  }

  async openFile(filePath: string): Promise<void> {
    const absolutePath = resolve(this.basePath, filePath);
    await access(absolutePath);

    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      await execAsync(`open "${absolutePath}"`);
      this.emit("file:open", { path: absolutePath });
    } catch (error) {
      await this.fallbackOpen(absolutePath);
    }
  }

  getOutput(id: string): VisualizationOutput | undefined {
    return this.outputs.get(id);
  }

  getAllOutputs(): VisualizationOutput[] {
    return Array.from(this.outputs.values());
  }

  getServerUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  getFileUrl(filename: string): string {
    return `${this.getServerUrl()}/${filename}`;
  }

  private ensureFullHTML(content: string, title?: string): string {
    if (content.includes("<!DOCTYPE html>") || content.includes("<html")) {
      return content;
    }

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || "OpenFlow Visualization"}</title>
  <style>
    body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
${content}
</body>
</html>`;
  }

  private generateEChartsHTML(config: {
    title: string;
    goal: string;
    data: Array<Record<string, string | number | boolean | null>>;
    fields: { x: string; y: string | string[]; series?: string; category?: string };
    chartType?: string;
    theme?: string;
    width?: number;
    height?: number;
    animation?: boolean;
  }): string {
    const chartType = config.chartType || this.recommendChartType(config.goal);
    const theme = config.theme || "light";
    const width = config.width || 800;
    const height = config.height || 500;
    const animation = config.animation !== false;

    const series = this.buildEChartsSeries(chartType, config.data, config.fields);

    const option = {
      title: { text: config.title, left: "center" },
      tooltip: { trigger: "axis" },
      legend: { bottom: 0 },
      grid: { left: "3%", right: "4%", bottom: "10%", containLabel: true },
      xAxis: this.buildXAxis(chartType, config.data, config.fields),
      yAxis: this.buildYAxis(chartType),
      series,
      animation,
    };

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
  <style>
    body { margin: 0; padding: 20px; background: ${theme === "dark" ? "#1a1a1a" : "#f5f5f5"}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #chart { width: ${width}px; height: ${height}px; margin: 0 auto; background: ${theme === "dark" ? "#2d2d2d" : "#fff"}; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div id="chart"></div>
  <script>
    const chart = echarts.init(document.getElementById('chart'), '${theme}');
    const option = ${JSON.stringify(option)};
    chart.setOption(option);
    window.addEventListener('resize', () => chart.resize());
  </script>
</body>
</html>`;
  }

  private recommendChartType(goal: string): string {
    const recommendations: Record<string, string> = {
      trend: "line",
      compare: "bar",
      composition: "pie",
      distribution: "scatter",
      ranking: "bar",
      correlation: "scatter",
    };
    return recommendations[goal] || "bar";
  }

  private buildEChartsSeries(
    chartType: string,
    data: Array<Record<string, string | number | boolean | null>>,
    fields: { x: string; y: string | string[]; series?: string; category?: string }
  ): Array<Record<string, unknown>> {
    const yFields = Array.isArray(fields.y) ? fields.y : [fields.y];

    if (chartType === "pie" || chartType === "donut") {
      return [{
        type: "pie",
        radius: chartType === "donut" ? ["40%", "70%"] : "70%",
        data: data.map((item) => ({
          name: String(item[fields.x]),
          value: Number(item[yFields[0]]),
        })),
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0, 0, 0, 0.5)" } },
      }];
    }

    return yFields.map((yField, index) => {
      const base: Record<string, unknown> = {
        name: yField,
        type: chartType === "stacked_bar" ? "bar" : chartType === "area" ? "line" : chartType,
        data: data.map((item) => Number(item[yField])),
      };

      if (chartType === "stacked_bar") {
        base.stack = "total";
      }

      if (chartType === "area") {
        base.areaStyle = { opacity: 0.3 };
      }

      return base;
    });
  }

  private buildXAxis(
    chartType: string,
    data: Array<Record<string, string | number | boolean | null>>,
    fields: { x: string }
  ): Record<string, unknown> {
    if (chartType === "pie" || chartType === "donut" || chartType === "scatter") {
      return {};
    }

    return {
      type: "category",
      data: data.map((item) => String(item[fields.x])),
      axisTick: { alignWithLabel: true },
    };
  }

  private buildYAxis(chartType: string): Record<string, unknown> {
    if (chartType === "pie" || chartType === "donut") {
      return {};
    }

    return { type: "value" };
  }

  private generateCSSAnimationHTML(config: { title: string; content: string }): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title}</title>
  <style>
    body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #0a0a0a; }
    .container { text-align: center; }
    ${config.content}
  </style>
</head>
<body>
  <div class="container">
    <div class="animated-element"></div>
  </div>
</body>
</html>`;
  }

  private generateLottieHTML(config: { title: string; content: string }): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title}</title>
  <script src="https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js"></script>
  <style>
    body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #0a0a0a; }
    #lottie-container { width: 800px; height: 600px; }
  </style>
</head>
<body>
  <div id="lottie-container"></div>
  <script>
    lottie.loadAnimation({
      container: document.getElementById('lottie-container'),
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: ${JSON.stringify(config.content)}
    });
  </script>
</body>
</html>`;
  }

  private generateCanvasAnimationHTML(config: { title: string; content: string }): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title}</title>
  <style>
    body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #0a0a0a; }
    canvas { border-radius: 8px; }
  </style>
</head>
<body>
  <canvas id="canvas" width="800" height="600"></canvas>
  <script>
    ${config.content}
  </script>
</body>
</html>`;
  }

  private async fallbackOpen(url: string): Promise<void> {
    const platform = process.platform;
    let command: string;

    switch (platform) {
      case "darwin":
        command = `open "${url}"`;
        break;
      case "win32":
        command = `start "" "${url}"`;
        break;
      default:
        command = `xdg-open "${url}"`;
        break;
    }

    try {
      await execAsync(command);
    } catch (error) {
      this.emit("browser:error", { url, error });
    }
  }
}
