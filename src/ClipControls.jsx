import { useRef, useState } from 'react'
import './ClipControls.css'
import { keyframeAt, removeKeyframeAt, resolveKeyframeValue, upsertKeyframe } from './keyframeMath'

const defaultKeyframes = {
  positionX: { enabled: false, to: 50, easing: 'linear' },
  positionY: { enabled: false, to: 50, easing: 'linear' },
  scale: { enabled: false, to: 100, easing: 'linear' },
  opacity: { enabled: false, to: 100, easing: 'linear' },
  rotation: { enabled: false, to: 0, easing: 'linear' },
}

// Same idea as defaultKeyframes above, but for the TEXT layer's own
// Position/Scale/Rotation/Opacity — Effect Controls keyframes now work
// identically for text and video clips (same stopwatch, same mini
// timeline), just reading/writing clip.textStyle instead of clip.video.
const defaultTextKeyframes = {
  x: { enabled: false, to: 50, easing: 'linear' },
  y: { enabled: false, to: 50, easing: 'linear' },
  scale: { enabled: false, to: 100, easing: 'linear' },
  rotation: { enabled: false, to: 0, easing: 'linear' },
  opacity: { enabled: false, to: 100, easing: 'linear' },
}
export const defaultTextTransform = { x: 50, y: 50, scale: 100, rotation: 0, opacity: 100, anchorX: 0, anchorY: 0, keyframes: defaultTextKeyframes }

const defaultVideo = {
  positionX: 50,
  positionY: 50,
  scale: 100,
  scaleWidth: 100,
  uniformScale: true,
  rotation: 0,
  anchorX: 0,
  anchorY: 0,
  opacity: 100,
  blendMode: 'normal',
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0,
  fitMode: 'Fit',
  speed: 1,
  freezeFrame: false,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  keyframes: defaultKeyframes,
}

// Premiere's Effect Controls > Opacity has a Blend Mode dropdown; these are
// the standard CSS mix-blend-mode keywords (matches what the Program Monitor
// preview actually applies — see programVideoStyle in App.jsx).
const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']

// Combines a static value with a "animate to" end value — the clip's actual
// duration is what drives the interpolation (see resolveVideoKeyframeValue in
// App.jsx for preview, and keyframeLerpExpression in exportEngine.cjs for the
// real FFmpeg export), so presets only need to set the two endpoints.
const VIDEO_PRESETS = [
  { name: 'Slow Zoom In', apply: (transform) => ({ scale: 100, keyframes: { ...transform.keyframes, scale: { enabled: true, to: 118 } } }) },
  { name: 'Slow Zoom Out', apply: (transform) => ({ scale: 118, keyframes: { ...transform.keyframes, scale: { enabled: true, to: 100 } } }) },
  { name: 'Pan Left → Right', apply: (transform) => ({ positionX: 35, keyframes: { ...transform.keyframes, positionX: { enabled: true, to: 65 } } }) },
  { name: 'Pan Right → Left', apply: (transform) => ({ positionX: 65, keyframes: { ...transform.keyframes, positionX: { enabled: true, to: 35 } } }) },
  { name: 'Fade In', apply: (transform) => ({ opacity: 0, keyframes: { ...transform.keyframes, opacity: { enabled: true, to: 100 } } }) },
  { name: 'Fade Out', apply: (transform) => ({ opacity: 100, keyframes: { ...transform.keyframes, opacity: { enabled: true, to: 0 } } }) },
]

// Module-level so it survives switching between selected clips (a fresh copy
// is taken from whichever clip's "Copy Effect" was last clicked).
let copiedVideoEffect = null

const defaultAudio = {
  volume: 100,
  fadeIn: 0,
  fadeOut: 0,
}

export function EffectSection({ title, hint, onReset, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`effect-section ${open ? 'open' : ''}`}>
      <div className="effect-section-head">
        <button className="effect-section-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>{open ? '▾' : '▸'}</button>
        <button className="effect-section-title" onClick={() => setOpen((value) => !value)}>{title}</button>
        {hint && <span className="effect-section-hint">{hint}</span>}
        {onReset && <button className="effect-reset" onClick={onReset} title={`Reset ${title}`}>↶</button>}
      </div>
      {open && <div className="effect-section-body">{children}</div>}
    </section>
  )
}

