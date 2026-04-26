import { z } from "zod";
import type { ToolDefinition } from "../types/index.js";
import { defineTool, createReadOnlyTool, createWriteTool } from "./tool-factory.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile, stat, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";

const execAsync = promisify(exec);

const BrowserNavigateInputSchema = z.object({
  url: z.string().url("url 必须是有效的 URL"),
});

const BrowserScreenshotInputSchema = z.object({
  url: z.string().url().optional(),
  fullPage: z.boolean().optional(),
});

const BrowserClickInputSchema = z.object({
  url: z.string().url("url 必须是有效的 URL"),
  selector: z.string().min(1, "selector 不能为空"),
});

const BrowserFillInputSchema = z.object({
  url: z.string().url("url 必须是有效的 URL"),
  selector: z.string().min(1, "selector 不能为空"),
  value: z.string(),
});

const BrowserEvaluateInputSchema = z.object({
  url: z.string().url("url 必须是有效的 URL"),
  script: z.string().min(1, "script 不能为空"),
});

const BrowserGetContentInputSchema = z.object({
  url: z.string().url("url 必须是有效的 URL"),
});

const BrowserStateOutputSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  screenshotPath: z.string().optional(),
  error: z.string().optional(),
  message: z.string(),
});

const BrowserActionResultSchema = z.object({
  message: z.string(),
  success: z.boolean(),
  details: z.record(z.unknown()).optional(),
});

export interface BrowserConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeout?: number;
  screenshotDir?: string;
  maxScreenshots?: number;
}

export interface BrowserState {
  url: string;
  title?: string;
  screenshotPath?: string;
  error?: string;
}

const DEFAULT_CONFIG: Required<BrowserConfig> = {
  headless: true,
  viewport: { width: 1280, height: 720 },
  timeout: 30000,
  screenshotDir: process.env.HOME ? `${process.env.HOME}/.openflow/screenshots` : ".openflow/screenshots",
  maxScreenshots: 10,
};

async function cleanupOldScreenshots(screenshotDir: string, maxScreenshots: number): Promise<void> {
  try {
    const files = await readdir(screenshotDir);
    const screenshots = files.filter((f) => f.endsWith(".png")).sort();

    if (screenshots.length > maxScreenshots) {
      const toDelete = screenshots.slice(0, screenshots.length - maxScreenshots);
      await Promise.all(toDelete.map((f) => unlink(join(screenshotDir, f))));
    }
  } catch {
    // Ignore cleanup errors
  }
}

async function cleanupTempScript(scriptPath: string): Promise<void> {
  try {
    await unlink(scriptPath);
  } catch {
    // Ignore cleanup errors
  }
}

