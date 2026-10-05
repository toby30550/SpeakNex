/**
 * Generate logo.ico from logo.png
 * 
 * Creates a multi-resolution Windows .ico file containing
 * PNG-compressed entries (supported on Windows Vista and later).
 * 
 * Usage: node scripts/make-ico.js [source.png] [output.ico]
 */

const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function makeIco(srcPath, outPath) {
  const image = await Jimp.read(srcPath);
  
  const entries = [];
  
  for (const size of SIZES) {
    const clone = image.clone();
    clone.contain(size, size, Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE);
    clone.background(0x00000000);
    
    const buffer = await clone.getBufferAsync(Jimp.MIME_PNG);
    entries.push({
      size,
      data: buffer
    });
  }
  
  // Build ICO file
  // ICONDIR header: reserved(2) + type(2) + count(2)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);       // reserved
  header.writeUInt16LE(1, 2);       // type = 1 (icon)
  header.writeUInt16LE(entries.length, 4);
  
  // Each ICONDIRENTRY is 16 bytes
  const dirSize = 16 * entries.length;
  let offset = 6 + dirSize;
  
  const dirEntries = [];
  const dataChunks = [];
  
  for (const entry of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = entry.size >= 256 ? 0 : entry.size;  // width (0 = 256)
    dir[1] = entry.size >= 256 ? 0 : entry.size;  // height (0 = 256)
    dir[2] = 0;        // color count (0 = truecolor)
    dir[3] = 0;        // reserved
    dir.writeUInt16LE(1, 4);  // color planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(entry.data.length, 8);  // data size
    dir.writeUInt32LE(offset, 12);            // data offset
    
    dirEntries.push(dir);
    dataChunks.push(entry.data);
    
    offset += entry.data.length;
  }
  
  const ico = Buffer.concat([header, ...dirEntries, ...dataChunks]);
  fs.writeFileSync(outPath, ico);
  
  console.log(`Created ${outPath}`);
  console.log(`  Sizes: ${SIZES.join(', ')} px`);
  console.log(`  Entries: ${entries.length}`);
  console.log(`  Total size: ${ico.length} bytes`);
}

const src = process.argv[2] || path.join(__dirname, '..', 'logo.png');
const out = process.argv[3] || path.join(__dirname, '..', 'logo.ico');

makeIco(src, out).catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
