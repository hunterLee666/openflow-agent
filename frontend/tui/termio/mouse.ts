export interface MouseEvent {
  x: number
  y: number
  button: "left" | "middle" | "right" | "wheelUp" | "wheelDown"
  modifiers: {
    shift: boolean
    meta: boolean
    ctrl: boolean
  }
  type: "press" | "release" | "drag" | "move"
}

export function parseSGRMouse(data: string): MouseEvent | null {
  const match = data.match(/<(\d+);(\d+);(\d+)([Mm])/)
  if (!match) return null

  const buttonCode = parseInt(match[1], 10)
  const x = parseInt(match[2], 10) - 1
  const y = parseInt(match[3], 10) - 1
  const isRelease = match[4] === "m"

  const button = getButton(buttonCode)
  const type = isRelease ? "release" : button === "wheelUp" || button === "wheelDown" ? "press" : "press"

  return {
    x,
    y,
    button,
    modifiers: {
      shift: (buttonCode & 4) !== 0,
      meta: (buttonCode & 8) !== 0,
      ctrl: (buttonCode & 16) !== 0,
    },
    type,
  }
}

function getButton(code: number): MouseEvent["button"] {
  const base = code & 3
  const hasWheel = code & 64

  if (hasWheel) {
    if (base === 0) return "wheelUp"
    if (base === 1) return "wheelDown"
  }

  switch (base) {
    case 0:
      return "left"
    case 1:
      return "middle"
    case 2:
      return "right"
    default:
      return "left"
  }
}
