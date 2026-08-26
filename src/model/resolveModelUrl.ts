export const MODEL_STORE = 'https://pub-25795629d417496fb6c539ab16b4e4f8.r2.dev/';

export function resolveModelUrl(source: string, modelStore = MODEL_STORE): string {
  const trimmed = source.trim();
  if (!trimmed || trimmed.startsWith('//')) throw new Error('Model URL is invalid.');

  const base = new URL(modelStore);
  const resolved = new URL(trimmed, base);
  if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
    throw new Error('Model URLs require http or https.');
  }
  if (!/\.glb$/i.test(resolved.pathname)) throw new Error('Model URL must reference a .glb file.');

  if (!URL.canParse(trimmed)) {
    const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
    if (resolved.origin !== base.origin || !resolved.pathname.startsWith(basePath)) {
      throw new Error('Relative model paths must remain inside MODEL_STORE.');
    }
  }
  return resolved.href;
}
