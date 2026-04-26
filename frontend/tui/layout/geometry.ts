import { z } from 'zod'

export const SizeSchema = z.object({
  width: z.number(),
  height: z.number(),
})
export type Size = z.infer<typeof SizeSchema>

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
})
export type Point = z.infer<typeof PointSchema>

export const RectangleSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})
export type Rectangle = z.infer<typeof RectangleSchema>

export function unionRect(a: Rectangle, b: Rectangle): Rectangle {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const width = Math.max(a.x + a.width, b.x + b.width) - x
  const height = Math.max(a.y + a.height, b.y + b.height) - y
  return { x, y, width, height }
}

export function intersectRect(a: Rectangle, b: Rectangle): Rectangle | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const width = Math.min(a.x + a.width, b.x + b.width) - x
  const height = Math.min(a.y + a.height, b.y + b.height) - y

  if (width <= 0 || height <= 0) {
    return null
  }

  return { x, y, width, height }
}

export function isPointInRect(point: Point, rect: Rectangle): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  )
}

export function rectWidth(rect: Rectangle): number {
  return rect.width
}

export function rectHeight(rect: Rectangle): number {
  return rect.height
}

export function sizeToRect(size: Size): Rectangle {
  return { x: 0, y: 0, width: size.width, height: size.height }
}
