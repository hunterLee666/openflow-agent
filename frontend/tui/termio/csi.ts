export function cursorUp(n = 1): string {
  return n > 1 ? `\x1b[${n}A` : "\x1b[A"
}

export function cursorDown(n = 1): string {
  return n > 1 ? `\x1b[${n}B` : "\x1b[B"
}

export function cursorForward(n = 1): string {
  return n > 1 ? `\x1b[${n}C` : "\x1b[C"
}

export function cursorBack(n = 1): string {
  return n > 1 ? `\x1b[${n}D` : "\x1b[D"
}

export function cursorTo(x: number, y?: number): string {
  if (y !== undefined) {
    return `\x1b[${y + 1};${x + 1}H`
  }
  return `\x1b[${x + 1}G`
}

export function cursorHome(): string {
  return "\x1b[H"
}

export function cursorSave(): string {
  return "\x1b7"
}

export function cursorRestore(): string {
  return "\x1b8"
}

export function cursorHide(): string {
  return "\x1b[?25l"
}

export function cursorShow(): string {
  return "\x1b[?25h"
}

export function eraseDisplay(): string {
  return "\x1b[2J"
}

export function eraseLine(): string {
  return "\x1b[2K"
}

export function scrollUp(n = 1): string {
  return `\x1b[${n}S`
}

export function scrollDown(n = 1): string {
  return `\x1b[${n}T`
}
