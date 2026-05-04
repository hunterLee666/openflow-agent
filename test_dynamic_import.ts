try {
  const mod = await import('./src/engine/agentService.ts');
  console.log('loaded', Object.keys(mod));
} catch (e) {
  console.error('IMPORT ERROR', e);
}