// Percent-filled position of a range input's thumb, fed to the thin-track
// CSS var (see index.css) so the filled/unfilled split lines up with the
// actual value instead of always drawing a plain 50/50 split.
function rangeProgressStyle(value, min, max) {
  const lo = Number(min), hi = Number(max)
  const pct = hi > lo ? ((Number(value) - lo) / (hi - lo)) * 100 : 0
  return { '--range-progress': Math.max(0, Math.min(100, pct)) }
}

function NumericControl({ label, value, min, max, step = 1, suffix = '', onChange }) {
  return (
    <label className="clip-control-row">
      <span className="clip-control-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} style={rangeProgressStyle(value, min, max)} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="clip-control-value">
        <input className="clip-control-number" type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  )
}

// The little diamond stopwatch each animatable row gets (Position, Scale,
// Rotation, Opacity...), matching Premiere's Effect Controls: hollow when
// keyframing is off, filled once it's on, and a slightly different shade
// when a keyframe sits at the exact current time vs. mid-interpolation.
function KeyframeDiamond({ enabled, hasKeyframeHere, onClick, title }) {
  return (
    <button type="button" className={`keyframe-diamond ${enabled ? 'enabled' : ''} ${hasKeyframeHere ? 'has-key' : ''}`} onClick={onClick} title={title}>
      <svg viewBox="0 0 10 10" width="10" height="10"><rect x="1.5" y="1.5" width="7" height="7" transform="rotate(45 5 5)" /></svg>
    </button>
  )
}

// The mini keyframe timeline under a row once it's animated — a thin bar the
// width of the clip's own duration, with a dot per keyframe (click to jump
// the playhead there, double-click to delete just that one keyframe) and a
// moving marker for where the playhead is now.
function KeyframeStrip({ points, duration, localTime, onSeek, onDelete }) {
  const safeDuration = Math.max(0.05, duration)
  const pct = (t) => `${Math.max(0, Math.min(100, (t / safeDuration) * 100))}%`
  return (
    <div className="keyframe-strip">
      <div className="keyframe-strip-track">
        {points.map((pt) => (
          <button
            key={pt.time}
            type="button"
            className="keyframe-strip-dot"
            style={{ left: pct(pt.time) }}
            onClick={() => onSeek(pt.time)}
            onDoubleClick={(event) => { event.stopPropagation(); onDelete(pt.time) }}
            title={`${pt.time.toFixed(2)}s — click to jump here, double-click to delete`}
          />
        ))}
        <div className="keyframe-strip-playhead" style={{ left: pct(localTime) }} />
      </div>
    </div>
  )
}

// A NumericControl that can be keyframed over time. When keyframing is off
// it behaves exactly like NumericControl (edits the plain static value).
// Once the stopwatch is on, `value` is the value AT THE CURRENT PLAYHEAD
// (already resolved/interpolated by the caller), editing it upserts a
// keyframe at the current time instead of changing a single static number,
// and a mini timeline of the property's keyframes appears underneath.
function KeyframeableControl({ label, value, min, max, step = 1, suffix = '', onChange, track, duration, localTime, onToggle, onSeek, onDeleteAt }) {
  const enabled = Boolean(track?.enabled)
  const hasKeyframeHere = enabled ? Boolean(keyframeAt(track, localTime)) : false
  const title = !enabled ? `Enable keyframing for ${label}` : `Disable keyframing for ${label} (removes all its keyframes)`
  return (
    <div className="keyframeable-control">
      <label className="clip-control-row keyframeable-row">
        <span className="clip-control-label">{label}</span>
        <input type="range" min={min} max={max} step={step} value={value} style={rangeProgressStyle(value, min, max)} onChange={(event) => onChange(Number(event.target.value))} />
        <span className="clip-control-value">
          <input className="clip-control-number" type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
          {suffix && <small>{suffix}</small>}
        </span>
        <KeyframeDiamond enabled={enabled} hasKeyframeHere={hasKeyframeHere} title={title} onClick={onToggle} />
      </label>
      {enabled && <KeyframeStrip points={track.points || []} duration={duration} localTime={localTime} onSeek={onSeek} onDelete={onDeleteAt} />}
    </div>
  )
}

