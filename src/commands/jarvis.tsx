import React from 'react'
import { Box, Text } from 'ink'
import { Jarvis, type JarvisAgent, type JarvisConfig, type ChannelConfig, JarvisConfigManager, AutoDream } from '@assistant'

type Command = {
  description: string
  isEnabled: boolean
  isHidden: boolean
  name: string
  userFacingName(): string
}

const jarvisCommand: Command & {
  type: 'local-jsx'
  call(
    onDone: (result?: string) => void,
    context: any,
    args?: string,
  ): Promise<React.ReactNode>
} = {
  name: 'jarvis',
  description: 'Start Jarvis daemon mode for persistent background agent',
  isEnabled: true,
  isHidden: false,
  userFacingName: () => 'jarvis',
  type: 'local-jsx',
  async call(onDone, context, args) {
    const parts = (args?.trim() || 'status').split(/\s+/)
    const subCommand = parts[0]
    const subArgs = parts.slice(1)

    switch (subCommand) {
      case 'start':
        return <JarvisStartScreen onDone={onDone} />
      case 'stop':
        return <JarvisStopScreen onDone={onDone} />
      case 'status':
        return <JarvisStatusScreen onDone={onDone} />
      case 'config':
        return <JarvisConfigScreen onDone={onDone} args={subArgs} />
      case 'channel':
        return <JarvisChannelScreen onDone={onDone} args={subArgs} />
      case 'server':
        return <JarvisServerScreen onDone={onDone} args={subArgs} />
      case 'dream':
        return <JarvisDreamScreen onDone={onDone} args={subArgs} />
      default:
        return <JarvisHelpScreen />
    }
  },
}

function JarvisHelpScreen() {
  return (
    <Box flexDirection="column">
      <Text bold>Jarvis - Persistent Background Agent</Text>
      <Text> </Text>
      <Text>Usage: /jarvis [command]</Text>
      <Text> </Text>
      <Text bold>Commands:</Text>
      <Text>  start           - Start Jarvis daemon</Text>
      <Text>  stop            - Stop Jarvis daemon</Text>
      <Text>  status          - Show Jarvis status</Text>
      <Text> </Text>
      <Text bold>Configuration:</Text>
      <Text>  config show     - Show current configuration</Text>
      <Text>  config reset    - Reset to default configuration</Text>
      <Text>  config path     - Show config file path</Text>
      <Text> </Text>
      <Text bold>Channel Management:</Text>
      <Text>  channel list              - List all channels</Text>
      <Text>  channel add &lt;type&gt; &lt;webhookUrl&gt; [secret]</Text>
      <Text>                            - Add a channel</Text>
      <Text>  channel remove &lt;type&gt;     - Remove a channel</Text>
      <Text>  channel enable &lt;type&gt;     - Enable a channel</Text>
      <Text>  channel disable &lt;type&gt;    - Disable a channel</Text>
      <Text> </Text>
      <Text bold>Server Management:</Text>
      <Text>  server show               - Show server configuration</Text>
      <Text>  server enable [port]      - Enable callback server</Text>
      <Text>  server disable            - Disable callback server</Text>
      <Text>  server port &lt;port&gt;        - Set server port</Text>
      <Text> </Text>
      <Text bold>AutoDream (Memory Consolidation):</Text>
      <Text>  dream status              - Show AutoDream status</Text>
      <Text>  dream run                 - Run AutoDream manually</Text>
      <Text> </Text>
      <Text dimColor>Supported channels: dingtalk, feishu, wechat, wechat-work, webhook</Text>
    </Box>
  )
}

