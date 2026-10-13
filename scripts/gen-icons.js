/**
 * scripts/gen-icons.js
 * يولّد أيقونات PWA من public/brand/logo.png
 * تشغيل: node scripts/gen-icons.js
 */
import sharp from 'sharp';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC  = join(__dirname, '../public/brand/logo.png');
const DEST = join(__dirname, '../public/brand');

// ألوان خلفية الثيم (كريم)
const BG = { r: 244, g: 235, b: 221, alpha: 1 };

const icons = [
  { file: 'icon-192.png',        size: 192, maskable: false },
  { file: 'icon-512.png',        size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true  },
];

for (const { file, size, maskable } of icons) {
  let pipeline = sharp(SRC);
  if (maskable) {
    // padding 15% على كل جانب للـ maskable
    const inner   = Math.round(size * 0.70);
    const padding = Math.round(size * 0.15);
    pipeline = sharp(SRC)
      .resize(inner, inner, { fit: 'contain', background: BG })
      .extend({ top: padding, bottom: padding, left: padding, right: padding, background: BG });
  } else {
    pipeline = sharp(SRC)
      .resize(size, size, { fit: 'contain', background: { ...BG, alpha: 0 } });
  }
  await pipeline.png().toFile(join(DEST, file));
  console.log(`✅  ${file}  (${size}×${size}${maskable ? ' maskable' : ''})`);
}

// Favicon 32 و 48
await sharp(SRC).resize(32, 32).png().toFile(join(__dirname, '../public/favicon.png'));
await sharp(SRC).resize(48, 48).png().toFile(join(__dirname, '../public/favicon-48.png'));
console.log('✅  favicon.png + favicon-48.png');
console.log('\n🎉  جميع الأيقونات جاهزة!');
