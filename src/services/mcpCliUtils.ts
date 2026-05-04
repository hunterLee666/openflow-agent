export function looksLikeMcpUrl(_str: string): boolean {
  return false;
}
export function normalizeMcpScopeForCli(_scope: string): string {
  return scope;
}
export function normalizeMcpTransport(_transport?: string): string | undefined {
  return _transport;
}
export function parseMcpHeaders(_headerLines: string[]): Record<string, string> {
  return {};
}
