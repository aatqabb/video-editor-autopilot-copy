// Manual caption/subtitle helpers: timestamp formatting, SRT/VTT export, and a
// simple heuristic segment-splitter used when captions are typed as one block
// of text instead of line-by-line.

export function formatSrtTimestamp(totalSeconds) {
  const clamped = Math.max(0, Number(totalSeconds) || 0)
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const seconds = Math.floor(clamped % 60)
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000)
  const pad2 = (value) => String(value).padStart(2, '0')
  const pad3 = (value) => String(value).padStart(3, '0')
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(millis)}`
}

export function formatVttTimestamp(totalSeconds) {
  return formatSrtTimestamp(totalSeconds).replace(',', '.')
}

export function parseTimestampInput(value) {
  const text = String(value || '').trim()
  if (!text) return 0
  if (/^-?\d+(\.\d+)?$/.test(text)) return Math.max(0, Number(text))
  const match = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/)
  if (!match) return 0
  const [, hh, mm, ss, ms] = match
  const hours = Number(hh || 0)
  const minutes = Number(mm || 0)
  const seconds = Number(ss || 0)
  const millis = Number((ms || '0').padEnd(3, '0'))
  return hours * 3600 + minutes * 60 + seconds + millis / 1000
}

export function formatClockLabel(totalSeconds) {
  const clamped = Math.max(0, Number(totalSeconds) || 0)
  const minutes = Math.floor(clamped / 60)
  const seconds = (clamped % 60).toFixed(2)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(5, '0')}`
}

export function buildSrt(segments) {
  return segments
    .map((segment, index) => (
      `${index + 1}\n${formatSrtTimestamp(segment.start)} --> ${formatSrtTimestamp(segment.end)}\n${segment.text || ''}\n`
    ))
    .join('\n')
    .trim() + '\n'
}

export function buildVtt(segments) {
  const body = segments
    .map((segment) => (
      `${formatVttTimestamp(segment.start)} --> ${formatVttTimestamp(segment.end)}\n${segment.text || ''}\n`
    ))
    .join('\n')
    .trim()
  return `WEBVTT\n\n${body}\n`
}

export function makeSegmentId() {
  return `cap-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

// Splits a longer caption line into shorter reading chunks (used when the
// user pastes a whole sentence for one marked timestamp range) by simply
// dividing the time range proportionally across words-per-chunk groups.
export function splitSegmentIntoChunks(segment, wordsPerChunk = 8) {
  const words = String(segment.text || '').trim().split(/\s+/).filter(Boolean)
  if (words.length <= wordsPerChunk) return [segment]
  const chunks = []
  for (let i = 0; i < words.length; i += wordsPerChunk) chunks.push(words.slice(i, i + wordsPerChunk).join(' '))
  const duration = Math.max(0.01, segment.end - segment.start)
  return chunks.map((text, index) => ({
    id: makeSegmentId(),
    start: segment.start + (duration * index) / chunks.length,
    end: segment.start + (duration * (index + 1)) / chunks.length,
    text,
  }))
}

// Groups word-level AI transcription timestamps (Whisper's
// `return_timestamps: 'word'` mode — one chunk per WORD) back into readable
// caption lines, while keeping each line's own per-word timing attached as
// `words` (absolute seconds, same convention as segment.start/end) so the
// karaoke word-highlight has real spoken-word timing to work from. A line
// breaks on a long pause (someone taking a breath / sentence boundary) or
// once it reaches maxWords / maxChars, whichever comes first.
export function groupWordsIntoLines(words, { maxWords = 9, maxChars = 46, maxGapSeconds = 0.6 } = {}) {
  const clean = (words || [])
    .map((word) => ({ text: String(word.text || '').trim(), start: Number(word.start) || 0, end: Number(word.end) || 0 }))
    .filter((word) => word.text)
  if (!clean.length) return []

  const lines = []
  let current = []
  const flush = () => {
    if (!current.length) return
    lines.push({
      id: makeSegmentId(),
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((word) => word.text).join(' '),
      words: current,
    })
    current = []
  }

  for (const word of clean) {
    const previous = current[current.length - 1]
    const gap = previous ? word.start - previous.end : 0
    const wouldBeChars = current.map((w) => w.text).concat(word.text).join(' ').length
    if (previous && (gap > maxGapSeconds || current.length >= maxWords || wouldBeChars > maxChars)) flush()
    current.push(word)
  }
  flush()
  return lines
}

// Manually-typed captions have no real per-word timing (only one start/end
// for the whole line), so when word-highlight is turned on for those lines
// we estimate one: each word gets a slice of the line's duration
// proportional to its own character count (a longer word takes a bit more
// of the timeline than "a" or "I"), placed back-to-back with no gaps. It
// won't be frame-accurate like real Whisper timestamps, but it tracks
// noticeably better than splitting the duration evenly by word count.
export function estimateWordTimings(text, start, end) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  const safeStart = Number(start) || 0
  const safeEnd = Math.max(safeStart + 0.05, Number(end) || safeStart + 0.05)
  const duration = safeEnd - safeStart
  const weights = words.map((word) => word.length + 1)
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1
  let cursor = safeStart
  return words.map((word, index) => {
    const span = (weights[index] / totalWeight) * duration
    const wordStart = cursor
    const wordEnd = index === words.length - 1 ? safeEnd : cursor + span
    cursor = wordEnd
    return { text: word, start: wordStart, end: wordEnd }
  })
}

// Saves a text file to disk using the File System Access API when available
// (same technique already used by projectPersistence.js for .vedit.json
// project files), falling back to a Blob download link otherwise.
export async function saveTextFile(content, suggestedName, mimeType = 'text/plain') {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'Subtitle File', accept: { [mimeType]: [`.${suggestedName.split('.').pop()}`] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return { method: 'picker' }
    } catch (error) {
      if (error?.name === 'AbortError') return { method: 'cancelled' }
      // Fall through to the download-link approach below.
    }
  }
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = suggestedName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return { method: 'download' }
}
