// Any-XML timeline import.
//
// Accepts FCPXML (Final Cut Pro, e.g. the Lawn Minute 1 v5 file), Premiere
// Pro xmeml, and generic timeline XML. Parses clips, order, start/duration,
// track/layer and media references, and returns them in the editor's own
// clip shape so App.jsx can rebuild them on the timeline.
//
// Media bundling: a browser/Electron renderer cannot read arbitrary disk
// paths named inside an XML file, so the import picker accepts the XML file
// together with its media files in one selection (Ctrl-click them all).
// Every media file the user picks with the XML is matched by file name and
// attached to its clip as a real project asset (blob URL for preview plus,
// in Electron, the real on-disk path via getPathForFile, which survives in
// the saved project file). Media named in the XML but not picked is kept as
// a placeholder clip with mediaRelinkRequired so the timeline structure is
// still rebuilt, and is named in the import report.

export function parseFcpTime(value, fps = 30) {
  if (value === null || value === undefined || value === '') return 0
  const text = String(value).trim()
  // Timecode HH:MM:SS:FF
  const tc = text.match(/^(\d+):(\d+):(\d+)[:;](\d+)$/)
  if (tc) {
    return Number(tc[1]) * 3600 + Number(tc[2]) * 60 + Number(tc[3]) + Number(tc[4]) / fps
  }
  // Rational frames "120/30s" or "1800/30s"
  const rational = text.match(/^([\d.]+)\/([\d.]+)s?$/)
  if (rational) return Number(rational[1]) / Number(rational[2])
  // Plain seconds "4s", "3.5s", "90"
  const seconds = text.match(/^([\d.]+)s?$/)
  if (seconds) return Number(seconds[1])
  const asNumber = Number(text)
  return Number.isFinite(asNumber) ? asNumber : 0
}

