import { posix } from 'node:path';

// Links in qa/*.md are relative to qa/ (KAN-102). On the published site, pages
// and files copied there stay on the site; anything else in the repo opens on
// GitHub at the same commit (`blob` is the repo URL plus /blob/<commit>).
const onSite: Record<string, string> = {
  'qa/qa-report.md': 'index.html',
  'qa/ocr-accuracy.md': 'receipts.html',
};

export function siteLink(href: string, blob: string): string {
  if (/^([a-z]+:|#)/i.test(href)) return href; // https:, mailto: or a heading
  const [path, hash] = href.split('#');
  const file = posix.normalize(posix.join('qa', path));
  const anchor = hash ? `#${hash}` : '';
  if (onSite[file]) return onSite[file] + anchor;
  if (file.startsWith('qa/results/')) return file.slice('qa/'.length) + anchor;
  return `${blob}/${file}${anchor}`;
}
