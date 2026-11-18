// Wires the "Script Clip Finder" Chrome extension's local HTTP bridge
// (see electron/scriptcutBridge.cjs + main.cjs + preload.cjs) into the
// timeline. The bridge only ever forwards clip METADATA - video id, title,
// a start/end timestamp, a match score - never actual video bytes, so this
// effect maps each incoming clip onto the exact same addFootageReferenceToTimeline
// call Footage Finder already uses: a reference-only "youtube-reference"
// marker clip (thumbnail + clickable timestamp link + the existing
// "replace with licensed footage before final export" notice). Runs after
// captionKaraokePlugin in the pre-enforced chain, so its needle matches
// that already-transformed code.
export function scriptcutBridgePlugin() {
  return {
    name: 'video-editor-scriptcut-bridge',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.replaceAll('\\', '/')
      if (!normalized.endsWith('/src/App.jsx')) return null

      const needle = "    setSelectedClipIds([id])\n    notify('YouTube reference added — replace with licensed footage before final export')\n  }\n\n  const getProjectDocument = () => buildProjectDocument({"
      if (!code.includes(needle)) throw new Error('Scriptcut bridge patch could not find addFootageReferenceToTimeline insertion point')

      const next = code.replace(needle, "    setSelectedClipIds([id])\n    notify('YouTube reference added — replace with licensed footage before final export')\n  }\n\n  // Receives clips from the \"Script Clip Finder\" Chrome extension's local\n  // HTTP bridge (electron/scriptcutBridge.cjs). Only ever metadata in -\n  // video id, title, a timestamp range, a match score - never real video\n  // bytes, so every incoming clip becomes the exact same reference-only\n  // youtube-reference marker Footage Finder already creates: a thumbnail,\n  // a clickable timestamp link, and the same \"replace with licensed\n  // footage before final export\" notice. This bridge never fetches or\n  // embeds the actual YouTube video content.\n  const addFootageReferenceToTimelineRef = useRef(addFootageReferenceToTimeline)\n  addFootageReferenceToTimelineRef.current = addFootageReferenceToTimeline\n\n  useEffect(() => {\n    const unsubscribe = window.videoEditorDesktop?.onScriptcutImport?.((incomingClips) => {\n      if (!Array.isArray(incomingClips) || !incomingClips.length) return\n      incomingClips.forEach((clip) => {\n        addFootageReferenceToTimelineRef.current({\n          videoId: clip.videoId,\n          title: clip.videoTitle || clip.title || 'Untitled video',\n          thumbnail: clip.thumbnail || (clip.videoId ? `https://i.ytimg.com/vi/${clip.videoId}/mqdefault.jpg` : ''),\n          pageUrl: clip.urlWithTimestamp || clip.videoUrl || clip.pageUrl,\n          start: Number(clip.startSeconds ?? clip.start) || 0,\n          end: Number(clip.endSeconds ?? clip.end) || 0,\n          matchScore: clip.matchScore,\n        }, `scriptcut-${clip.segmentIndex ?? ''}`)\n      })\n      notify(`${incomingClips.length} clip(s) received from Script Clip Finder`)\n    })\n    return () => unsubscribe?.()\n  }, [])\n\n  const getProjectDocument = () => buildProjectDocument({")
      return { code: next, map: null }
    },
  }
}
