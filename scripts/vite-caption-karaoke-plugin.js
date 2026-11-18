// Word-by-word karaoke caption highlight in the Program Monitor: the word
// currently being spoken pops into a highlight color (or a highlight
// background box), while the rest of the line stays the base color — the
// short-form-style caption look explainerchannel asked for, on top of the
// existing Fade/Slide/Zoom/... entrance-exit animations (those still apply
// to the whole line; this is an independent, additional per-word effect).
// Word timing comes from CaptionWorkspace.jsx: real Whisper word timestamps
// when captions were AI-transcribed, or an estimated per-character split
// for manually-typed lines (captionEditor.js's estimateWordTimings) — either
// way it arrives as segment.words (absolute seconds) and is converted to
// clip-local seconds here in addCaptionsToTimeline.
// Runs after monitorGuidesPlugin in the pre-enforced chain, so its needles
// match that already-transformed code.
export function captionKaraokePlugin() {
  return {
    name: 'video-editor-caption-karaoke',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replaceAll('\\', '/')
      if (!normalized.endsWith('/src/App.jsx')) return null

      let next = code
      const applied = new Set()
      const replaceOnce = (name, needle, replacement) => {
        if (!next.includes(needle)) return
        next = next.replace(needle, replacement)
        applied.add(name)
      }

      replaceOnce("caption-highlight-color-var", "      background: backgroundColor,", "      background: backgroundColor,\n      '--caption-highlight-color': style.highlightColor || '#ffd400',")
      replaceOnce("caption-karaoke-words-derive", "\n  const backgroundSize = Math.max(0, Number(style.backgroundSize) || 0)\n  const backgroundOpacity = style.backgroundOpacity === undefined ? 100 : Number(style.backgroundOpacity)\n  const backgroundColor = scaleBackgroundAlpha(style.background, backgroundOpacity)\n\n  return {\n    text: displayText,\n    style: {", "\n  const backgroundSize = Math.max(0, Number(style.backgroundSize) || 0)\n  const backgroundOpacity = style.backgroundOpacity === undefined ? 100 : Number(style.backgroundOpacity)\n  const backgroundColor = scaleBackgroundAlpha(style.background, backgroundOpacity)\n\n  // Word-by-word karaoke highlight: when this text/caption clip carries\n  // style.karaokeWords (real Whisper word timestamps for AI-transcribed\n  // captions, or an estimated proportional split for manually-typed ones —\n  // see captionEditor.js) and the highlight toggle is on, split the line\n  // into per-word spans so JSX can show which word is being spoken right\n  // now, instead of one flat string. The entrance/exit animation above\n  // still applies to the whole overlay as normal — the two are independent.\n  const karaokeWords = style.wordHighlight && Array.isArray(style.karaokeWords) && style.karaokeWords.length\n    ? style.karaokeWords.map((word) => ({ text: word.text, active: local >= word.start && local < word.end }))\n    : null\n\n  return {\n    text: displayText,\n    words: karaokeWords,\n    style: {")
      replaceOnce("caption-karaoke-words-render", "              {presentation.text}", "              {presentation.words ? presentation.words.map((word, wordIndex) => (\n                <span key={wordIndex} className={'caption-word' + (word.active ? ' caption-word-active' : '') + (word.active && clip.textStyle?.highlightMode === 'box' ? ' caption-word-box' : '')}>{word.text}{wordIndex < presentation.words.length - 1 ? ' ' : ''}</span>\n              )) : presentation.text}")
      replaceOnce("caption-clip-karaoke-words", "    const newClips = validSegments.map((segment, index) => {\n      const duration = Math.max(.4, (Number(segment.end) || 0) - (Number(segment.start) || 0))\n      return {\n        id: `caption-${Date.now()}-${index}`,\n        trackId: track.id,\n        name: segment.text.trim().slice(0, 40) || 'Caption',\n        type: 'video',\n        kind: 'text',\n        start: Math.max(0, Math.min(timelineSeconds - duration, Number(segment.start) || 0)),\n        duration,\n        color: 'title',\n        text: segment.text.trim(),\n        textStyle: { ...captionStyle, duration },\n      }\n    })", "    const newClips = validSegments.map((segment, index) => {\n      const duration = Math.max(.4, (Number(segment.end) || 0) - (Number(segment.start) || 0))\n      const segmentStart = Number(segment.start) || 0\n      // Per-clip word timing for the karaoke highlight: stored on the\n      // segment as ABSOLUTE seconds (same convention as segment.start/end —\n      // real Whisper word timestamps, or the estimated fallback for\n      // manually-typed lines, see captionEditor.js), converted here to\n      // seconds relative to THIS clip's own start so it lines up with\n      // (playhead - clip.start) at render time.\n      const karaokeWords = Array.isArray(segment.words) ? segment.words.map((word) => ({\n        text: word.text,\n        start: Math.max(0, (Number(word.start) || 0) - segmentStart),\n        end: Math.max(0, (Number(word.end) || 0) - segmentStart),\n      })) : undefined\n      return {\n        id: `caption-${Date.now()}-${index}`,\n        trackId: track.id,\n        name: segment.text.trim().slice(0, 40) || 'Caption',\n        type: 'video',\n        kind: 'text',\n        start: Math.max(0, Math.min(timelineSeconds - duration, Number(segment.start) || 0)),\n        duration,\n        color: 'title',\n        text: segment.text.trim(),\n        textStyle: { ...captionStyle, duration, karaokeWords },\n      }\n    })")

      const required = ["caption-highlight-color-var", "caption-karaoke-words-derive", "caption-karaoke-words-render", "caption-clip-karaoke-words"]
      const missing = required.filter((name) => !applied.has(name))
      if (missing.length) throw new Error(`Caption karaoke patch did not apply: ${missing.join(', ')}`)

      return { code: next, map: null }
    },
  }
}
