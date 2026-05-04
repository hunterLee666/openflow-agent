export type CanUseToolFn = (
  tool: any,
  input: any,
  context: any,
  assistantMessage?: any,
) => Promise<{ result: boolean; message?: string }>;