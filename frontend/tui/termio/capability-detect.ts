export interface TerminalCapability {
  trueColor: boolean
  unicode: boolean
  mouse: boolean
  bracketedPaste: boolean
  kittyKeyboard: boolean
  synchronizedOutput: boolean
  hyperlinks: boolean
}

export function detectCapabilities(): TerminalCapability {
  const term = process.env.TERM ?? ""
  const colorterm = process.env.COLORTERM ?? ""

  return {
    trueColor: colorterm.includes("truecolor") || colorterm.includes("24bit"),
    unicode: !term.includes("linux"),
    mouse: true,
    bracketedPaste: true,
    kittyKeyboard: false,
    synchronizedOutput: true,
    hyperlinks: true,
  }
}

export function enableBracketedPaste(): string {
  return "\x1b[?2004h"
}

export function disableBracketedPaste(): string {
  return "\x1b[?2004l"
}

export function enableMouse(): string {
  return "\x1b[?1002h\x1b[?1006h"
}

export function disableMouse(): string {
  return "\x1b[?1002l\x1b[?1006l"
}

export function enableSynchronizedOutput(): string {
  return "\x1b[?2026h"
}

export function disableSynchronizedOutput(): string {
  return "\x1b[?2026l"
}

export function enableKittyKeyboard(): string {
  return "\x1b[>0u"
}

export function disableKittyKeyboard(): string {
  return "\x1b[<u"
}