export function decodeFileUrl(src) {
  if (!src) return ''
  let text = String(src).trim()
  try { text = decodeURIComponent(text) } catch { /* keep raw */ }
  text = text.replace(/^file:\/\/(localhost)?/i, '')
  // Windows file:///C:/path -> C:/path
  if (/^\/[A-Za-z]:\//.test(text)) text = text.slice(1)
  return text
}

export function baseName(path) {
  if (!path) return ''
  const clean = String(path).replace(/\\/g, '/')
  return clean.split('/').filter(Boolean).pop() || clean
}

function attr(element, ...names) {
  if (!element) return ''
  for (const name of names) {
    const value = element.getAttribute?.(name)
    if (value !== null && value !== undefined && value !== '') return value
  }
  return ''
}

function childText(element, ...names) {
  if (!element) return ''
  for (const name of names) {
    const child = element.querySelector(`:scope > ${name}`)
    if (child?.textContent?.trim()) return child.textContent.trim()
  }
  return ''
}

function childNumber(element, ...names) {
  const text = childText(element, ...names)
  if (text === '') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function parseXmlDocument(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  const error = doc.querySelector('parsererror')
  if (error) throw new Error(`Could not read this XML file: ${error.textContent.slice(0, 200)}`)
  return doc
}

function fpsFromFormat(doc) {
  const format = doc.querySelector('format[frameDuration]')
  const frameDuration = attr(format, 'frameDuration')
  const match = frameDuration.match(/^1\/([\d.]+)s?$/)
  if (match) return Number(match[1]) || 30
  return 30
}

function formatFromDoc(doc) {
  const format = doc.querySelector('format[width][height]')
  if (!format) return {}
  const width = Number(attr(format, 'width'))
  const height = Number(attr(format, 'height'))
  return {
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    height: Number.isFinite(height) && height > 0 ? height : undefined,
  }
}

// --- FCPXML ---------------------------------------------------------------
function parseFcpxml(doc, fps) {
  const assets = new Map()
  doc.querySelectorAll('asset').forEach((asset) => {
    const id = attr(asset, 'id')
    if (!id) return
    const src = attr(asset, 'src') || attr(asset.querySelector('media-rep'), 'src')
    assets.set(id, {
      name: attr(asset, 'name') || baseName(src),
      src: decodeFileUrl(src),
      hasVideo: attr(asset, 'hasVideo') !== '0',
      hasAudio: attr(asset, 'hasAudio') === '1',
      duration: parseFcpTime(attr(asset, 'duration'), fps),
    })
  })

  const clips = []
  doc.querySelectorAll('asset-clip, clip').forEach((element) => {
    const ref = attr(element, 'ref')
    const asset = assets.get(ref) || {}
    const offset = parseFcpTime(attr(element, 'offset'), fps)
    const duration = parseFcpTime(attr(element, 'duration'), fps)
    const sourceIn = parseFcpTime(attr(element, 'start'), fps)
    if (!duration) return
    const lane = Number(attr(element, 'lane'))
    const role = (attr(element, 'role') || '').toLowerCase()
    const isAudio = lane < 0 || role === 'dialogue' || role === 'music' || role === 'audio'
      || (!asset.hasVideo && asset.hasAudio)
    const fullName = attr(element, 'name') || asset.name || 'Clip'
    clips.push({
      name: fullName.split('|')[0].trim() || fullName,
      note: fullName.includes('|') ? fullName.split('|').slice(1).join('|').trim() : '',
      start: offset,
      duration,
      sourceIn,
      type: isAudio ? 'audio' : 'video',
      trackIndex: isAudio ? 0 : (Number.isFinite(lane) && lane > 0 ? lane : 0),
      sourcePath: asset.src || '',
      sourceFileName: baseName(asset.src) || asset.name || '',
      role,
    })
  })
  return clips
}

// --- Premiere Pro xmeml ----------------------------------------------------
function parseXmeml(doc, fps) {
  const files = new Map()
  doc.querySelectorAll('file').forEach((file) => {
    const id = attr(file, 'id')
    const pathurl = childText(file, 'pathurl') || attr(file, 'pathurl')
    if (id) files.set(id, decodeFileUrl(pathurl))
  })

  const clips = []
  doc.querySelectorAll('media > video > track, media > audio > track').forEach((track, trackIndex) => {
    // parentNode (not parentElement) so this also works in non-browser DOMs.
    const isAudioTrack = String(track.parentNode?.tagName || '').toLowerCase() === 'audio'
    track.querySelectorAll(':scope > clipitem').forEach((item) => {
      const start = childNumber(item, 'start')
      const end = childNumber(item, 'end')
      const inPoint = childNumber(item, 'in') || 0
      const outPoint = childNumber(item, 'out')
      const duration = (start !== null && end !== null)
        ? end - start
        : (outPoint !== null ? outPoint - inPoint : parseFcpTime(attr(item, 'duration'), fps))
      if (!duration || duration <= 0) return
      // The <file> child's id attribute is the lookup key — its text is the
      // path, not the id, so read the attribute first.
      const fileEl = item.querySelector('file')
      const fileId = attr(fileEl, 'id') || childText(item, 'fileid')
      const src = files.get(fileId) || decodeFileUrl(childText(item, 'pathurl'))
      const name = childText(item, 'name') || attr(item, 'name') || baseName(src) || 'Clip'
      clips.push({
        name,
        note: '',
        start: start !== null ? start : 0,
        duration,
        sourceIn: inPoint,
        type: isAudioTrack ? 'audio' : 'video',
        trackIndex,
        sourcePath: src,
        sourceFileName: baseName(src) || name,
        role: '',
      })
    })
  })
  return clips
}

// --- Generic timeline XML --------------------------------------------------
// Any element that looks like a clip: <clip>, <clipitem>, <video>, <audio>
// or anything with start+duration (attributes or child elements) and a
// name or source.
function parseGeneric(doc, fps) {
  const clips = []
  const seen = new Set()
  doc.querySelectorAll('clip, clipitem, asset-clip, video-clip, audio-clip, segment, shot').forEach((element) => {
    if (seen.has(element)) return
    seen.add(element)
    const startAttr = parseFcpTime(attr(element, 'start', 'offset', 'begin'), fps)
    const startChild = childNumber(element, 'start', 'offset', 'begin')
    const start = startChild !== null ? startChild : startAttr
    const durationAttr = parseFcpTime(attr(element, 'duration', 'length'), fps)
    const durationChild = childNumber(element, 'duration', 'length')
    const endChild = childNumber(element, 'end')
    const duration = durationChild !== null ? durationChild
      : (endChild !== null ? endChild - start : durationAttr)
    if (!duration || duration <= 0) return
    const src = attr(element, 'src', 'file', 'path', 'url')
      || childText(element, 'src', 'file', 'path', 'url', 'pathurl')
    const tag = element.tagName.toLowerCase()
    const typeAttr = (attr(element, 'type', 'kind', 'role') || '').toLowerCase()
    const isAudio = tag === 'audio-clip' || typeAttr === 'audio' || typeAttr === 'music' || typeAttr === 'dialogue'
    const name = attr(element, 'name', 'title') || childText(element, 'name', 'title') || baseName(src) || 'Clip'
    clips.push({
      name,
      note: '',
      start,
      duration,
      sourceIn: parseFcpTime(attr(element, 'in', 'sourceIn'), fps) || (childNumber(element, 'in', 'sourceIn') || 0),
      type: isAudio ? 'audio' : 'video',
      trackIndex: Number(attr(element, 'lane', 'track', 'layer')) || 0,
      sourcePath: decodeFileUrl(src),
      sourceFileName: baseName(src) || name,
      role: typeAttr,
    })
  })
  return clips
}

export function parseXmlTimeline(text) {
  const doc = parseXmlDocument(text)
  const root = doc.documentElement.tagName.toLowerCase()
  const fps = fpsFromFormat(doc)
  const canvas = formatFromDoc(doc)

  let format = 'Generic XML'
  let clips = []
  if (root === 'fcpxml' || doc.querySelector('asset-clip')) {
    format = 'FCPXML'
    clips = parseFcpxml(doc, fps)
  } else if (root === 'xmeml' || doc.querySelector('sequence > media')) {
    format = 'Premiere Pro XML'
    clips = parseXmeml(doc, fps)
  }
  if (!clips.length) {
    clips = parseGeneric(doc, fps)
    if (clips.length && format === 'Generic XML') format = 'Generic XML'
  }
  if (!clips.length) {
    throw new Error('No clips found in this XML file — it does not look like a timeline/project file')
  }

  const projectName = attr(doc.querySelector('project'), 'name')
    || childText(doc.querySelector('sequence'), 'name')
    || attr(doc.querySelector('sequence'), 'name')
    || ''

  // Timeline order, earliest first within each track.
  clips.sort((a, b) => (a.type === b.type ? a.start - b.start : (a.type === 'video' ? -1 : 1)))
  return { format, fps, width: canvas.width, height: canvas.height, projectName, clips }
}

// Match picked media files to parsed clips by file name. Returns the clips
// with their matched File attached (or null when missing).
export function matchMediaFiles(parsedClips, mediaFiles = []) {
  const byName = new Map()
  ;[...mediaFiles].forEach((file) => {
    byName.set(file.name.toLowerCase(), file)
    byName.set(baseName(file.name).toLowerCase(), file)
  })
  return parsedClips.map((clip) => {
    const file = (clip.sourceFileName && byName.get(clip.sourceFileName.toLowerCase()))
      || (clip.name && byName.get(`${clip.name}.mp4`.toLowerCase()))
      || null
    return { ...clip, mediaFile: file || null }
  })
}
