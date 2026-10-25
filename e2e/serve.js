// Serves the folder as static files for the tests, like GitHub Pages does. Python's http.server drops
// connections when several test browsers load pages at once, so this is a tiny Node server instead.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.PORT ?? 4173)
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (path.endsWith('/')) path += 'index.html'
  try {
    const body = await readFile(join(ROOT, path))
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('Not found')
  }
}).listen(PORT, '127.0.0.1')