// Premiere keyframes Position (and would keyframe Anchor Point, if it were
// keyframeable) as ONE X/Y pair under a single stopwatch and a single row —
// our data model still stores positionX/positionY as two fully independent
// tracks (so export's per-axis expressions, the motion-path plugin, and
// snap-guide dragging — all already verified elsewhere — need zero changes),
// but the two rows can still be presented as one compact Premiere-style row
// with one shared diamond, by toggling/reading both tracks together here.
function PairedKeyframeRow({ label, xKey, yKey, xLabel = 'X', yLabel = 'Y', min, max, step, suffix, transform, patch, defaults, duration, localTime, clipStart, setPlayhead }) {
  const trackX = transform.keyframes?.[xKey] || defaults[xKey]
  const trackY = transform.keyframes?.[yKey] || defaults[yKey]
  const displayX = resolveKeyframeValue(trackX, transform[xKey], localTime, duration)
  const displayY = resolveKeyframeValue(trackY, transform[yKey], localTime, duration)
  const enabled = Boolean(trackX.enabled || trackY.enabled)
  const hasKeyHere = enabled && (Boolean(keyframeAt(trackX, localTime)) || Boolean(keyframeAt(trackY, localTime)))
  const setTrack = (key, nextTrack) => patch({ keyframes: { ...transform.keyframes, [key]: nextTrack } })

  const onToggle = () => {
    if (!enabled) {
      setTrack(xKey, { enabled: true, points: upsertKeyframe(trackX.points || [], localTime, displayX) })
      setTrack(yKey, { enabled: true, points: upsertKeyframe(trackY.points || [], localTime, displayY) })
    } else {
      patch({
        [xKey]: displayX, [yKey]: displayY,
        keyframes: { ...transform.keyframes, [xKey]: { enabled: false, points: [] }, [yKey]: { enabled: false, points: [] } },
      })
    }
  }
  const onChangeX = (value) => {
    if (!trackX.enabled) { patch({ [xKey]: value }); return }
    setTrack(xKey, { enabled: true, points: upsertKeyframe(trackX.points || [], localTime, value) })
  }
  const onChangeY = (value) => {
    if (!trackY.enabled) { patch({ [yKey]: value }); return }
    setTrack(yKey, { enabled: true, points: upsertKeyframe(trackY.points || [], localTime, value) })
  }
  // A dot wherever EITHER axis has a keyframe — deleting it clears both
  // axes at that time, matching how Premiere treats Position as one pair.
  const mergedTimes = Array.from(new Set([...(trackX.points || []).map((p) => p.time), ...(trackY.points || []).map((p) => p.time)])).sort((a, b) => a - b)
  const mergedPoints = mergedTimes.map((time) => ({ time }))
  const onDeleteAt = (time) => {
    setTrack(xKey, { enabled: true, points: removeKeyframeAt(trackX.points || [], time) })
    setTrack(yKey, { enabled: true, points: removeKeyframeAt(trackY.points || [], time) })
  }

  return (
    <div className="keyframeable-control">
      <div className="clip-control-row paired-row">
        <span className="clip-control-label">{label}</span>
        <span className="paired-inputs">
          <span className="paired-field"><small>{xLabel}</small><input className="clip-control-number" type="number" min={min} max={max} step={step} value={displayX} onChange={(event) => onChangeX(Number(event.target.value))} />{suffix && <small>{suffix}</small>}</span>
          <span className="paired-field"><small>{yLabel}</small><input className="clip-control-number" type="number" min={min} max={max} step={step} value={displayY} onChange={(event) => onChangeY(Number(event.target.value))} />{suffix && <small>{suffix}</small>}</span>
        </span>
        <KeyframeDiamond enabled={enabled} hasKeyframeHere={hasKeyHere} title={!enabled ? `Enable keyframing for ${label}` : `Disable keyframing for ${label} (removes all its keyframes)`} onClick={onToggle} />
      </div>
      {enabled && <KeyframeStrip points={mergedPoints} duration={duration} localTime={localTime} onSeek={(t) => setPlayhead(clipStart + t)} onDelete={onDeleteAt} />}
    </div>
  )
}

