import EventEmitter from 'events'

export default class Input {
  ee: EventEmitter
  queue: string[] = []
  isSetup = false

  constructor() {
    this.ee = new EventEmitter()
    this.setupStdin()
  }

  private setupStdin() {
    if (this.isSetup) return
    this.isSetup = true

    // Bun 不支持 setRawMode，但 stdin 仍然可以工作
    // 确保 stdin 处于流动状态
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(true)
      } catch (e) {
        // Bun 环境下 setRawMode 可能不可用
        console.error('[Input] setRawMode 不可用，使用标准模式')
      }
    }
    
    // 确保 stdin 正在读取
    process.stdin.resume()
  }

  terminate() {
    this.ee.removeAllListeners()
    process.stdin.pause()
  }

  private onData = (key: Buffer) => {
    const raw = key.toString()
    const chunks = this.parse(raw)

    if (chunks.length > 1) this.queue = chunks.slice(1)
    this.ee.emit('data', chunks[0], () => {
      this.queue = []
      return raw
    })
  }

  parse(input: string) {
    const chars = input.split('')

    let res: any
    const chunks: string[] = []
    while ((res = chars.shift())) {
      if (['\x10', '\x1b'].includes(res)) {
        // length >= 2, example: M-a (1b 61)
        res += chars.shift() || ''

        if (res.endsWith('\x5b')) {
          // length >= 3, example: arrowup (1b 5b 41)
          res += chars.shift() || ''

          if (res.endsWith('\x31') || res.endsWith('\x34') || res.endsWith('\x35') || res.endsWith('\x36')) {
            // length >= 4, example: pageup (1b 5b 35 7e, 1b 5b 36 7e)
            res += chars.shift() || ''
          } else if (res.endsWith('\x4d')) {
            // length >= 4, example: mousedown (1b 5b 4d 20 21 21, 1b 5b 4d 20 c3 80 21)
            res += chars.shift() || ''
            res += chars.shift() || ''
            res += chars.shift() || ''
          }
        }
      }

      chunks.push(res)
    }

    return chunks
  }
  on(callback: (input: string, raw: () => string) => void) {
    if (this.ee.listenerCount('data') === 0) {
      this.setupStdin()
      process.stdin.on('data', this.onData)
    }
    this.ee.on('data', callback)
  }

  off(callback: (input: string, raw: () => string) => void) {
    this.ee.off('data', callback)
    if (this.ee.listenerCount('data') === 0) process.stdin.off('data', this.onData)
  }

  render() {
    const chunk = this.queue.shift()
    if (chunk) setTimeout(() => this.ee.emit('data', chunk), 0)
  }
}
