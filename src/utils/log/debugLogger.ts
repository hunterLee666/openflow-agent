// Debug logger (simplified)
export function initDebugLogger(): void {}
export function getDebugLogger(_name?: string): any {
  return debug;
}
export function markPhase(_phase: string): void {}
export function getCurrentRequest(): any { return null; }
export function logLLMInteraction(_request: any, _response: any): void {}
export function logSystemPromptConstruction(_prompt: any): void {}
export function logErrorWithDiagnosis(_error: any, _context: any): void {}
export function logAPIError(_error: any): void {}
export function state(..._args: any[]): void {}
export function warn(..._args: any[]): void {}
export function api(..._args: any[]): void {}

// The debug logger object (callable function with extra methods)
const debug = (..._args: any[]) => {};
(debug as any).api = (..._args: any[]) => {};
(debug as any).state = (..._args: any[]) => {};
(debug as any).warn = (..._args: any[]) => {};
(debug as any).error = (..._args: any[]) => {};
(debug as any).log = (..._args: any[]) => {};
(debug as any).debug = (..._args: any[]) => {};

export { debug };
