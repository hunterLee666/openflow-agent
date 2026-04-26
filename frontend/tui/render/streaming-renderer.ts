import { z } from 'zod'

export const StreamingConfigSchema = z.object({
  wordsPerChunk: z.number().int().positive(),
  minChunkIntervalMs: z.number().int().nonnegative(),
  maxChunkIntervalMs: z.number().int().nonnegative(),
  enableAdaptiveRate: z.boolean(),
  initialDelayMs: z.number().int().nonnegative(),
  punctuationBreak: z.boolean(),
  punctuationDelayMs: z.number().int().nonnegative(),
})
export type StreamingConfig = z.infer<typeof StreamingConfigSchema>

export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  wordsPerChunk: 3,
  minChunkIntervalMs: 16,
  maxChunkIntervalMs: 100,
  enableAdaptiveRate: true,
  initialDelayMs: 200,
  punctuationBreak: true,
  punctuationDelayMs: 50,
}

export const StreamingChunkSchema = z.object({
  text: z.string(),
  timestamp: z.number(),
  isComplete: z.boolean(),
})
export type StreamingChunk = z.infer<typeof StreamingChunkSchema>

export type StreamingSource = AsyncIterable<string> | ReadableStream<string>

export const StreamingStateSchema = z.object({
  buffer: z.string(),
  chunks: z.array(StreamingChunkSchema),
  isComplete: z.boolean(),
  startTime: z.number(),
  totalChars: z.number(),
  currentWordIndex: z.number(),
  lastChunkTime: z.number(),
  adaptiveDelay: z.number(),
})
export type StreamingState = z.infer<typeof StreamingStateSchema>

export function createStreamingState(config: StreamingConfig): StreamingState {
  return {
    buffer: '',
    chunks: [],
    isComplete: false,
    startTime: Date.now(),
    totalChars: 0,
    currentWordIndex: 0,
    lastChunkTime: 0,
    adaptiveDelay: config.initialDelayMs,
  }
}

export function splitIntoWords(text: string): string[] {
  const words: string[] = []
  let currentWord = ''

  for (const char of text) {
    const isWhitespace = /\s/.test(char)
    const isPunctuation = /[.,!?;:，。！？；：]/.test(char)

    if (isWhitespace) {
      if (currentWord.length > 0) {
        words.push(currentWord)
        currentWord = ''
      }
    } else if (isPunctuation) {
      if (currentWord.length > 0) {
        words.push(currentWord)
        currentWord = ''
      }
      words.push(char)
    } else {
      currentWord += char
    }
  }

  if (currentWord.length > 0) {
    words.push(currentWord)
  }

  return words
}

