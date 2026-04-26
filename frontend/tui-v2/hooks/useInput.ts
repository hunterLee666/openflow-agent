import Input from '../core/input'
import { useEffect } from 'react'

const input = new Input()

export default (callback: (input: string, raw: () => string) => void = () => {}, deps: React.DependencyList = []) => {
  useEffect(() => {
    const handler = (input: string, raw: () => string) => {
      if (input === '\x03') {
        // Ctrl+C 退出
        process.exit(0)
      }
      if (input.startsWith('\x1b\x5b\x4d')) {
        // 鼠标事件，忽略
        return
      }

      callback(input, raw)
    }

    input.on(handler)
    return () => {
      input.off(handler)
    }
  }, deps)
}
