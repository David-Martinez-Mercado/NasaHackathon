export default async function detenerBase(): Promise<void> {
  const base = (globalThis as any).__BASE_EMBEBIDA__ as { db: { close(): Promise<void> }; servidor: { stop(): Promise<void> } } | undefined;
  if (!base) return;
  await base.servidor.stop();
  await base.db.close();
}
