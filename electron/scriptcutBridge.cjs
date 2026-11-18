// Local HTTP bridge for the "Script Clip Finder" Chrome extension's
// "Send to Editor" button. Listens ONLY on 127.0.0.1 (never on the
// network, never reachable from another machine) and only ever receives
// clip METADATA over this connection - a video id, title, a start/end
// timestamp range, a match score. It never receives or fetches actual
// video bytes. The renderer (see the scriptcut-bridge effect in App.jsx)
// turns every incoming clip into the exact same reference-only
// "youtube-reference" marker clip the in-app Footage Finder already
// creates - a thumbnail, a clickable timestamp link, and the existing
// "replace with licensed footage before final export" notice. This
// bridge does not download, proxy, or embed real YouTube video content.
const http = require('node:http')

const SCRIPTCUT_BRIDGE_PORT = 53217
const MAX_BODY_BYTES = 2 * 1024 * 1024 // 2MB - generous for a JSON clip list, bounded against abuse

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function sendJson(res, status, body) {
  withCors(res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function startScriptcutBridge(onImportClips) {
  const server = http.createServer((req, res) => {
    const url = req.url || ''

    if (req.method === 'OPTIONS') {
      withCors(res)
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && url === '/scriptcut/ping') {
      sendJson(res, 200, { ok: true, app: 'video-editor', name: 'Video Editor' })
      return
    }

    if (req.method === 'POST' && url === '/scriptcut/import') {
      let received = 0
      const chunks = []
      req.on('data', (chunk) => {
        received += chunk.length
        if (received > MAX_BODY_BYTES) {
          req.destroy()
          sendJson(res, 413, { ok: false, error: 'Payload too large' })
        } else {
          chunks.push(chunk)
        }
      })
      req.on('end', () => {
        if (res.writableEnded) return
        let payload
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          sendJson(res, 400, { ok: false, error: 'Invalid JSON body' })
          return
        }
        const clips = Array.isArray(payload?.clips) ? payload.clips : []
        if (!clips.length) {
          sendJson(res, 400, { ok: false, error: 'No clips in payload' })
          return
        }
        onImportClips(clips)
        sendJson(res, 200, { ok: true, received: clips.length })
      })
      return
    }

    sendJson(res, 404, { ok: false, error: 'Not found' })
  })

  server.on('error', (error) => {
    // Most likely EADDRINUSE from a second app instance - fail quietly,
    // the editor works fine without the bridge, it just means the
    // extension's "Send to Editor" won't reach this instance.
    console.error('[scriptcut-bridge] failed to start:', error.message)
  })

  server.listen(SCRIPTCUT_BRIDGE_PORT, '127.0.0.1')
  return server
}

module.exports = { startScriptcutBridge, SCRIPTCUT_BRIDGE_PORT }
