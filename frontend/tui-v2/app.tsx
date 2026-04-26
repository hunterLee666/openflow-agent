import React from 'react'
import { createRoot } from './core/renderer'
import { OpenFlowApp } from './components/OpenFlowApp'
import { useOpenFlow } from './hooks/useOpenFlow'

function App() {
  const {
    messages,
    status,
    tokenUsed,
    tokenTotal,
    latency,
    provider,
    model,
    baseUrl,
    session,
    sendMessage
  } = useOpenFlow({
    wsUrl: 'ws://localhost:8765',
    provider: 'Bailian',
    model: 'qwen2.5-vl-3b-instruct',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  })

  return (
    <OpenFlowApp
      messages={messages}
      provider={provider}
      model={model}
      baseUrl={baseUrl}
      latency={latency}
      tokenUsed={tokenUsed}
      tokenTotal={tokenTotal}
      session={session}
      status={status}
      onSend={sendMessage}
    />
  )
}

const root = createRoot()
root.render(<App />)
