// Writes the PNG and ICO site icons from public/favicon.svg. Run by hand when
// the icon changes: node scripts/make-icons.mjs. The outputs are committed.
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url));
const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

writeFileSync(new URL('../public/apple-touch-icon.png', import.meta.url), await png(180));

// An ICO file holding 16, 32 and 48 pixel PNGs.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const at = 6 + 16 * i;
  header.writeUInt8(size, at);
  header.writeUInt8(size, at + 1);
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(images[i].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += images[i].length;
});
writeFileSync(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([header, ...images]));
console.log('Wrote public/apple-touch-icon.png and public/favicon.ico');