// Shared by VideoControls and TextEffectControls below — a KeyframeableControl
// for one of a clip's animatable properties: reads the resolved (interpolated,
// at the current playhead) value to display, and wires the stopwatch +
// slider/number edits to real multi-keyframe writes on transform.keyframes[key].
// `transform`/`patch`/`defaults` let the same logic target either
// clip.video (video/image clips) or clip.textStyle (text layers).
function makeKeyframeField({ transform, patch, defaults, duration, localTime, clipStart, setPlayhead }) {
  return ({ key, label, min, max, step, suffix }) => {
    const track = transform.keyframes?.[key] || defaults[key]
    const staticValue = transform[key]
    const displayValue = resolveKeyframeValue(track, staticValue, localTime, duration)
    const setTrack = (nextTrack) => patch({ keyframes: { ...transform.keyframes, [key]: nextTrack } })
    return (
      <KeyframeableControl
        key={key}
        label={label}
        value={displayValue}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
        duration={duration}
        localTime={localTime}
        onSeek={(t) => setPlayhead(clipStart + t)}
        track={track}
        onChange={(value) => {
          if (!track?.enabled) { patch({ [key]: value }); return }
          setTrack({ enabled: true, points: upsertKeyframe(track.points || [], localTime, value) })
        }}
        onToggle={() => {
          // The row's stopwatch is the Adobe-style global on/off for this
          // property: off -> on creates the first keyframe from the current
          // value; on -> off clears every keyframe and reverts to a plain
          // static value (matches clicking Premiere's stopwatch off, which
          // prompts to delete all of a property's keyframes). Removing or
          // adding an INDIVIDUAL keyframe elsewhere in time happens by
          // editing the value at that time, or double-clicking its dot.
          if (!track?.enabled) {
            setTrack({ enabled: true, points: upsertKeyframe([], localTime, displayValue) })
          } else {
            patch({ [key]: displayValue, keyframes: { ...transform.keyframes, [key]: { enabled: false, points: [] } } })
          }
        }}
        onDeleteAt={(time) => {
          const nextPoints = removeKeyframeAt(track.points || [], time)
          setTrack(nextPoints.length ? { enabled: true, points: nextPoints } : { enabled: false, points: [] })
        }}
      />
    )
  }
}

