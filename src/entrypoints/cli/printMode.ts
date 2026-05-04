import { AgentService } from '@engine/agentService';
import { getGlobalConfig } from '@utils/config';
import { getCwd } from '@utils/state';

interface RunPrintModeOptions {
  prompt?: string;
  stdinContent?: string;
  inputPrompt?: string;
  cwd?: string;
  safe?: boolean;
  verbose?: boolean;
  outputFormat?: string;
  inputFormat?: string;
  jsonSchema?: string;
  permissionPromptTool?: string;
  replayUserMessages?: boolean;
  cliTools?: any;
  tools?: any;
  commands?: any;
  ask?: any;
  initialMessages?: any;
  sessionPersistence?: boolean;
  systemPromptOverride?: string;
  appendSystemPrompt?: string;
  disableSlashCommands?: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];
  addDir?: string[];
  permissionMode?: string;
  dangerouslySkipPermissions?: boolean;
  allowDangerouslySkipPermissions?: boolean;
  model?: string;
  mcpClients?: any;
}

export async function runPrintMode(opts: RunPrintModeOptions): Promise<void> {
  const config = getGlobalConfig();
  const agent = new AgentService({ cwd: opts.cwd || getCwd(), model: opts.model || config.model });
  const prompt = opts.prompt || opts.stdinContent || opts.inputPrompt || '';
  if (!prompt) return;

  let resultText = '';
  try {
    for await (const event of agent.query(prompt)) {
      if (event.type === 'assistant') {
        for (const item of event.message.content) {
          if (item.type === 'text') {
            resultText += item.text;
          }
        }
      } else if (event.type === 'error') {
        console.error(event.message || 'Error during query');
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(String(err));
    process.exit(1);
  }

  if (opts.outputFormat === 'json') {
    console.log(JSON.stringify({ result: resultText }));
  } else if (opts.outputFormat === 'stream-json') {
    console.log(JSON.stringify({ type: 'result', data: { text: resultText } }));
  } else {
    console.log(resultText);
  }
}