export async function* streamWords(
  source: StreamingSource,
  config: Partial<StreamingConfig> = {}
): AsyncGenerator<StreamingChunk, void, unknown> {
  const mergedConfig = { ...DEFAULT_STREAMING_CONFIG, ...config }
  const state = createStreamingState(mergedConfig)

  let wordBuffer: string[] = []

  function createChunk(text: string, isComplete: boolean): StreamingChunk {
    const now = Date.now()
    const chunk: StreamingChunk = {
      text,
      timestamp: now,
      isComplete,
    }

    state.chunks.push(chunk)
    state.totalChars += text.length
    state.lastChunkTime = now

    if (mergedConfig.enableAdaptiveRate) {
      updateAdaptiveDelay()
    }

    return chunk
  }

  function updateAdaptiveDelay(): void {
    const elapsed = Date.now() - state.startTime
    const charsPerSecond = state.totalChars / (elapsed / 1000)

    if (charsPerSecond > 500) {
      state.adaptiveDelay = Math.max(
        mergedConfig.minChunkIntervalMs,
        state.adaptiveDelay - 5
      )
    } else if (charsPerSecond < 100) {
      state.adaptiveDelay = Math.min(
        mergedConfig.maxChunkIntervalMs,
        state.adaptiveDelay + 10
      )
    }
  }

  if (source instanceof ReadableStream) {
    const reader = source.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          if (wordBuffer.length > 0) {
            yield createChunk(wordBuffer.join(' '), true)
          }
          return
        }

        const newWords = splitIntoWords(value)
        wordBuffer.push(...newWords)

        while (wordBuffer.length >= mergedConfig.wordsPerChunk) {
          const chunk = wordBuffer.splice(0, mergedConfig.wordsPerChunk)
          yield createChunk(chunk.join(' '), false)
        }
      }
    } finally {
      reader.releaseLock()
    }
  } else {
    for await (const chunk of source) {
      const newWords = splitIntoWords(chunk)
      wordBuffer.push(...newWords)

      while (wordBuffer.length >= mergedConfig.wordsPerChunk) {
        const words = wordBuffer.splice(0, mergedConfig.wordsPerChunk)
        yield createChunk(words.join(' '), false)
      }
    }

    if (wordBuffer.length > 0) {
      yield createChunk(wordBuffer.join(' '), true)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function* streamWithControlledFrequency(
  source: StreamingSource,
  config: Partial<StreamingConfig> = {}
): AsyncGenerator<StreamingChunk, void, unknown> {
  const mergedConfig = { ...DEFAULT_STREAMING_CONFIG, ...config }
  const state = createStreamingState(mergedConfig)

  const accumulator: string[] = []
  let lastYieldTime = Date.now()

  function createChunk(text: string, isComplete: boolean): StreamingChunk {
    const now = Date.now()
    const chunk: StreamingChunk = {
      text,
      timestamp: now,
      isComplete,
    }

    state.chunks.push(chunk)
    state.totalChars += text.length
    state.lastChunkTime = now

    return chunk
  }

  if (source instanceof ReadableStream) {
    const reader = source.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          if (accumulator.length > 0) {
            const remaining = accumulator.join('')
            yield createChunk(remaining, true)
          }
          return
        }

        accumulator.push(value)

        const now = Date.now()
        const timeSinceLastYield = now - lastYieldTime

        if (timeSinceLastYield >= mergedConfig.minChunkIntervalMs) {
          const text = accumulator.join('')
          accumulator.length = 0

          yield createChunk(text, false)
          lastYieldTime = Date.now()

          if (mergedConfig.punctuationBreak) {
            const hasPunctuation = /[.!?。！？]$/.test(text.trim())

            if (hasPunctuation) {
              await sleep(mergedConfig.punctuationDelayMs)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  } else {
    for await (const chunk of source) {
      accumulator.push(chunk)

      const now = Date.now()
      const timeSinceLastYield = now - lastYieldTime

      if (timeSinceLastYield >= mergedConfig.minChunkIntervalMs) {
        const text = accumulator.join('')
        accumulator.length = 0

        yield createChunk(text, false)
        lastYieldTime = Date.now()

        if (mergedConfig.punctuationBreak) {
          const hasPunctuation = /[.!?。！？]$/.test(text.trim())

          if (hasPunctuation) {
            await sleep(mergedConfig.punctuationDelayMs)
          }
        }
      }
    }

    if (accumulator.length > 0) {
      const remaining = accumulator.join('')
      yield createChunk(remaining, true)
    }
  }
}

export async function* streamWordByWord(
  source: StreamingSource,
  config: Partial<StreamingConfig> = {}
): AsyncGenerator<StreamingChunk, void, unknown> {
  const mergedConfig = { ...DEFAULT_STREAMING_CONFIG, ...config, wordsPerChunk: 1 }

  yield* streamWords(source, mergedConfig)
}

export async function* streamBySentence(
  source: StreamingSource,
  config: Partial<StreamingConfig> = {}
): AsyncGenerator<StreamingChunk, void, unknown> {
  const mergedConfig = { ...DEFAULT_STREAMING_CONFIG, ...config }
  const state = createStreamingState(mergedConfig)

  const sentenceBoundary = /[.!?。！？\n]+/
  let buffer = ''

  function createChunk(text: string, isComplete: boolean): StreamingChunk {
    const now = Date.now()
    const chunk: StreamingChunk = {
      text,
      timestamp: now,
      isComplete,
    }

    state.chunks.push(chunk)
    state.totalChars += text.length
    state.lastChunkTime = now

    return chunk
  }

  if (source instanceof ReadableStream) {
    const reader = source.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          if (buffer.length > 0) {
            yield createChunk(buffer, true)
          }
          return
        }

        buffer += value

        const sentences = buffer.split(sentenceBoundary)

        for (let i = 0; i < sentences.length - 1; i++) {
          const sentence = sentences[i].trim()

          if (sentence.length > 0) {
            yield createChunk(sentence, false)
          }
        }

        buffer = sentences[sentences.length - 1]
      }
    } finally {
      reader.releaseLock()
    }
  } else {
    for await (const chunk of source) {
      buffer += chunk

      const sentences = buffer.split(sentenceBoundary)

      for (let i = 0; i < sentences.length - 1; i++) {
        const sentence = sentences[i].trim()

        if (sentence.length > 0) {
          yield createChunk(sentence, false)
        }
      }

      buffer = sentences[sentences.length - 1]
    }

    if (buffer.length > 0) {
      yield createChunk(buffer, true)
    }
  }
}

export function calculateStreamingMetrics(chunks: StreamingChunk[]): {
  totalChars: number
  totalChunks: number
  avgChunkSize: number
  avgChunkInterval: number
  charsPerSecond: number
  duration: number
} {
  if (chunks.length === 0) {
    return {
      totalChars: 0,
      totalChunks: 0,
      avgChunkSize: 0,
      avgChunkInterval: 0,
      charsPerSecond: 0,
      duration: 0,
    }
  }

  const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0)
  const totalChunks = chunks.length
  const avgChunkSize = totalChars / totalChunks

  let totalInterval = 0
  for (let i = 1; i < chunks.length; i++) {
    totalInterval += chunks[i].timestamp - chunks[i - 1].timestamp
  }
  const avgChunkInterval = totalChunks > 1 ? totalInterval / (totalChunks - 1) : 0

  const duration = chunks[chunks.length - 1].timestamp - chunks[0].timestamp
  const charsPerSecond = duration > 0 ? (totalChars / duration) * 1000 : 0

  return {
    totalChars,
    totalChunks,
    avgChunkSize,
    avgChunkInterval,
    charsPerSecond,
    duration,
  }
}