// Effect Controls for a TEXT layer — same Motion/Opacity keyframing as video
// clips get (same stopwatch + mini keyframe timeline), just driving
// clip.textStyle's x/y/scale/rotation/opacity instead of clip.video. Font,
// color, animation-in/out etc. stay in the Text panel; this only covers the
// transform properties Adobe's Effect Controls would keyframe for a layer.
// The "Align and Transform" group — shared between the Text/Properties panel
// (CreativePanels.jsx) and the Effect Controls tab for a text clip below, so
// there's exactly one implementation of position/anchor/scale/rotation/
// opacity keyframing for text, not two. `onUpdate` is the same
// (clipId, patch) updater ClipControls' own VideoControls uses
// (App.jsx's updateClipControls), which merges onto the clip's existing
// textStyle rather than replacing it.
export function TextAlignTransformSection({ clip, onUpdate, playhead = 0, setPlayhead = () => {} }) {
  const transform = { ...defaultTextTransform, ...(clip.textStyle || {}) }
  const patch = (values) => onUpdate(clip.id, { textStyle: { ...transform, ...values } })
  const duration = Math.max(.05, Number(clip.duration) || 0)
  const localTime = Math.max(0, Math.min(duration, playhead - clip.start))
  const keyframeField = makeKeyframeField({ transform, patch, defaults: defaultTextKeyframes, duration, localTime, clipStart: clip.start, setPlayhead })

  // Real Premiere computes these against the layer's actual rendered bounding
  // box; ours always centers text on its position point, so "align" here is
  // the practical equivalent — one-click, snaps the position to that edge/
  // center of the frame (0 / 50 / 100%) rather than a persisted toggle.
  const ALIGN_BUTTONS = [
    ['⇤', 'Align left', { x: 0 }], ['⇔', 'Align horizontal center', { x: 50 }], ['⇥', 'Align right', { x: 100 }],
    ['⇧', 'Align top', { y: 0 }], ['⇕', 'Align vertical center', { y: 50 }], ['⇩', 'Align bottom', { y: 100 }],
  ]

  return (
    <EffectSection
      title="Align and Transform"
      hint="◇ to keyframe"
      onReset={() => patch({ x: 50, y: 50, scale: 100, rotation: 0, opacity: 100, anchorX: 0, anchorY: 0, keyframes: defaultTextKeyframes })}
    >
      <div className="align-row">
        {ALIGN_BUTTONS.map(([icon, title, values]) => (
          <button key={title} type="button" title={title} onClick={() => patch(values)}>{icon}</button>
        ))}
      </div>
      {keyframeField({ key: 'x', label: 'Position X', min: 0, max: 100, step: .1, suffix: '%' })}
      {keyframeField({ key: 'y', label: 'Position Y', min: 0, max: 100, step: .1, suffix: '%' })}
      <div className="clip-control-row">
        <span className="clip-control-label">Anchor X</span>
        <input type="range" min={-200} max={200} step={1} value={transform.anchorX} style={rangeProgressStyle(transform.anchorX, -200, 200)} onChange={(event) => patch({ anchorX: Number(event.target.value) })} />
        <span className="clip-control-value"><input className="clip-control-number" type="number" value={transform.anchorX} onChange={(event) => patch({ anchorX: Number(event.target.value) })} /><small>px</small></span>
      </div>
      <div className="clip-control-row">
        <span className="clip-control-label">Anchor Y</span>
        <input type="range" min={-200} max={200} step={1} value={transform.anchorY} style={rangeProgressStyle(transform.anchorY, -200, 200)} onChange={(event) => patch({ anchorY: Number(event.target.value) })} />
        <span className="clip-control-value"><input className="clip-control-number" type="number" value={transform.anchorY} onChange={(event) => patch({ anchorY: Number(event.target.value) })} /><small>px</small></span>
      </div>
      {keyframeField({ key: 'scale', label: 'Scale', min: 1, max: 400, step: 1, suffix: '%' })}
      {keyframeField({ key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, suffix: '°' })}
      {keyframeField({ key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, suffix: '%' })}
    </EffectSection>
  )
}

function TextEffectControls({ clip, onUpdate, playhead = 0, setPlayhead = () => {} }) {
  return (
    <div className="clip-controls-panel effect-controls-panel">
      <div className="clip-controls-heading">
        <div><strong>EFFECT CONTROLS</strong><small>Text</small></div>
        <span>{clip.name || clip.text}</span>
      </div>
      <TextAlignTransformSection clip={clip} onUpdate={onUpdate} playhead={playhead} setPlayhead={setPlayhead} />
    </div>
  )
}

