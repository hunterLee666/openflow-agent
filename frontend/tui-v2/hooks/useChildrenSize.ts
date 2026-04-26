import { useMemo } from 'react'

interface Size {
  width: number
  height: number
}

export default function useChildrenSize(children: React.ReactNode): Size {
  return useMemo(() => {
    let width = 0
    let height = 0

    const measure = (node: React.ReactNode): void => {
      if (typeof node === 'string') {
        const lines = node.split('\n')
        height += lines.length
        width = Math.max(width, ...lines.map(line => line.length))
      } else if (typeof node === 'number') {
        const str = String(node)
        height += 1
        width = Math.max(width, str.length)
      } else if (Array.isArray(node)) {
        node.forEach(measure)
      } else if (node && typeof node === 'object' && 'props' in node) {
        const props = (node as React.ReactElement).props
        if (props.children) {
          measure(props.children)
        }
      }
    }

    measure(children)

    return { width: Math.max(1, width), height: Math.max(1, height) }
  }, [children])
}
