import { describe, expect, it } from 'vitest';
import { resolveModelUrl } from './resolveModelUrl';

describe('resolveModelUrl', () => {
  it('resolves store keys and preserves absolute remote URLs', () => {
    expect(resolveModelUrl('chairs/modern.glb', 'https://models.example/assets/')).toBe('https://models.example/assets/chairs/modern.glb');
    expect(resolveModelUrl('https://cdn.example/chair.glb?version=2')).toBe('https://cdn.example/chair.glb?version=2');
  });
  it.each(['../secret.glb', 'data:model/gltf-binary,x', '//evil.example/chair.glb', 'chair.gltf'])('rejects unsafe or unsupported source %s', (source) => {
    expect(() => resolveModelUrl(source, 'https://models.example/assets/')).toThrow();
  });
});