export interface StreamingRendererOptions {
  targetFps?: number
  maxCharsPerFrame?: number
  enableThrottling?: boolean
  throttleThresholdMs?: number
}

export const DEFAULT_RENDERER_OPTIONS: StreamingRendererOptions = {
  targetFps: 30,
  maxCharsPerFrame: 50,
  enableThrottling: true,
  throttleThresholdMs: 1000,
}

export async function* renderWithFrameControl(
  source: StreamingSource,
  options: Partial<StreamingRendererOptions> = {}
): AsyncGenerator<StreamingChunk, void, unknown> {
  const mergedOptions = { ...DEFAULT_RENDERER_OPTIONS, ...options }
  const frameInterval = 1000 / (mergedOptions.targetFps || 30)

  let lastFrameTime = Date.now()
  let buffer = ''

  function flushBuffer(isComplete: boolean): StreamingChunk {
    const text = buffer
    buffer = ''

    const maxChars = mergedOptions.maxCharsPerFrame || 50

    if (text.length > maxChars) {
      buffer = text.slice(maxChars)
      return createChunk(text.slice(0, maxChars), false)
    }

    return createChunk(text, isComplete)
  }

  function createChunk(text: string, isComplete: boolean): StreamingChunk {
    return {
      text,
      timestamp: Date.now(),
      isComplete,
    }
  }

  if (source instanceof ReadableStream) {
    const reader = source.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          if (buffer.length > 0) {
            yield flushBuffer(true)
          }
          return
        }

        buffer += value

        const now = Date.now()
        const timeSinceLastFrame = now - lastFrameTime

        if (timeSinceLastFrame >= frameInterval) {
          yield flushBuffer(false)
          lastFrameTime = now
        }
      }
    } finally {
      reader.releaseLock()
    }
  } else {
    for await (const chunk of source) {
      buffer += chunk

      const now = Date.now()
      const timeSinceLastFrame = now - lastFrameTime

      if (timeSinceLastFrame >= frameInterval) {
        yield flushBuffer(false)
        lastFrameTime = now
      }
    }

    if (buffer.length > 0) {
      yield flushBuffer(true)
    }
  }
}
