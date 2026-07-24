// Menulis public/validation-key.txt saat build, isinya diambil dari
// Environment Variable Vercel (PI_VALIDATION_KEY), supaya tiap project
// Vercel (mainnet & testnet) bisa punya key yang beda walau source code sama.
import { writeFileSync, existsSync, mkdirSync } from 'fs';

const key = process.env.PI_VALIDATION_KEY;

if (!key) {
  console.error('❌ ENV PI_VALIDATION_KEY belum diset di Vercel Project Settings > Environment Variables.');
  process.exit(1);
}

if (!existsSync('public')) mkdirSync('public');
writeFileSync('public/validation-key.txt', key.trim() + '\n');
console.log('✅ validation-key.txt ditulis (panjang key: ' + key.trim().length + ' karakter)');
