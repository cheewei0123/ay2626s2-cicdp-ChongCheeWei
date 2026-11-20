import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pwaOptions } from './pwa.config.ts';

const publicDir = join(__dirname, 'public');

// Width and height from a PNG file's header (bytes 16-23)
function pngSize(path: string) {
  const b = readFileSync(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe('PWA config', () => {
  const manifest = pwaOptions.manifest || {};

  it('installs as a full-screen app called SplitLah', () => {
    expect(manifest.short_name).toBe('SplitLah');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(pwaOptions.registerType).toBe('autoUpdate');
  });

  it('has 192 and 512 icons and a maskable one, each a PNG of the size it claims', () => {
    const icons = manifest.icons || [];
    expect(icons.map((i) => i.sizes)).toEqual([
      '192x192',
      '512x512',
      '512x512',
    ]);
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of icons) {
      const file = join(publicDir, icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const [w, h] = icon.sizes!.split('x').map(Number);
      expect(pngSize(file)).toEqual({ w, h });
    }
  });

  it('has the 180x180 icon iPhones use for the home screen', () => {
    const file = join(publicDir, 'icons/apple-touch-icon-180x180.png');
    expect(pngSize(file)).toEqual({ w: 180, h: 180 });
    const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
    expect(html).toContain('href="/icons/apple-touch-icon-180x180.png"');
  });

  it('never caches /api, so money data is always fresh', () => {
    const wb = pwaOptions.workbox!;
    expect(wb.runtimeCaching).toBeUndefined();
    const deny = wb.navigateFallbackDenylist || [];
    expect(deny.some((re) => re.test('/api/bills/abc'))).toBe(true);
    expect(deny.some((re) => re.test('/bills/abc'))).toBe(false);
  });
});
