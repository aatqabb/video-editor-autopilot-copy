import fs from 'node:fs'
import { normalizeLineEndingsPlugin } from './normalize-line-endings-plugin.js'
import { stockWorkspacePlugin } from './vite-stock-workspace-plugin.js'
import { timelineRefactorPlugin } from './vite-timeline-refactor-plugin.js'
import { overlapReplacementPlugin } from './vite-overlap-replacement-plugin.js'
import { playbackMediaPlugin } from './vite-playback-media-plugin.js'
import { unlimitedTimelineImportPlugin } from './vite-unlimited-timeline-import-plugin.js'
import { durationUiSyncPlugin } from './vite-duration-ui-sync-plugin.js'
import { programPlaybackSyncPlugin } from './vite-program-playback-sync-plugin.js'
import { premierePlayheadPlugin } from './vite-premiere-playhead-plugin.js'
import { smoothTimelineDragPlugin } from './vite-smooth-timeline-drag-plugin.js'
import { trackDeletePlugin } from './vite-track-delete-plugin.js'
import { trackVisibilityUiPlugin } from './vite-track-visibility-ui-plugin.js'
import { programTransformOverlayPlugin } from './vite-program-transform-overlay-plugin.js'
import { monitorTransportPlugin } from './vite-monitor-transport-plugin.js'
import { trackHeaderPlugin } from './vite-track-header-plugin.js'
import { monitorGuidesPlugin } from './vite-monitor-guides-plugin.js'
import { captionKaraokePlugin } from './vite-caption-karaoke-plugin.js'

let code = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const id = '/repo/src/App.jsx'
for (const plugin of [
  normalizeLineEndingsPlugin(),
  stockWorkspacePlugin(),
  timelineRefactorPlugin(),
  overlapReplacementPlugin(),
  playbackMediaPlugin(),
  unlimitedTimelineImportPlugin(),
  durationUiSyncPlugin(),
  programPlaybackSyncPlugin(),
  premierePlayheadPlugin(),
  smoothTimelineDragPlugin(),
  trackDeletePlugin(),
  trackVisibilityUiPlugin(),
  programTransformOverlayPlugin(),
  monitorTransportPlugin(),
  trackHeaderPlugin(),
  monitorGuidesPlugin(),
  captionKaraokePlugin(),
]) {
  const result = plugin.transform?.(code, id)
  if (result?.code) code = result.code
}

