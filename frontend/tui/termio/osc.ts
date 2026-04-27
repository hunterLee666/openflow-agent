export function setTitle(title: string): string {
  return `\x1b]0;${title}\x07`
}

export function setWorkingDirectory(dir: string): string {
  return `\x1b]7;file://${process.env.HOSTNAME ?? "localhost"}${dir}\x07`
}

export function setHyperlink(url: string, text: string): string {
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`
}

export function notify(title: string, body: string): string {
  return `\x1b]777;notify;${title};${body}\x07`
}
