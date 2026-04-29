export interface BackpressureConfig {
  minIntervalMs: number
  maxBufferSize: number
  highWaterMark: number
  lowWaterMark: number
}

export const DEFAULT_BACKPRESSURE_CONFIG: BackpressureConfig = {
  minIntervalMs: 16,
  maxBufferSize: 1000,
  highWaterMark: 100,
  lowWaterMark: 20,
}

export interface BackpressureState {
  bufferSize: number
  isPaused: boolean
  lastYieldTime: number
  totalYields: number
  totalDrops: number
}

export function createBackpressureState(): BackpressureState {
  return {
    bufferSize: 0,
    isPaused: false,
    lastYieldTime: 0,
    totalYields: 0,
    totalDrops: 0,
  }
}

export async function* applyBackpressure<T>(
  source: AsyncIterable<T>,
  config: BackpressureConfig = DEFAULT_BACKPRESSURE_CONFIG,
): AsyncGenerator<T> {
  const state = createBackpressureState()
  const buffer: T[] = []

  for await (const item of source) {
    const now = Date.now()
    const timeSinceLastYield = now - state.lastYieldTime

    if (state.bufferSize >= config.highWaterMark) {
      state.isPaused = true
    }

    if (state.isPaused) {
      if (state.bufferSize <= config.lowWaterMark) {
        state.isPaused = false
      } else {
        if (buffer.length < config.maxBufferSize) {
          buffer.push(item)
          state.bufferSize++
        } else {
          state.totalDrops++
        }
        continue
      }
    }

    if (timeSinceLastYield < config.minIntervalMs) {
      if (buffer.length < config.maxBufferSize) {
        buffer.push(item)
        state.bufferSize++
      } else {
        state.totalDrops++
      }
      continue
    }

    while (buffer.length > 0 && state.bufferSize > config.lowWaterMark) {
      const buffered = buffer.shift()!
      state.bufferSize--
      state.lastYieldTime = Date.now()
      state.totalYields++
      yield buffered
    }

    if (buffer.length > 0) {
      const buffered = buffer.shift()!
      state.bufferSize--
      state.lastYieldTime = now
      state.totalYields++
      yield buffered
    }

    state.lastYieldTime = now
    state.totalYields++
    yield item
  }

  while (buffer.length > 0) {
    const buffered = buffer.shift()!
    state.bufferSize--
    state.totalYields++
    yield buffered
  }
}

export async function* throttleStream<T>(
  source: AsyncIterable<T>,
  intervalMs: number = 16,
): AsyncGenerator<T> {
  let lastYield = 0

  for await (const item of source) {
    const now = Date.now()
    const elapsed = now - lastYield

    if (elapsed < intervalMs) {
      await new Promise(resolve => setTimeout(resolve, intervalMs - elapsed))
    }

    lastYield = Date.now()
    yield item
  }
}

export async function* debounceStream<T>(
  source: AsyncIterable<T>,
  waitMs: number = 100,
): AsyncGenerator<T> {
  let buffer: T[] = []
  let timeout: ReturnType<typeof setTimeout> | null = null
  let resolveNext: ((value: IteratorResult<T>) => void) | null = null
  let done = false

  const flush = () => {
    if (buffer.length > 0 && resolveNext) {
      const item = buffer.shift()!
      resolveNext({ value: item, done: false })
      resolveNext = null
    }
  }

  const processItem = (item: T) => {
    buffer.push(item)

    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      flush()
      timeout = null
    }, waitMs)
  }

  ;(async () => {
    try {
      for await (const item of source) {
        processItem(item)
      }
      done = true
      if (timeout) {
        clearTimeout(timeout)
      }
      flush()
      if (resolveNext) {
        resolveNext({ value: undefined as any, done: true })
      }
    } catch (error) {
      if (resolveNext) {
        resolveNext({ value: undefined as any, done: true })
      }
    }
  })()

  while (!done || buffer.length > 0) {
    const result = await new Promise<IteratorResult<T>>(resolve => {
      resolveNext = resolve
    })
    if (result.done) break
    yield result.value
  }
}