const checks = [
  ['smooth clip pointer handler survives playhead transform', code.includes('const startClipPointerDrag = (event, clip) =>')],
  ['timeline clips use pointer drag wiring', code.includes('onPointerDown={(event) => startClipPointerDrag(event, clip)}')],
  ['native clip drag is disabled', code.includes('draggable={false}')],
  ['playhead uses window-level pointer drag loop', code.includes("window.addEventListener('pointermove', onMove, true)") && code.includes("window.addEventListener('pointerup', onUp, true)")],
  ['playhead drag does not depend on pointer capture', !code.includes('setPointerCapture?.(pointerId)') && !code.includes("addEventListener('lostpointercapture'" )],
  ['playhead release commits final pointer position', code.includes('setPlayhead(pointerToTime({ clientX: latestX }))')],
  ['dynamic timeline prop is wired', code.includes('timelineSeconds={timelineSeconds}')],
  ['timeline width uses dynamic duration', code.includes('const laneWidth = timelineSeconds * pixelsPerSecond')],
  ['media import creates fresh layer at playhead', code.includes('added on a new ${timelineType} layer at playhead')],
  ['video import creates linked audio layer', code.includes("kind: 'linked-video-audio'")],
  ['right trim has no fixed timeline cap', !code.includes('Math.min(timelineSeconds, proposedEnd)')],
  ['ruler follows real content end without 60-second tail', code.includes('const required = Math.max(10, contentEnd + 1, playhead + 1)') && !code.includes('contentEnd + 60')],
  ['program monitor receives live timeline duration', code.includes('timelineDuration={timelineSeconds}')],
  ['program monitor receives clip selection state', code.includes('selectedClipIds={selectedClipIds}') && code.includes('setSelectedClipIds={setSelectedClipIds}')],
  ['program monitor signature owns clip selection state', code.includes('selectedClipIds = []') && code.includes('setSelectedClipIds = () => {}')],
  ['program monitor keeps imported or stock video media live', code.includes('clip.remoteUrl || clip.localUrl || clip.originalUrl')],
  ['program monitor resize persists scale', code.includes('updateClipControls(activeVideo.id, { video: { scale:')],
  ['program monitor renders current / total duration', code.includes('${formatTime(playhead)} / ${formatTime(timelineDuration)}')],
  ['hard-coded monitor timecode is removed', !code.includes('<span>00:00:05:11</span>')],
  ['timeline receives setTracks for layer deletion', code.includes('setTracks={setTracks}')],
  ['track delete handler removes track clips and selection', code.includes('const deleteTrack = (trackId) =>') && code.includes("clip.trackId !== trackId") && code.includes('removedIds.has(id)')],
  ['each track exposes a delete layer control', code.includes('className="track-delete"') && code.includes('deleteTrack(track.id)')],
  ['new clip inserts replace older overlaps', code.includes('const addedIds = next.filter((clip) => !currentIds.has(clip.id))') && code.includes('replaceTimelineOverlaps(next, addedIds)')],
  ['video track show hide control is explicit', code.includes('track-visibility-toggle') && code.includes('track-visibility-state')],
  ['hidden track state reaches controls and lanes', code.includes("track-control ${track.hidden ? 'track-hidden'") && code.includes("${track.hidden ? 'track-hidden' : ''}`}")],
  ['real playback clock loops instead of only stopping at end', code.includes('if (loopPlayback && timelineSeconds > 0) return nextTime % timelineSeconds')],
  ['monitor receives a real setPlayhead so transport buttons can move it', code.includes('playhead={playhead} setPlayhead={setPlayhead} timelineDuration={timelineSeconds}')],
  ['monitor signature accepts transport state (setPlayhead, loop, safe margins)', code.includes('setPlayhead = () => {}, timelineDuration = 0') && code.includes('loopPlayback = false, setLoopPlayback = () => {}, safeMargins = false, setSafeMargins = () => {}')],
  ['placeholder monitor transport buttons are gone', !code.includes("{['|◀', '◀', playing ? '❚❚' : '▶', '▶', '▶|', '▣'].map((label, index) =>")],
  ['Go to Start / Step / Go to End buttons are wired to setPlayhead', code.includes('onClick={() => setPlayhead(0)}') && code.includes('onClick={() => setPlayhead(timelineDuration)}')],
  ['Loop and Safe Margins toggles exist on the transport row', code.includes('setLoopPlayback((value) => !value)') && code.includes('setSafeMargins((value) => !value)')],
  ['Safe margins overlay renders over the monitor screen when enabled', code.includes('monitor-safe-margins') && code.includes('safe-margin action') && code.includes('safe-margin title')],
  ['Export Frame captures the live video element to a PNG', code.includes("querySelector('.program-video-layer video')") && code.includes("'image/png'")],
  ['each track can be resized independently of the global track height', code.includes('const getTrackHeight = (track) => trackHeights[track.id] || trackHeight')],
  ['track resize handle is wired to a per-track drag', code.includes("onPointerDown={(event) => startTrackResize(event, track.id)}")],
  ['both the header and the lane use the resolved per-track height', code.split('style={{ height: getTrackHeight(track) }}').length - 1 === 2],
  ['tracks show a friendly Video/Audio name label', code.includes("<span className=\"track-name-label\">{track.type === 'video' ? 'Video' : 'Audio'}")],
  ['audio tracks get a voiceover shortcut hint', code.includes('track-voiceover-btn')],
  ['monitor tracks snap-guide state for drag feedback', code.includes('const [snapGuides, setSnapGuides] = useState({ x: false, y: false })')],
  ['dragging video snaps toward frame center and reports which axis snapped', code.includes('const snapX = Math.abs(posX - 50) < 3') && code.includes('setSnapGuides({ x: snapX, y: snapY })')],
  ['dragging text also snaps toward frame center', code.includes('const snapX = Math.abs(x - 50) < 3') && code.includes("setSnapGuides({ x: false, y: false })")],
  ['snap guides clear once the drag ends', code.split('setSnapGuides({ x: false, y: false })').length - 1 === 2],
  ['motion path is derived from real Position keyframes', code.includes('const positionXTrack = activeVideo?.video?.keyframes?.positionX') && code.includes('const motionPathPoints = (()')],
  ['blue center snap guide lines render over the monitor screen', code.includes('monitor-snap-guides') && code.includes('monitor-snap-guide vertical') && code.includes('monitor-snap-guide horizontal')],
  ['dotted motion path with keyframe dots renders over the monitor screen', code.includes('monitor-motion-path') && code.includes('<polyline') && code.includes('<circle')],
  ['karaoke word timing is only used when the highlight toggle is on', code.includes('style.wordHighlight && Array.isArray(style.karaokeWords) && style.karaokeWords.length')],
  ['each karaoke word knows whether it is the one being spoken right now', code.includes('active: local >= word.start && local < word.end')],
  ['text overlay renders per-word spans instead of one flat string when karaoke words exist', code.includes('presentation.words ? presentation.words.map((word, wordIndex) =>') && code.includes("'caption-word' + (word.active ? ' caption-word-active' : '')")],
  ['highlight color is exposed as a CSS variable for the active word', code.includes("'--caption-highlight-color': style.highlightColor || '#ffd400'")],
  ['adding captions to the timeline converts each segment\'s word timing to clip-local seconds', code.includes('const karaokeWords = Array.isArray(segment.words) ? segment.words.map((word) => ({') && code.includes('textStyle: { ...captionStyle, duration, karaokeWords }')],
]

let failed = false
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failed = true
}
if (failed) process.exit(1)
console.log('\nVite transform order preserves overlap replacement, clearer visibility controls, timeline drag, playhead dragging, imports, duration UI, removable layers, and Program Monitor live resize together.')