export function VideoControls({ clip, onUpdate, notify, playhead = 0, setPlayhead = () => {} }) {
  if (!clip || clip.type !== 'video') {
    return <div className="clip-controls-empty">Select a video or text clip on the timeline.</div>
  }
  if (clip.kind === 'text') {
    return <TextEffectControls clip={clip} onUpdate={onUpdate} notify={notify} playhead={playhead} setPlayhead={setPlayhead} />
  }

  const transform = { ...defaultVideo, ...(clip.video || {}) }
  const patch = (values) => onUpdate(clip.id, { video: { ...transform, ...values } })
  const duration = Math.max(.05, Number(clip.duration) || 0)
  const localTime = Math.max(0, Math.min(duration, playhead - clip.start))
  const keyframeField = makeKeyframeField({ transform, patch, defaults: defaultKeyframes, duration, localTime, clipStart: clip.start, setPlayhead })

  return (
    <div className="clip-controls-panel effect-controls-panel">
      <div className="clip-controls-heading">
        <div><strong>EFFECT CONTROLS</strong><small>Video</small></div>
        <span>{clip.name}</span>
      </div>

      <EffectSection title="Presets" hint="One-click looks" defaultOpen={false}>
        <div className="video-preset-grid">
          {VIDEO_PRESETS.map((preset) => (
            <button key={preset.name} onClick={() => { patch(preset.apply(transform)); notify(`${preset.name} applied — still fully customizable below`) }}>{preset.name}</button>
          ))}
        </div>
      </EffectSection>

      <EffectSection
        title="Motion"
        hint="Transform — ◇ to keyframe"
        onReset={() => patch({
          positionX: 50, positionY: 50, scale: 100, scaleWidth: 100, uniformScale: true, rotation: 0, anchorX: 0, anchorY: 0,
          cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0,
          keyframes: { ...transform.keyframes, positionX: defaultKeyframes.positionX, positionY: defaultKeyframes.positionY, scale: defaultKeyframes.scale, rotation: defaultKeyframes.rotation },
        })}
      >
        <PairedKeyframeRow
          label="Position" xKey="positionX" yKey="positionY" min={0} max={100} step={.1} suffix="%"
          transform={transform} patch={patch} defaults={defaultKeyframes} duration={duration} localTime={localTime} clipStart={clip.start} setPlayhead={setPlayhead}
        />
        {keyframeField({ key: 'scale', label: 'Scale', min: 1, max: 400, step: 1, suffix: '%' })}
        <label className={`clip-control-row ${transform.uniformScale ? 'is-disabled' : ''}`}>
          <span className="clip-control-label">Scale Width</span>
          <input type="range" min={1} max={400} step={1} value={transform.scaleWidth} disabled={transform.uniformScale} style={rangeProgressStyle(transform.scaleWidth, 1, 400)} onChange={(event) => patch({ scaleWidth: Number(event.target.value) })} />
          <span className="clip-control-value">
            <input className="clip-control-number" type="number" min={1} max={400} value={transform.scaleWidth} disabled={transform.uniformScale} onChange={(event) => patch({ scaleWidth: Number(event.target.value) })} />
            <small>%</small>
          </span>
        </label>
        <div className="clip-control-toggle-row">
          <input id={`uniform-scale-${clip.id}`} type="checkbox" checked={transform.uniformScale} onChange={(event) => patch({ uniformScale: event.target.checked, scaleWidth: event.target.checked ? transform.scaleWidth : transform.scale })} />
          <label className="clip-control-label" htmlFor={`uniform-scale-${clip.id}`}>Uniform Scale</label>
        </div>
        {keyframeField({ key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, suffix: '°' })}
        <div className="effect-quick-row">
          <button onClick={() => patch({ positionX: 50, positionY: 50 })}>Center</button>
          <button onClick={() => patch({ scale: 100, scaleWidth: 100 })}>100%</button>
          <button onClick={() => patch({ rotation: 0 })}>0°</button>
        </div>
        <label className="clip-control-row paired-row">
          <span className="clip-control-label">Anchor Point</span>
          <span className="paired-inputs">
            <span className="paired-field"><small>X</small><input className="clip-control-number" type="number" value={transform.anchorX} onChange={(event) => patch({ anchorX: Number(event.target.value) })} /><small>px</small></span>
            <span className="paired-field"><small>Y</small><input className="clip-control-number" type="number" value={transform.anchorY} onChange={(event) => patch({ anchorY: Number(event.target.value) })} /><small>px</small></span>
          </span>
        </label>
        {[
          ['Crop Left', 'cropLeft'], ['Crop Top', 'cropTop'], ['Crop Right', 'cropRight'], ['Crop Bottom', 'cropBottom'],
        ].map(([label, key]) => (
          <label key={key} className="clip-control-row">
            <span className="clip-control-label">{label}</span>
            <input type="range" min={0} max={49} step={1} value={transform[key]} style={rangeProgressStyle(transform[key], 0, 49)} onChange={(event) => patch({ [key]: Number(event.target.value) })} />
            <span className="clip-control-value">
              <input className="clip-control-number" type="number" min="0" max="49" value={transform[key]} onChange={(event) => patch({ [key]: Number(event.target.value) })} />
              <small>%</small>
            </span>
          </label>
        ))}
      </EffectSection>

      <EffectSection title="Opacity" hint="Compositing — ◇ to keyframe" onReset={() => patch({ opacity: 100, blendMode: 'normal', keyframes: { ...transform.keyframes, opacity: defaultKeyframes.opacity } })}>
        {keyframeField({ key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, suffix: '%' })}
        <label className="clip-control-select-row">
          <span className="clip-control-label">Blend Mode</span>
          <select className="clip-control-select" value={transform.blendMode} onChange={(event) => patch({ blendMode: event.target.value })}>
            {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode.charAt(0).toUpperCase() + mode.slice(1).replace('-', ' ')}</option>)}
          </select>
        </label>
        <div className="effect-quick-row">
          {[25, 50, 75, 100].map((value) => <button key={value} className={transform.opacity === value ? 'active' : ''} onClick={() => patch({ opacity: value })}>{value}%</button>)}
        </div>
      </EffectSection>

      <EffectSection title="Color" hint="Grading" defaultOpen={false} onReset={() => patch({ temperature: 0, tint: 0, vibrance: 0 })}>
        <NumericControl label="Temperature" value={transform.temperature} min={-100} max={100} step={1} onChange={(value) => patch({ temperature: value })} />
        <NumericControl label="Tint" value={transform.tint} min={-100} max={100} step={1} onChange={(value) => patch({ tint: value })} />
        <NumericControl label="Vibrance" value={transform.vibrance} min={-100} max={100} step={1} onChange={(value) => patch({ vibrance: value })} />
        <p className="color-grade-hint">Temperature: cool ↔ warm. Tint: green ↔ magenta. Vibrance boosts muted colors without blowing out ones already vivid.</p>
      </EffectSection>

      <EffectSection title="Frame" hint="Fit mode" onReset={() => patch({ fitMode: 'Fit' })} defaultOpen={false}>
        <div className="clip-button-row segmented">
          {['Fit', 'Fill', 'Stretch'].map((mode) => <button key={mode} className={transform.fitMode === mode ? 'active' : ''} onClick={() => patch({ fitMode: mode })}>{mode}</button>)}
        </div>
      </EffectSection>

      <EffectSection title="Time Remapping" hint="Speed" onReset={() => patch({ speed: 1, freezeFrame: false })}>
        <NumericControl label="Speed" value={transform.speed} min={0.1} max={4} step={0.1} suffix="×" onChange={(value) => patch({ speed: value })} />
        <div className="effect-quick-row speed-presets">
          {[0.5, 1, 1.5, 2].map((value) => <button key={value} className={transform.speed === value ? 'active' : ''} onClick={() => patch({ speed: value })}>{value}×</button>)}
        </div>
        <div className="clip-button-row wide">
          <button className={transform.freezeFrame ? 'active' : ''} onClick={() => { patch({ freezeFrame: !transform.freezeFrame }); notify(transform.freezeFrame ? 'Freeze frame disabled' : 'Freeze frame enabled') }}>
            {transform.freezeFrame ? '❄ Freeze On' : '❄ Freeze Frame'}
          </button>
        </div>
      </EffectSection>

      <div className="effect-footer-actions">
        <button onClick={() => { copiedVideoEffect = { ...transform }; notify('Effect settings copied') }}>Copy Effect</button>
        <button onClick={() => { if (!copiedVideoEffect) return notify('Pehle kisi clip par Copy Effect karo'); patch({ ...copiedVideoEffect }); notify('Effect settings pasted') }}>Paste Effect</button>
        <button onClick={() => onUpdate(clip.id, { video: { ...defaultVideo } })}>Reset All Video Effects</button>
      </div>
    </div>
  )
}