export function createBrowserTools(config: BrowserConfig = {}): ToolDefinition[] {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  let currentState: BrowserState | null = null;

  const browserNavigateTool = defineTool({
    name: "BrowserNavigate",
    description: "Navigate to a URL in the browser",
    inputSchema: BrowserNavigateInputSchema,
    outputSchema: BrowserStateOutputSchema,
    isReadOnly: true,
    isConcurrencySafe: false,
    resourceKeys: ["url"],
    handler: async (input) => {
      await mkdir(mergedConfig.screenshotDir, { recursive: true });

      const screenshotPath = join(mergedConfig.screenshotDir, `screenshot-${Date.now()}.png`);

      const command = `npx playwright screenshot --viewport-size="${mergedConfig.viewport.width},${mergedConfig.viewport.height}" ${mergedConfig.headless ? "--full-page" : ""} "${input.url}" "${screenshotPath}"`;

      await execAsync(command, { timeout: mergedConfig.timeout });

      await cleanupOldScreenshots(mergedConfig.screenshotDir, mergedConfig.maxScreenshots);

      currentState = {
        url: input.url,
        screenshotPath,
      };

      return {
        url: input.url,
        screenshotPath,
        message: `Navigated to ${input.url}\nScreenshot saved to: ${screenshotPath}`,
      };
    },
  });

  const browserScreenshotTool = defineTool({
    name: "BrowserScreenshot",
    description: "Take a screenshot of the current page or a specific URL",
    inputSchema: BrowserScreenshotInputSchema,
    outputSchema: BrowserStateOutputSchema,
    isReadOnly: true,
    isConcurrencySafe: true,
    resourceKeys: ["url"],
    handler: async (input) => {
      const targetUrl = input.url || currentState?.url;

      if (!targetUrl) {
        throw new Error("No URL provided and no current page. Use BrowserNavigate first.");
      }

      await mkdir(mergedConfig.screenshotDir, { recursive: true });

      const screenshotPath = join(mergedConfig.screenshotDir, `screenshot-${Date.now()}.png`);

      const command = `npx playwright screenshot ${input.fullPage !== false ? "--full-page" : ""} --viewport-size="${mergedConfig.viewport.width},${mergedConfig.viewport.height}" "${targetUrl}" "${screenshotPath}"`;

      await execAsync(command, { timeout: mergedConfig.timeout });

      await cleanupOldScreenshots(mergedConfig.screenshotDir, mergedConfig.maxScreenshots);

      if (currentState) {
        currentState.screenshotPath = screenshotPath;
      }

      return {
        url: targetUrl,
        screenshotPath,
        message: `Screenshot saved to: ${screenshotPath}`,
      };
    },
  });

  const browserClickTool = createWriteTool({
    name: "BrowserClick",
    description: "Click an element on the page by selector",
    inputSchema: BrowserClickInputSchema,
    outputSchema: BrowserActionResultSchema,
    resourceKeys: ["url"],
    handler: async (input) => {
      const script = `
        const { chromium } = require('playwright');
        (async () => {
          const browser = await chromium.launch({ headless: ${mergedConfig.headless} });
          const page = await browser.newPage({ viewport: ${JSON.stringify(mergedConfig.viewport)} });
          await page.goto('${input.url}');
          await page.click('${input.selector}');
          await page.waitForTimeout(1000);
          await browser.close();
        })();
      `;

      const scriptPath = join(process.env.HOME || process.cwd(), ".openflow", "temp-browser-script.js");
      await mkdir(join(process.env.HOME || process.cwd(), ".openflow"), { recursive: true });
      await writeFile(scriptPath, script);

      try {
        await execAsync(`node "${scriptPath}"`, { timeout: mergedConfig.timeout });
        return {
          message: `Clicked element '${input.selector}' on ${input.url}`,
          success: true,
        };
      } finally {
        await cleanupTempScript(scriptPath);
      }
    },
  });

  const browserFillTool = createWriteTool({
    name: "BrowserFill",
    description: "Fill a form field on the page",
    inputSchema: BrowserFillInputSchema,
    outputSchema: BrowserActionResultSchema,
    resourceKeys: ["url"],
    handler: async (input) => {
      const script = `
        const { chromium } = require('playwright');
        (async () => {
          const browser = await chromium.launch({ headless: ${mergedConfig.headless} });
          const page = await browser.newPage({ viewport: ${JSON.stringify(mergedConfig.viewport)} });
          await page.goto('${input.url}');
          await page.fill('${input.selector}', '${input.value.replace(/'/g, "\\'")}');
          await browser.close();
        })();
      `;

      const scriptPath = join(process.env.HOME || process.cwd(), ".openflow", "temp-browser-script.js");
      await mkdir(join(process.env.HOME || process.cwd(), ".openflow"), { recursive: true });
      await writeFile(scriptPath, script);

      try {
        await execAsync(`node "${scriptPath}"`, { timeout: mergedConfig.timeout });
        return {
          message: `Filled '${input.selector}' with value on ${input.url}`,
          success: true,
        };
      } finally {
        await cleanupTempScript(scriptPath);
      }
    },
  });

  const browserEvaluateTool = createWriteTool({
    name: "BrowserEvaluate",
    description: "Execute JavaScript in the browser and return the result",
    inputSchema: BrowserEvaluateInputSchema,
    outputSchema: BrowserActionResultSchema,
    resourceKeys: ["url"],
    handler: async (input) => {
      const tempScript = `
        const { chromium } = require('playwright');
        (async () => {
          const browser = await chromium.launch({ headless: ${mergedConfig.headless} });
          const page = await browser.newPage({ viewport: ${JSON.stringify(mergedConfig.viewport)} });
          await page.goto('${input.url}');
          const result = await page.evaluate(() => ${input.script});
          console.log(JSON.stringify(result));
          await browser.close();
        })();
      `;

      const scriptPath = join(process.env.HOME || process.cwd(), ".openflow", "temp-browser-script.js");
      await mkdir(join(process.env.HOME || process.cwd(), ".openflow"), { recursive: true });
      await writeFile(scriptPath, tempScript);

      try {
        const { stdout } = await execAsync(`node "${scriptPath}"`, { timeout: mergedConfig.timeout });
        return {
          message: `Script executed successfully.\nResult: ${stdout}`,
          success: true,
        };
      } finally {
        await cleanupTempScript(scriptPath);
      }
    },
  });

  const browserGetContentTool = createReadOnlyTool({
    name: "BrowserGetContent",
    description: "Get the text content of the current page",
    inputSchema: BrowserGetContentInputSchema,
    outputSchema: BrowserStateOutputSchema,
    resourceKeys: ["url"],
    handler: async (input) => {
      const script = `
        const { chromium } = require('playwright');
        (async () => {
          const browser = await chromium.launch({ headless: ${mergedConfig.headless} });
          const page = await browser.newPage({ viewport: ${JSON.stringify(mergedConfig.viewport)} });
          await page.goto('${input.url}');
          const content = await page.innerText('body');
          console.log(content);
          await browser.close();
        })();
      `;

      const scriptPath = join(process.env.HOME || process.cwd(), ".openflow", "temp-browser-script.js");
      await mkdir(join(process.env.HOME || process.cwd(), ".openflow"), { recursive: true });
      await writeFile(scriptPath, script);

      try {
        const { stdout } = await execAsync(`node "${scriptPath}"`, { timeout: mergedConfig.timeout });

        currentState = { url: input.url };

        return {
          url: input.url,
          message: `Page content from ${input.url}:\n\n${stdout.slice(0, 5000)}${stdout.length > 5000 ? "\n...(truncated)" : ""}`,
        };
      } finally {
        await cleanupTempScript(scriptPath);
      }
    },
  });

  return [browserNavigateTool, browserScreenshotTool, browserClickTool, browserFillTool, browserEvaluateTool, browserGetContentTool];
}