export async function* batchStream<T>(
  source: AsyncIterable<T>,
  maxBatchSize: number = 10,
  maxWaitMs: number = 50,
): AsyncGenerator<T[]> {
  let batch: T[] = []
  let lastFlush = Date.now()

  for await (const item of source) {
    batch.push(item)
    const now = Date.now()

    if (batch.length >= maxBatchSize || now - lastFlush >= maxWaitMs) {
      yield batch
      batch = []
      lastFlush = now
    }
  }

  if (batch.length > 0) {
    yield batch
  }
}

export async function* rateLimitStream<T>(
  source: AsyncIterable<T>,
  itemsPerSecond: number = 60,
): AsyncGenerator<T> {
  const intervalMs = 1000 / itemsPerSecond
  let lastYield = 0

  for await (const item of source) {
    const now = Date.now()
    const elapsed = now - lastYield

    if (elapsed < intervalMs) {
      await new Promise(resolve => setTimeout(resolve, intervalMs - elapsed))
    }

    lastYield = Date.now()
    yield item
  }
}

export interface StreamMetrics {
  totalItems: number
  totalBytes: number
  startTime: number
  lastItemTime: number
  averageRate: number
  currentRate: number
}

export function createStreamMetrics(): StreamMetrics {
  return {
    totalItems: 0,
    totalBytes: 0,
    startTime: Date.now(),
    lastItemTime: Date.now(),
    averageRate: 0,
    currentRate: 0,
  }
}

export function updateStreamMetrics(
  metrics: StreamMetrics,
  itemSize: number,
): void {
  const now = Date.now()
  metrics.totalItems++
  metrics.totalBytes += itemSize
  metrics.lastItemTime = now

  const elapsed = (now - metrics.startTime) / 1000
  metrics.averageRate = elapsed > 0 ? metrics.totalItems / elapsed : 0
}

export async function* withMetrics<T>(
  source: AsyncIterable<T>,
  onMetrics: (metrics: StreamMetrics) => void,
  getItemSize?: (item: T) => number,
): AsyncGenerator<T> {
  const metrics = createStreamMetrics()

  for await (const item of source) {
    const size = getItemSize?.(item) ?? 1
    updateStreamMetrics(metrics, size)
    onMetrics(metrics)
    yield item
  }
}

export async function* takeWhile<T>(
  source: AsyncIterable<T>,
  predicate: (item: T) => boolean | Promise<boolean>,
): AsyncGenerator<T> {
  for await (const item of source) {
    if (await predicate(item)) {
      yield item
    } else {
      break
    }
  }
}

export async function* skipWhile<T>(
  source: AsyncIterable<T>,
  predicate: (item: T) => boolean | Promise<boolean>,
): AsyncGenerator<T> {
  let skipping = true

  for await (const item of source) {
    if (skipping && (await predicate(item))) {
      continue
    }
    skipping = false
    yield item
  }
}

export async function* distinctUntilChanged<T>(
  source: AsyncIterable<T>,
  compare?: (a: T, b: T) => boolean,
): AsyncGenerator<T> {
  let lastItem: T | undefined
  let isFirst = true

  const defaultCompare = (a: T, b: T) => a === b
  const comparator = compare ?? defaultCompare

  for await (const item of source) {
    if (isFirst || !comparator(lastItem as T, item)) {
      isFirst = false
      lastItem = item
      yield item
    }
  }
}

export async function* withAbortSignal<T>(
  source: AsyncIterable<T>,
  signal: AbortSignal,
): AsyncGenerator<T> {
  if (signal.aborted) {
    return
  }

  const abortPromise = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

  try {
    const iterator = source[Symbol.asyncIterator]()

    while (true) {
      const result = await Promise.race([
        iterator.next(),
        abortPromise,
      ])

      if (result.done) {
        return
      }

      yield result.value
    }
  } finally {
    if (signal.aborted) {
      const iterator = source[Symbol.asyncIterator]()
      if (iterator.return) {
        await iterator.return()
      }
    }
  }
}

export async function collectStream<T>(source: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = []
  for await (const item of source) {
    result.push(item)
  }
  return result
}

export async function firstFromStream<T>(source: AsyncIterable<T>): Promise<T | undefined> {
  for await (const item of source) {
    return item
  }
  return undefined
}

export async function lastFromStream<T>(source: AsyncIterable<T>): Promise<T | undefined> {
  let last: T | undefined
  for await (const item of source) {
    last = item
  }
  return last
}