export function AudioControls({ clip, onUpdate }) {
  if (!clip || clip.type !== 'audio') {
    return <div className="clip-controls-empty">Select an audio, music, voice-over, or SFX clip.</div>
  }

  const audio = { ...defaultAudio, ...(clip.audio || {}) }
  const patch = (values) => onUpdate(clip.id, { audio: { ...audio, ...values } })

  return (
    <div className="clip-controls-panel effect-controls-panel">
      <div className="clip-controls-heading"><div><strong>EFFECT CONTROLS</strong><small>Audio</small></div><span>{clip.name}</span></div>
      <EffectSection title="Volume" hint="Level" onReset={() => patch({ volume: 100 })}>
        <NumericControl label="Volume" value={audio.volume} min={0} max={200} step={1} suffix="%" onChange={(value) => patch({ volume: value })} />
        <div className="effect-quick-row">
          {[0, 50, 100, 150].map((value) => <button key={value} className={audio.volume === value ? 'active' : ''} onClick={() => patch({ volume: value })}>{value}%</button>)}
        </div>
      </EffectSection>
      <EffectSection title="Audio Transitions" hint="Fades" onReset={() => patch({ fadeIn: 0, fadeOut: 0 })}>
        <NumericControl label="Fade In" value={audio.fadeIn} min={0} max={10} step={0.1} suffix="s" onChange={(value) => patch({ fadeIn: value })} />
        <NumericControl label="Fade Out" value={audio.fadeOut} min={0} max={10} step={0.1} suffix="s" onChange={(value) => patch({ fadeOut: value })} />
        <div className="effect-quick-row">
          {[0, .5, 1, 2].map((value) => <button key={value} onClick={() => patch({ fadeIn: value, fadeOut: value })}>{value}s</button>)}
        </div>
      </EffectSection>
      <div className="effect-footer-actions"><button onClick={() => onUpdate(clip.id, { audio: { ...defaultAudio } })}>Reset All Audio Effects</button></div>
    </div>
  )
}

