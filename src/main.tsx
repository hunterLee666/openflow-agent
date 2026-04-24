#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { Command } from "commander";
import App from "./ui/app.js";
import { loadConfig } from "./services/config.js";

const program = new Command();

program
  .name("ai-coding-agent")
  .description("AI Coding Agent - inspired by Claude Code architecture")
  .version("0.1.0");

program
  .command("chat [message]")
  .description("Start interactive chat or send a single message")
  .action(async (message?: string) => {
    const config = await loadConfig();
    if (!config.apiKey) {
      console.error("Error: ANTHROPIC_API_KEY not set");
      process.exit(1);
    }
    render(<App config={config} initialMessage={message} />);
  });

program
  .command("init")
  .description("Initialize configuration")
  .action(async () => {
    console.log("Initializing AI Coding Agent...");
    const config = await loadConfig();
    console.log("Config loaded:", config.model);
  });

program.parse();
