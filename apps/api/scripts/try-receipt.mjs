// Reads one real receipt photo with Gemini and prints the result.
// Used to measure accuracy for the report (KAN-33). Each run uses 1 of the free daily requests.
//   npm run build -w apps/api
//   node --env-file=apps/api/.env apps/api/scripts/try-receipt.mjs path/to/receipt.jpg [save-raw.json]
// The optional second path saves Gemini's raw answer, e.g. as a test fixture.
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { createOcrService } from '../dist/ocr/ocr.factory.js';

const photo = process.argv[2];
if (!photo) {
  console.error('Usage: node try-receipt.mjs <photo.jpg|photo.png>');
  process.exit(1);
}
const types = { '.png': 'image/png', '.webp': 'image/webp' };
const mimeType = types[extname(photo).toLowerCase()] ?? 'image/jpeg';

const ocr = createOcrService({ ...process.env, OCR_PROVIDER: 'gemini' });
const started = Date.now();
try {
  const { raw, ...result } = await ocr.extract(await readFile(photo), mimeType);
  if (process.argv[3]) {
    await writeFile(process.argv[3], JSON.stringify(raw, null, 2) + '\n');
  }
  const itemsSum = result.items.reduce(
    (s, i) => s + i.unitPriceCents * i.quantity,
    0,
  );
  console.log(JSON.stringify(result, null, 2));
  console.log(
    `items sum ${itemsSum} vs subtotal ${result.subtotalCents ?? 'not shown'}`,
  );
} catch (error) {
  console.error(`Failed: ${error.status ?? ''} ${error.message}`);
}
console.log(`took ${Date.now() - started} ms`);