export function VoiceoverWorkspace({ onAddAudio, notify }) {
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(0)
  const fileRef = useRef(null)
  const [recording, setRecording] = useState(false)

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return notify('Microphone recording is not available here')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      startedAtRef.current = Date.now()
      recorder.addEventListener('dataavailable', (event) => event.data.size && chunksRef.current.push(event.data))
      recorder.addEventListener('stop', async () => {
        const duration = Math.max(0.2, (Date.now() - startedAtRef.current) / 1000)
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const url = URL.createObjectURL(blob)
        // A MediaRecorder blob has no real file on disk (unlike a picked
        // file), so it has no path export could ever use — write it out via
        // the same desktop:save-temp-media bridge already in main.cjs (it
        // existed but was never wired up to the renderer before this fix).
        let sourcePath = ''
        if (window.videoEditorDesktop?.saveTempMedia) {
          try {
            const bytes = await blob.arrayBuffer()
            sourcePath = await window.videoEditorDesktop.saveTempMedia(bytes, 'webm') || ''
          } catch { /* falls back to preview-only below */ }
        }
        onAddAudio({ id: `voiceover-${Date.now()}`, name: `Voiceover ${new Date().toLocaleTimeString()}`, duration, url, sourcePath, kind: 'voiceover' }, 'A1')
        stream.getTracks().forEach((track) => track.stop())
        setRecording(false)
        notify(sourcePath ? 'Voice-over added to timeline' : 'Voice-over added — preview only, will be skipped in export')
      }, { once: true })
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
      notify('Voice-over recording started')
    } catch {
      notify('Microphone permission was not granted')
    }
  }

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  const importAudio = (file, kind = 'music') => {
    if (!file) return
    const url = URL.createObjectURL(file)
    // A blob: URL only works for the live preview — export needs a real
    // filesystem path, captured here the same way custom fonts/media already
    // do (webUtils.getPathForFile via the desktop bridge).
    const sourcePath = window.videoEditorDesktop?.getPathForFile?.(file) || ''
    const audio = new Audio(url)
    audio.addEventListener('loadedmetadata', () => {
      onAddAudio({ id: `${kind}-${Date.now()}`, name: file.name, duration: Number.isFinite(audio.duration) ? audio.duration : 5, url, sourcePath, kind }, kind === 'music' ? 'A2' : 'A1')
      notify(sourcePath ? `${file.name} added to timeline` : `${file.name} added — preview only, will be skipped in export`)
    }, { once: true })
    audio.addEventListener('error', () => notify('Could not read that audio file'), { once: true })
  }

  return (
    <div className="voiceover-workspace">
      <div className="clip-controls-heading"><strong>VOICE / MUSIC</strong><span>Audio workflow</span></div>
      <div className="voiceover-actions">
        {!recording ? <button className="record-btn" onClick={startRecording}>● Record Voice-over</button> : <button className="record-btn active" onClick={stopRecording}>■ Stop Recording</button>}
        <button onClick={() => fileRef.current?.click()}>＋ Import Music / Audio</button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(event) => importAudio(event.target.files?.[0], 'music')} />
      </div>
      <p>Voice-over defaults to A1. Music defaults to A2. SFX defaults to A3.</p>
    </div>
  )
}

export function getDefaultVideoControls() {
  return { ...defaultVideo }
}

export function getDefaultAudioControls() {
  return { ...defaultAudio }
}