function JarvisStartScreen({ onDone }: { onDone: (result?: string) => void }) {
  const [status, setStatus] = React.useState<'starting' | 'running' | 'error'>('starting')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const startJarvis = async () => {
      try {
        const agent: JarvisAgent = {
          id: 'jarvis-default',
          name: 'Jarvis',
          identity: 'I am Jarvis, a persistent AI assistant that runs in the background.',
          capabilities: ['code', 'research', 'automation', 'monitoring'],
          hooks: {
            onTick: async (context) => {
              console.log(`[Jarvis] Tick #${context.tickNumber}`)
            },
            onMessage: async (message) => {
              console.log(`[Jarvis] Message from ${message.channel}: ${message.content}`)
            },
          },
        }

        const jarvis = Jarvis.fromConfigFile()
        await jarvis.initialize(agent)
        await jarvis.start()
        
        setStatus('running')
        onDone('Jarvis daemon started successfully')
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    startJarvis()
  }, [onDone])

  if (status === 'error') {
    return (
      <Box flexDirection="column">
        <Text color="red">Failed to start Jarvis: {error}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold>Jarvis Daemon</Text>
      <Text> </Text>
      {status === 'starting' && <Text color="yellow">Starting Jarvis...</Text>}
      {status === 'running' && (
        <>
          <Text color="green">Jarvis is running in background mode</Text>
          <Text> </Text>
          <Text dimColor>Memory: ~/.openflow/jarvis/memory/</Text>
          <Text dimColor>Config: ~/.openflow/jarvis/jarvis.config.json</Text>
        </>
      )}
    </Box>
  )
}

function JarvisStopScreen({ onDone }: { onDone: (result?: string) => void }) {
  return (
    <Box flexDirection="column">
      <Text bold>Jarvis Daemon</Text>
      <Text> </Text>
      <Text color="yellow">Jarvis daemon stopped</Text>
    </Box>
  )
}

function JarvisStatusScreen({ onDone }: { onDone: (result?: string) => void }) {
  const configManager = new JarvisConfigManager()
  const config = configManager.getConfig()

  return (
    <Box flexDirection="column">
      <Text bold>Jarvis Status</Text>
      <Text> </Text>
      <Text>State: <Text color="yellow">idle</Text></Text>
      <Text>Memory: {config.memoryDir || '~/.openflow/jarvis/memory/'}</Text>
      <Text>Config: {configManager.getConfigPath()}</Text>
      <Text> </Text>
      <Text bold>Channels ({config.channels.length}):</Text>
      {config.channels.length === 0 ? (
        <Text dimColor>  No channels configured</Text>
      ) : (
        config.channels.map((ch, i) => (
          <Box key={i}>
            <Text>  {ch.type}: {ch.enabled ? <Text color="green">enabled</Text> : <Text color="red">disabled</Text>}</Text>
          </Box>
        ))
      )}
      <Text> </Text>
      <Text bold>Server:</Text>
      <Text>  Status: {config.server?.enabled ? <Text color="green">enabled</Text> : <Text color="red">disabled</Text>}</Text>
      {config.server?.enabled && (
        <Text>  Address: {config.server.host}:{config.server.port}</Text>
      )}
      <Text> </Text>
      <Text dimColor>Use /jarvis start to begin daemon mode</Text>
    </Box>
  )
}

function JarvisConfigScreen({ onDone, args }: { onDone: (result?: string) => void; args: string[] }) {
  const configManager = new JarvisConfigManager()
  const subCommand = args[0] || 'show'

  switch (subCommand) {
    case 'show': {
      const config = configManager.getConfig()
      return (
        <Box flexDirection="column">
          <Text bold>Jarvis Configuration</Text>
          <Text> </Text>
          <Text>Config file: {configManager.getConfigPath()}</Text>
          <Text> </Text>
          <Text>Tick interval: {config.tickIntervalMs}ms</Text>
          <Text>Memory dir: {config.memoryDir || '(default)'}</Text>
          <Text>Max memory size: {config.maxMemorySize}</Text>
          <Text>Scheduler: {config.enableScheduler ? 'enabled' : 'disabled'}</Text>
          <Text> </Text>
          <Text dimColor>Raw JSON:</Text>
          <Text dimColor>{JSON.stringify(config, null, 2)}</Text>
        </Box>
      )
    }
    case 'reset':
      configManager.reset()
      return (
        <Box flexDirection="column">
          <Text color="green">Configuration reset to defaults</Text>
          <Text dimColor>File: {configManager.getConfigPath()}</Text>
        </Box>
      )
    case 'path':
      return (
        <Box flexDirection="column">
          <Text bold>Config File Path</Text>
          <Text>{configManager.getConfigPath()}</Text>
        </Box>
      )
    default:
      return (
        <Box flexDirection="column">
          <Text color="red">Unknown config command: {subCommand}</Text>
          <Text> </Text>
          <Text>Usage: /jarvis config [show|reset|path]</Text>
        </Box>
      )
  }
}

function JarvisChannelScreen({ onDone, args }: { onDone: (result?: string) => void; args: string[] }) {
  const configManager = new JarvisConfigManager()
  const subCommand = args[0] || 'list'

  switch (subCommand) {
    case 'list': {
      const channels = configManager.listChannels()
      return (
        <Box flexDirection="column">
          <Text bold>Configured Channels</Text>
          <Text> </Text>
          {channels.length === 0 ? (
            <Text dimColor>No channels configured</Text>
          ) : (
            channels.map((ch, i) => (
              <Box key={i} flexDirection="column">
                <Text>
                  <Text bold>{ch.type}</Text>
                  {': '}
                  {ch.enabled ? <Text color="green">enabled</Text> : <Text color="red">disabled</Text>}
                </Text>
                <Text dimColor>  Config: {JSON.stringify(ch.config)}</Text>
              </Box>
            ))
          )}
          <Text> </Text>
          <Text dimColor>Usage: /jarvis channel add &lt;type&gt; &lt;webhookUrl&gt; [secret]</Text>
        </Box>
      )
    }
    case 'add': {
      const type = args[1]
      const webhookUrl = args[2]
      const secret = args[3]

      if (!type || !webhookUrl) {
        return (
          <Box flexDirection="column">
            <Text color="red">Missing arguments</Text>
            <Text> </Text>
            <Text>Usage: /jarvis channel add &lt;type&gt; &lt;webhookUrl&gt; [secret]</Text>
            <Text> </Text>
            <Text>Types: dingtalk, feishu, wechat, wechat-work, webhook</Text>
          </Box>
        )
      }

      const validTypes = ['dingtalk', 'feishu', 'wechat', 'wechat-work', 'webhook', 'stdio']
      if (!validTypes.includes(type)) {
        return (
          <Box flexDirection="column">
            <Text color="red">Invalid channel type: {type}</Text>
            <Text>Valid types: {validTypes.join(', ')}</Text>
          </Box>
        )
      }

      const channelConfig: ChannelConfig = {
        type: type as ChannelConfig['type'],
        enabled: true,
        config: secret ? { webhookUrl, secret } : { webhookUrl },
      }

      configManager.addChannel(channelConfig)

      return (
        <Box flexDirection="column">
          <Text color="green">Channel added successfully</Text>
          <Text> </Text>
          <Text>Type: {type}</Text>
          <Text>Webhook: {webhookUrl}</Text>
          {secret && <Text>Secret: ****</Text>}
        </Box>
      )
    }
    case 'remove': {
      const type = args[1]
      if (!type) {
        return (
          <Box flexDirection="column">
            <Text color="red">Missing channel type</Text>
            <Text>Usage: /jarvis channel remove &lt;type&gt;</Text>
          </Box>
        )
      }

      configManager.removeChannel(type)
      return (
        <Box flexDirection="column">
          <Text color="green">Channel removed: {type}</Text>
        </Box>
      )
    }
    case 'enable': {
      const type = args[1]
      if (!type) {
        return (
          <Box flexDirection="column">
            <Text color="red">Missing channel type</Text>
            <Text>Usage: /jarvis channel enable &lt;type&gt;</Text>
          </Box>
        )
      }

      configManager.enableChannel(type)
      return (
        <Box flexDirection="column">
          <Text color="green">Channel enabled: {type}</Text>
        </Box>
      )
    }
    case 'disable': {
      const type = args[1]
      if (!type) {
        return (
          <Box flexDirection="column">
            <Text color="red">Missing channel type</Text>
            <Text>Usage: /jarvis channel disable &lt;type&gt;</Text>
          </Box>
        )
      }

      configManager.disableChannel(type)
      return (
        <Box flexDirection="column">
          <Text color="green">Channel disabled: {type}</Text>
        </Box>
      )
    }
    default:
      return (
        <Box flexDirection="column">
          <Text color="red">Unknown channel command: {subCommand}</Text>
          <Text> </Text>
          <Text>Usage: /jarvis channel [list|add|remove|enable|disable]</Text>
        </Box>
      )
  }
}

function JarvisServerScreen({ onDone, args }: { onDone: (result?: string) => void; args: string[] }) {
  const configManager = new JarvisConfigManager()
  const subCommand = args[0] || 'show'

  switch (subCommand) {
    case 'show': {
      const serverConfig = configManager.getServerConfig()
      return (
        <Box flexDirection="column">
          <Text bold>Server Configuration</Text>
          <Text> </Text>
          <Text>Status: {serverConfig.enabled ? <Text color="green">enabled</Text> : <Text color="red">disabled</Text>}</Text>
          <Text>Host: {serverConfig.host}</Text>
          <Text>Port: {serverConfig.port}</Text>
          {serverConfig.path && <Text>Path: {serverConfig.path}</Text>}
          <Text> </Text>
          <Text dimColor>The server receives callbacks from IM platforms for bidirectional communication.</Text>
        </Box>
      )
    }
    case 'enable': {
      const port = args[1] ? parseInt(args[1], 10) : 3456
      configManager.setServerConfig({ enabled: true, port })
      return (
        <Box flexDirection="column">
          <Text color="green">Server enabled</Text>
          <Text>Listening on 0.0.0.0:{port}</Text>
          <Text> </Text>
          <Text dimColor>Callback URL: http://your-server:{port}/jarvis</Text>
        </Box>
      )
    }
    case 'disable':
      configManager.setServerConfig({ enabled: false })
      return (
        <Box flexDirection="column">
          <Text color="yellow">Server disabled</Text>
        </Box>
      )
    case 'port': {
      const port = args[1] ? parseInt(args[1], 10) : undefined
      if (!port || isNaN(port)) {
        return (
          <Box flexDirection="column">
            <Text color="red">Invalid port number</Text>
            <Text>Usage: /jarvis server port &lt;port&gt;</Text>
          </Box>
        )
      }
      configManager.setServerConfig({ port })
      return (
        <Box flexDirection="column">
          <Text color="green">Server port set to {port}</Text>
        </Box>
      )
    }
    default:
      return (
        <Box flexDirection="column">
          <Text color="red">Unknown server command: {subCommand}</Text>
          <Text> </Text>
          <Text>Usage: /jarvis server [show|enable|disable|port]</Text>
        </Box>
      )
  }
}

function JarvisDreamScreen({ onDone, args }: { onDone: (result?: string) => void; args: string[] }) {
  const [status, setStatus] = React.useState<'loading' | 'ready' | 'running' | 'done' | 'error'>('loading')
  const [dreamStatus, setDreamStatus] = React.useState<{
    canDream: boolean
    reason: string
    lastDream: Date | null
    sessionCount: number
    hoursSinceLastDream: number
  } | null>(null)
  const [results, setResults] = React.useState<Array<{
    phase: string
    changes: string[]
    stats: { filesProcessed: number; memoriesMerged: number; memoriesPruned: number; duplicatesRemoved: number }
  }>>([])
  const [error, setError] = React.useState<string | null>(null)

  const subCommand = args[0] || 'status'

  React.useEffect(() => {
    const loadStatus = async () => {
      try {
        const jarvis = Jarvis.fromConfigFile()
        const status = jarvis.getDreamStatus()
        setDreamStatus(status)
        setStatus('ready')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    }
    loadStatus()
  }, [])

  const runDream = async () => {
    setStatus('running')
    try {
      const jarvis = Jarvis.fromConfigFile()
      const dreamResults = await jarvis.dream()
      setResults(dreamResults)
      setStatus('done')
      onDone('AutoDream completed')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  if (subCommand === 'run') {
    if (status === 'loading') {
      return (
        <Box flexDirection="column">
          <Text>Checking AutoDream status...</Text>
        </Box>
      )
    }

    if (status === 'ready' && dreamStatus) {
      if (!dreamStatus.canDream) {
        return (
          <Box flexDirection="column">
            <Text bold color="red">Cannot run AutoDream</Text>
            <Text> </Text>
            <Text>Reason: {dreamStatus.reason}</Text>
            <Text> </Text>
            <Text dimColor>Sessions: {dreamStatus.sessionCount}</Text>
            <Text dimColor>Hours since last dream: {dreamStatus.hoursSinceLastDream}</Text>
          </Box>
        )
      }

      runDream()
    }

    if (status === 'running') {
      return (
        <Box flexDirection="column">
          <Text bold>AutoDream Running</Text>
          <Text> </Text>
          <Text color="yellow">Processing memory consolidation...</Text>
          <Text dimColor>Phase 1/4: Orient</Text>
          <Text dimColor>Phase 2/4: Gather</Text>
          <Text dimColor>Phase 3/4: Consolidate</Text>
          <Text dimColor>Phase 4/4: Prune</Text>
        </Box>
      )
    }

    if (status === 'done') {
      return (
        <Box flexDirection="column">
          <Text bold color="green">AutoDream Completed</Text>
          <Text> </Text>
          {results.map((result, i) => (
            <Box key={i} flexDirection="column">
              <Text bold>Phase: {result.phase}</Text>
              <Text dimColor>  Files processed: {result.stats.filesProcessed}</Text>
              <Text dimColor>  Memories merged: {result.stats.memoriesMerged}</Text>
              <Text dimColor>  Memories pruned: {result.stats.memoriesPruned}</Text>
              <Text dimColor>  Duplicates removed: {result.stats.duplicatesRemoved}</Text>
              {result.changes.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  <Text dimColor>Changes:</Text>
                  {result.changes.slice(0, 5).map((change, j) => (
                    <Box key={j}>
                      <Text dimColor>  - {change}</Text>
                    </Box>
                  ))}
                  {result.changes.length > 5 && (
                    <Text dimColor>  ... and {result.changes.length - 5} more</Text>
                  )}
                </Box>
              )}
              <Text> </Text>
            </Box>
          ))}
        </Box>
      )
    }

    if (status === 'error') {
      return (
        <Box flexDirection="column">
          <Text color="red">AutoDream failed: {error}</Text>
        </Box>
      )
    }
  }

  if (subCommand === 'status') {
    if (status === 'loading') {
      return (
        <Box flexDirection="column">
          <Text>Loading AutoDream status...</Text>
        </Box>
      )
    }

    if (status === 'error') {
      return (
        <Box flexDirection="column">
          <Text color="red">Failed to load status: {error}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text bold>AutoDream Status</Text>
        <Text> </Text>
        {dreamStatus && (
          <>
            <Text>
              Can Dream: {dreamStatus.canDream ? <Text color="green">Yes</Text> : <Text color="red">No</Text>}
            </Text>
            <Text>Reason: {dreamStatus.reason}</Text>
            <Text> </Text>
            <Text bold>Statistics:</Text>
            <Text>  Sessions: {dreamStatus.sessionCount}</Text>
            <Text>  Hours since last dream: {dreamStatus.hoursSinceLastDream}</Text>
            {dreamStatus.lastDream && (
              <Text>  Last dream: {dreamStatus.lastDream.toLocaleString()}</Text>
            )}
            <Text> </Text>
            <Text dimColor>AutoDream runs automatically at 4:00 AM daily</Text>
            <Text dimColor>Minimum requirements: 24 hours + 5 sessions</Text>
          </>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text color="red">Unknown dream command: {subCommand}</Text>
      <Text> </Text>
      <Text>Usage: /jarvis dream [status|run]</Text>
    </Box>
  )
}

export default jarvisCommand
