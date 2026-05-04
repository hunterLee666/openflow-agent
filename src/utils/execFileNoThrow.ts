export async function execFileNoThrow(
  _file: string,
  _args: string[],
  _options?: any,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return { stdout: '', stderr: 'Not implemented', code: 0 };
}