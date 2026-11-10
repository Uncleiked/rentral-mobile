import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../', import.meta.url))
const check = process.argv.includes('--check')
const { mark: rentralMark, colors } = JSON.parse(await readFile(resolve(root, 'lib/brand/identity.json'), 'utf8'))

function artwork({ background = false, scale = 1 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rentralMark.viewBox}" width="1024" height="1024"><title>Rentral</title>${background ? `<rect width="64" height="64" fill="${colors.background}"/>` : ''}<path d="${rentralMark.path}" fill="${colors.accent}" transform="translate(32 32) scale(${scale}) translate(-32 -32)"/></svg>\n`
}

async function output(relative, bytes) {
  const path = resolve(root, relative)
  if (check) {
    const expected = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    if (!(await readFile(path)).equals(expected)) throw new Error(`Regenerate the brand asset: ${relative}`)
    return
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
}

async function png(svg, size, opaque = false) {
  const bitmap = sharp(Buffer.from(svg)).resize(size, size)
  if (opaque) bitmap.removeAlpha()
  else bitmap.ensureAlpha()
  return bitmap.png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer()
}

const mark = artwork(), icon = artwork({ background: true })
await output('public/Rentral.svg', mark)
await output('app/icon.svg', icon)
await output('apps/mobile/assets/brand-mark.png', await png(mark, 512))
await output('apps/mobile/assets/icon.png', await png(icon, 1024, true))
// Fits Android's central 66dp safe circle on a 108dp canvas; the OS supplies the mask.
await output('apps/mobile/assets/adaptive-icon.png', await png(artwork({ scale: 0.68 }), 1024))

// ICO supports a PNG frame. Keep the conventional favicon URL consistent too.
// Next's ICO decoder requires the embedded PNG to have RGBA channels, even
// when every pixel is opaque. This is separate from the RGB-only iOS app icon.
const frame = await png(icon, 64)
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(1, 4)
header[6] = 64; header[7] = 64
header.writeUInt16LE(1, 10)
header.writeUInt16LE(32, 12)
header.writeUInt32LE(frame.length, 14)
header.writeUInt32LE(22, 18)
await output('app/favicon.ico', Buffer.concat([header, frame]))
console.log(`${check ? 'Verified' : 'Generated'} Rentral SVG, native mark, app/adaptive icons and favicon from lib/brand/identity.json.`)
