import type { ToolDefinition } from "../types/index.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile, stat, unlink, readdir } from "node:fs/promises";
import { join } from "node:path";

const execAsync = promisify(exec);

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

  return [
    {
      name: "BrowserNavigate",
      description: "Navigate to a URL in the browser",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to navigate to" },
        },
        required: ["url"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { url } = input as { url: string };

        try {
          await mkdir(mergedConfig.screenshotDir, { recursive: true });

          const screenshotPath = join(mergedConfig.screenshotDir, `screenshot-${Date.now()}.png`);

          const command = `npx playwright screenshot --viewport-size="${mergedConfig.viewport.width},${mergedConfig.viewport.height}" ${mergedConfig.headless ? "--full-page" : ""} "${url}" "${screenshotPath}"`;

          await execAsync(command, { timeout: mergedConfig.timeout });

          await cleanupOldScreenshots(mergedConfig.screenshotDir, mergedConfig.maxScreenshots);

          currentState = {
            url,
            screenshotPath,
          };

          return `Navigated to ${url}\nScreenshot saved to: ${screenshotPath}`;
        } catch (error) {
          currentState = {
            url,
            error: (error as Error).message,
          };
          return `Failed to navigate to ${url}: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "BrowserScreenshot",
      description: "Take a screenshot of the current page or a specific URL",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to screenshot (optional, uses current page if not provided)" },
          fullPage: { type: "boolean", description: "Capture full page (default: true)" },
        },
        required: [],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { url, fullPage = true } = input as { url?: string; fullPage?: boolean };
        const targetUrl = url || currentState?.url;

        if (!targetUrl) {
          return "No URL provided and no current page. Use BrowserNavigate first.";
        }

        try {
          await mkdir(mergedConfig.screenshotDir, { recursive: true });

          const screenshotPath = join(mergedConfig.screenshotDir, `screenshot-${Date.now()}.png`);

          const command = `npx playwright screenshot ${fullPage ? "--full-page" : ""} --viewport-size="${mergedConfig.viewport.width},${mergedConfig.viewport.height}" "${targetUrl}" "${screenshotPath}"`;

          await execAsync(command, { timeout: mergedConfig.timeout });

          await cleanupOldScreenshots(mergedConfig.screenshotDir, mergedConfig.maxScreenshots);

          if (currentState) {
            currentState.screenshotPath = screenshotPath;
          }

          return `Screenshot saved to: ${screenshotPath}`;
        } catch (error) {
          return `Failed to take screenshot: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "BrowserClick",
      description: "Click an element on the page by selector",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL of the page" },
          selector: { type: "string", description: "CSS selector of element to click" },
        },
        required: ["url", "selector"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { url, selector } = input as { url: string; selector: string };

        try {
          const script = `
            const { chromium } = require('playwright');
            (async () => {
              const browser = await chromium.launch({ headless: ${mergedConfig.headless} });
              const page = await browser.newPage({ viewport: ${JSON.stringify(mergedConfig.viewport)} });
              await page.goto('${url}');
              await page.click('${selector}');
              await page.waitForTimeout(1000);
              await browser.close();
            })();
          `;

          const scriptPath = join(process.env.HOME || process.cwd(), ".openflow", "temp-browser-script.js");
          await mkdir(join(process.env.HOME || process.cwd(), ".openflow"), { recursive: true });
          await writeFile(scriptPath, script);

          try {
            await execAsync(`node "${scriptPath}"`, { timeout: mergedConfig.timeout });
          } finally {
            await cleanupTempScript(scriptPath);
          }

          return `Clicked element '${selector}' on ${url}`;
        } catch (error) {
          return `Failed to click element: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "BrowserFill",
      description: "Fill a form field on the page",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL of the page" },
          selector: { type: "string", description: "CSS selector of input field" },
          value: { type: "string", description: "Value to fill" },
        },
        required: ["url", "selector", "value"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { url, selector, value } = input as { url: string; selector: string; value: string };

        try {
          const script = `
            const { chromium } = require('playwright');
            (async () => {
              const browser = await chromium.launch({ headless: ${mergedConfig.headless} });
              const page = await browser.newPage({ viewport: ${JSON.stringify(mergedConfig.viewport)} });
              await page.goto('${url}');
              await page.fill('${selector}', '${value.replace(/'/g, "\\'")}');
              await browser.close();
            })();
          `;

          const scriptPath = join(process.env.HOME || process.cwd(), ".openflow", "temp-browser-script.js");
          await mkdir(join(process.env.HOME || process.cwd(), ".openflow"), { recursive: true });
          await writeFile(scriptPath, script);

          try {
            await execAsync(`node "${scriptPath}"`, { timeout: mergedConfig.timeout });
          } finally {
            await cleanupTempScript(scriptPath);
          }

          return `Filled '${selector}' with value on ${url}`;
        } catch (error) {
          return `Failed to fill field: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "BrowserEvaluate",
      description: "Execute JavaScript in the browser and return the result",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL of the page" },
          script: { type: "string", description: "JavaScript code to execute" },
        },
        required: ["url", "script"],
      },
      isReadOnly: false,
      handler: async (input: unknown) => {
        const { url, script } = input as { url: string; script: string };

        try {
          const tempScript = `
            const { chromium } = require('playwright');
            (async () => {
              const browser = await chromium.launch({ headless: ${mergedConfig.headless} });
              const page = await browser.newPage({ viewport: ${JSON.stringify(mergedConfig.viewport)} });
              await page.goto('${url}');
              const result = await page.evaluate(() => ${script});
              console.log(JSON.stringify(result));
              await browser.close();
            })();
          `;

          const scriptPath = join(process.env.HOME || process.cwd(), ".openflow", "temp-browser-script.js");
          await mkdir(join(process.env.HOME || process.cwd(), ".openflow"), { recursive: true });
          await writeFile(scriptPath, tempScript);

          try {
            const { stdout } = await execAsync(`node "${scriptPath}"`, { timeout: mergedConfig.timeout });
            return `Script executed successfully.\nResult: ${stdout}`;
          } finally {
            await cleanupTempScript(scriptPath);
          }
        } catch (error) {
          return `Failed to execute script: ${(error as Error).message}`;
        }
      },
    },
    {
      name: "BrowserGetContent",
      description: "Get the text content of the current page",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL of the page" },
        },
        required: ["url"],
      },
      isReadOnly: true,
      handler: async (input: unknown) => {
        const { url } = input as { url: string };

        try {
          const script = `
            const { chromium } = require('playwright');
            (async () => {
              const browser = await chromium.launch({ headless: ${mergedConfig.headless} });
              const page = await browser.newPage({ viewport: ${JSON.stringify(mergedConfig.viewport)} });
              await page.goto('${url}');
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

            currentState = { url };

            return `Page content from ${url}:\n\n${stdout.slice(0, 5000)}${stdout.length > 5000 ? "\n...(truncated)" : ""}`;
          } finally {
            await cleanupTempScript(scriptPath);
          }
        } catch (error) {
          return `Failed to get page content: ${(error as Error).message}`;
        }
      },
    },
  ];
}
