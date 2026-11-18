import { useEffect, useMemo, useRef, useState } from 'react'
import { splitScriptText } from './stockApi'
import { getLibrarySfx, suggestSfxForLine } from './sfxSuggestions'
import { EffectSection, TextAlignTransformSection } from './ClipControls'
import './CreativePanels.css'
import './ClipControls.css'

// Small inline icon set for the Properties-panel-style rows (spacing fields,
// alignment row, eyedropper, Background/Shadow controls) — real SVGs rather
// than plain unicode glyphs, matching the reference panel's icon-first,
// label-light density.
const IconEyedropper = () => (
  <svg viewBox="0 0 16 16" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2l3 3-2 2-3-3z" /><path d="M10.5 4.5L4 11l-1.5 3.5L6 13l6.5-6.5" /></svg>
)
const IconAlign = ({ variant }) => {
  const lines = {
    left: [[1, 3, 13], [1, 8, 9], [1, 13, 11]],
    center: [[1, 3, 13], [3, 8, 9], [2, 13, 11]],
    right: [[1, 3, 13], [5, 8, 13], [3, 13, 13]],
  }[variant] || [[1, 3, 13], [1, 8, 9], [1, 13, 11]]
  return (
    <svg viewBox="0 0 16 6" width="16" height="7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      {lines.map(([x1, y, x2], i) => <line key={i} x1={x1} y1={y === 3 ? 0.5 : y === 8 ? 3 : 5.5} x2={x2} y2={y === 3 ? 0.5 : y === 8 ? 3 : 5.5} />)}
    </svg>
  )
}
const IconVAlign = ({ variant }) => (
  <svg viewBox="0 0 10 14" width="10" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    <line x1="1" y1="1" x2="9" y2="1" opacity={variant === 'top' ? 1 : .35} />
    <line x1="1" y1="7" x2="9" y2="7" opacity={variant === 'middle' ? 1 : .35} />
    <line x1="1" y1="13" x2="9" y2="13" opacity={variant === 'bottom' ? 1 : .35} />
  </svg>
)
const IconTracking = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3v10M14 3v10" /><path d="M6.5 8h3" /><path d="M7 6.2L5.2 8 7 9.8M9 6.2L10.8 8 9 9.8" /></svg>
)
const IconLeading = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h10M3 13h10" /><path d="M8 5v6" /><path d="M6.2 6.8L8 5l1.8 1.8M6.2 9.2L8 11l1.8-1.8" /></svg>
)
const IconBaseline = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5h10" /><path d="M8 9V3" /><path d="M6 5.2L8 3l2 2.2" /></svg>
)
const IconOpacity = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" /><path d="M2.5 6h11M2.5 10h11M6 2.5v11M10 2.5v11" strokeDasharray="1.4 1.4" opacity=".6" /></svg>
)
const IconSize = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="3.5" y="3.5" width="9" height="9" rx="1" /></svg>
)
const IconRadius = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M3 13V7a4 4 0 0 1 4-4h6" /></svg>
)
const IconDistance = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="5" r="2" /><path d="M8 8l4.5 4.5M12.5 8v5h-5" /></svg>
)
const IconAngle = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M3 13h10" /><path d="M3 13L11 4" /><path d="M3 9.5a3.5 3.5 0 0 1 3.5-3.5" /></svg>
)
const IconBlur = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="8" cy="8" r="4.5" opacity=".9" /><circle cx="8" cy="8" r="6.5" opacity=".35" /></svg>
)

// A compact icon + slider + numeric-value row (Background/Shadow controls,
// matching the reference's dense icon-labeled sliders rather than a text
// label on its own line above the field).
function IconFieldRow({ icon, value, min, max, step = 1, onChange, title, flat = true }) {
  return (
    <div className="icon-field-row" title={title}>
      <span className="field-icon">{icon}</span>
      <input className={flat ? 'prop-slider' : undefined} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  )
}

const COMMON_FONTS = ['Segoe UI', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Verdana', 'Trebuchet MS', 'Times New Roman', 'Courier New', 'Impact']

// Fallback weight/variant list for a font family we have no real installed-
// variant data for (web-safe fonts, or Local Font Access not granted) —
// applied as a synthetic CSS font-weight number rather than a real face.
const WEIGHT_LABELS = ['Thin', 'ExtraLight', 'Light', 'Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black']

// Exported so CaptionWorkspace.jsx (Auto Captions) can offer the exact same
// animation variety as regular text layers instead of duplicating the list.
export const TEXT_IN_ANIMATIONS = [
  ['None', 'None'], ['Fade In', 'Fade In'], ['Slide Up', 'Slide Up'], ['Slide Down', 'Slide Down'], ['Slide Left', 'Slide Left'], ['Slide Right', 'Slide Right'], ['Zoom In', 'Zoom In'], ['Popup', 'Pop'], ['Bounce', 'Bounce'], ['Spring In', 'Spring In'], ['Rotate In', 'Rotate In'], ['Flip In', 'Flip In'], ['Wipe Left', 'Wipe Left'], ['Wipe Right', 'Wipe Right'], ['Glitch In', 'Glitch In'], ['Word by Word', 'Word Reveal'], ['Letter by Letter', 'Typewriter'], ['Reveal', 'Typewriter'], ['Blur In', 'Blur In'], ['Zoom + Fade', 'Zoom In Fade'], ['Rise + Fade', 'Slide Up Fade'], ['Drop + Fade', 'Slide Down Fade'], ['Reveal Left', 'Slide Left Fade'], ['Reveal Right', 'Slide Right Fade'], ['Blur + Zoom', 'Blur Zoom In'],
]
export const TEXT_OUT_ANIMATIONS = [
  ['None', 'None'], ['Fade Out', 'Fade Out'], ['Slide Up', 'Slide Up'], ['Slide Down', 'Slide Down'], ['Slide Left', 'Slide Left'], ['Slide Right', 'Slide Right'], ['Zoom Out', 'Zoom Out'], ['Bounce Out', 'Bounce Out'], ['Spring Out', 'Spring Out'], ['Rotate Out', 'Rotate Out'], ['Flip Out', 'Flip Out'], ['Wipe Left Out', 'Wipe Left Out'], ['Wipe Right Out', 'Wipe Right Out'], ['Glitch Out', 'Glitch Out'], ['Reveal Out', 'Fade Out'], ['Blur Out', 'Blur Out'], ['Zoom + Fade Out', 'Zoom Out Fade'], ['Rise + Fade Out', 'Slide Up Fade'], ['Drop + Fade Out', 'Slide Down Fade'], ['Exit Left + Fade', 'Slide Left Fade'], ['Exit Right + Fade', 'Slide Right Fade'], ['Blur + Zoom Out', 'Blur Zoom Out'],
]

// Recommended starting styles — applying one just fills in the same controls
// below, so every value stays fully editable afterwards (nothing is locked).
const TEXT_PRESETS = [
  { name: 'Title', fontSize: 96, color: '#ffffff', background: '#00000000', align: 'center', bold: true, italic: false, underline: false, x: 50, y: 32, animationIn: 'Zoom In Fade', animationOut: 'Fade Out', animationDuration: .5, duration: 4 },
  { name: 'Caption', fontSize: 40, color: '#ffffff', background: '#000000b3', align: 'center', bold: false, italic: false, underline: false, x: 50, y: 88, animationIn: 'Fade In', animationOut: 'Fade Out', animationDuration: .3, duration: 3 },
  { name: 'Lower Third', fontSize: 44, color: '#ffffff', background: '#0f172acc', align: 'left', bold: true, italic: false, underline: false, x: 22, y: 84, animationIn: 'Slide Right Fade', animationOut: 'Fade Out', animationDuration: .45, duration: 5 },
  { name: 'Callout', fontSize: 52, color: '#111111', background: '#ffd400', align: 'center', bold: true, italic: false, underline: false, x: 50, y: 50, animationIn: 'Bounce', animationOut: 'Bounce Out', animationDuration: .4, duration: 3 },
]

// One-click In+Out+Duration bundles — every animation type here now really
// renders in the exported video (previously only the Fade family did), so
// these are worth surfacing as ready-made combos rather than three separate
// dropdowns/fields to set by hand.
const ANIMATION_PRESETS = [
  { name: 'Fade', animationIn: 'Fade In', animationOut: 'Fade Out', animationDuration: .4 },
  { name: 'Bounce', animationIn: 'Bounce', animationOut: 'Bounce Out', animationDuration: .4 },
  { name: 'Pop + Fade', animationIn: 'Pop', animationOut: 'Fade Out', animationDuration: .3 },
  { name: 'Word by Word', animationIn: 'Word Reveal', animationOut: 'Fade Out', animationDuration: 1.4 },
  { name: 'Letter by Letter', animationIn: 'Typewriter', animationOut: 'Fade Out', animationDuration: 1.2 },
  { name: 'Slide Up + Fade', animationIn: 'Slide Up Fade', animationOut: 'Fade Out', animationDuration: .4 },
  { name: 'Zoom + Fade', animationIn: 'Zoom In Fade', animationOut: 'Zoom Out Fade', animationDuration: .45 },
  { name: 'Slide Left/Right', animationIn: 'Slide Left Fade', animationOut: 'Slide Right Fade', animationDuration: .4 },
]


export function TextWorkspace({ selectedTextClip, onAddText, onUpdateText, onUpdateTransform, playhead = 0, setPlayhead = () => {}, notify }) {
  const [text, setText] = useState('Your text here')
  const [fontFamily, setFontFamily] = useState('Segoe UI')
  const [fontVariant, setFontVariant] = useState('Regular')
  const [renderFontFamily, setRenderFontFamily] = useState(null)
  const [fontSize, setFontSize] = useState(64)
  const [fillEnabled, setFillEnabled] = useState(true)
  const [color, setColor] = useState('#ffffff')
  const [background, setBackground] = useState('#00000000')
  const [showBackground, setShowBackground] = useState(false)
  const [backgroundOpacity, setBackgroundOpacity] = useState(100)
  const [backgroundSize, setBackgroundSize] = useState(0)
  const [backgroundRadius, setBackgroundRadius] = useState(0)
  const [strokeEnabled, setStrokeEnabled] = useState(false)
  const [strokeColor, setStrokeColor] = useState('#ffffff')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [strokePosition, setStrokePosition] = useState('Outer')
  const [shadowEnabled, setShadowEnabled] = useState(false)
  const [shadowColor, setShadowColor] = useState('#000000')
  const [shadowDistance, setShadowDistance] = useState(5)
  const [shadowAngle, setShadowAngle] = useState(135)
  const [shadowSize, setShadowSize] = useState(0)
  const [shadowOpacity, setShadowOpacity] = useState(60)
  const [maskWithText, setMaskWithText] = useState(false)
  const [align, setAlign] = useState('center')
  const [verticalAnchor, setVerticalAnchor] = useState('middle')
  const [bold, setBold] = useState(false)
  const [italic, setItalic] = useState(false)
  const [underline, setUnderline] = useState(false)
  const [allCaps, setAllCaps] = useState(false)
  const [smallCaps, setSmallCaps] = useState(false)
  const [superscript, setSuperscript] = useState(false)
  const [subscript, setSubscript] = useState(false)
  const [tracking, setTracking] = useState(0)
  const [lineSpacing, setLineSpacing] = useState(0)
  const [baselineShift, setBaselineShift] = useState(0)
  const [wrap, setWrap] = useState(true)
  const [lineBreakMode, setLineBreakMode] = useState('auto')
  const [x, setX] = useState(50)
  const [y, setY] = useState(50)
  const [animationIn, setAnimationIn] = useState('Fade In')
  const [animationOut, setAnimationOut] = useState('Fade Out')
  const [animationDuration, setAnimationDuration] = useState(.45)
  const [duration, setDuration] = useState(5)
  const [fonts, setFonts] = useState(COMMON_FONTS)
  const [fontSearch, setFontSearch] = useState('')
  const [favoriteFonts, setFavoriteFonts] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('video-editor-favorite-fonts') || '[]')
      return new Set(Array.isArray(saved) ? saved : [])
    } catch {
      return new Set()
    }
  })
  const [customFontPaths, setCustomFontPaths] = useState({})
  const [fontVariantIndex, setFontVariantIndex] = useState({})
  const customFontRef = useRef(null)
  const registeredFacesRef = useRef(new Set())

  const draft = {
    text, fontFamily, fontVariant, renderFontFamily, fontSize, fillEnabled, color,
    background: showBackground ? background : '#00000000', backgroundOpacity, backgroundSize, backgroundRadius,
    strokeEnabled, strokeColor, strokeWidth, strokePosition,
    shadowEnabled, shadowColor, shadowDistance, shadowAngle, shadowSize, shadowOpacity, maskWithText,
    align, verticalAnchor, bold, italic, underline, allCaps, smallCaps, superscript, subscript, tracking, lineSpacing, baselineShift, wrap, lineBreakMode,
    x, y, animationIn, animationOut, animationDuration, duration, fontFilePath: customFontPaths[fontFamily] || null,
  }

  // Registers (or reuses) a FontFace alias for one exact installed variant
  // of `family` (e.g. "Poppins" + "Medium") so the live preview renders the
  // real glyphs for that weight instead of a browser-faked bold/regular —
  // Windows commonly installs each weight as its own distinct font face
  // rather than one variable font, so plain CSS font-weight alone can't
  // reliably pick the right one. Falls back to null (synthetic weight via
  // fontWeight number, applied in App.jsx) when there's no local match.
  const applyVariant = async (family, label) => {
    const entries = fontVariantIndex[family] || []
    const match = entries.find((entry) => entry.style === label)
    if (match && window.FontFace) {
      const alias = `${family}__${label}`.replace(/[^a-zA-Z0-9_]/g, '_')
      if (!registeredFacesRef.current.has(alias)) {
        try {
          const face = new FontFace(alias, `local("${match.fullName || match.postscriptName}")`)
          await face.load()
          document.fonts.add(face)
          registeredFacesRef.current.add(alias)
        } catch {
          setRenderFontFamily(null)
          return
        }
      }
      setRenderFontFamily(alias)
      return
    }
    setRenderFontFamily(null)
  }

  const variantOptionsFor = (family) => {
    const entries = fontVariantIndex[family]
    return entries?.length ? [...new Set(entries.map((entry) => entry.style))] : WEIGHT_LABELS
  }

  const onFontFamilyChange = (family) => {
    setFontFamily(family)
    const options = variantOptionsFor(family)
    const first = options.find((option) => /regular/i.test(option)) || options[0] || 'Regular'
    setFontVariant(first)
    applyVariant(family, first)
  }

  // Favorites persist across sessions (a real desktop app, not a throwaway
  // preview) so the fonts explainerchannel uses often stay one click away
  // instead of being buried in a long installed-fonts list every time.
  const toggleFavoriteFont = (family) => {
    setFavoriteFonts((current) => {
      const next = new Set(current)
      if (next.has(family)) next.delete(family)
      else next.add(family)
      try { localStorage.setItem('video-editor-favorite-fonts', JSON.stringify([...next])) } catch { /* storage unavailable */ }
      return next
    })
  }

  const favoriteFontList = fonts.filter((font) => favoriteFonts.has(font))
  const searchedFonts = fontSearch.trim()
    ? fonts.filter((font) => font.toLowerCase().includes(fontSearch.trim().toLowerCase()))
    : fonts
  // Favorites always float to the top of the filtered list so switching
  // between a handful of go-to fonts never means re-scrolling past every
  // installed font family each time.
  const fontOptions = [...new Set([...favoriteFontList.filter((font) => searchedFonts.includes(font)), ...searchedFonts])]

  const onFontVariantChange = (label) => {
    setFontVariant(label)
    applyVariant(fontFamily, label)
  }

  // Id of the clip these fields currently reflect, set synchronously inside
  // the sync effect below (not inside the live-update effect) — this is
  // what tells the live-update effect below whether it's allowed to write
  // back yet. A "skip the next tick" boolean flag doesn't work here: when a
  // freshly-created clip is selected, its fields already match the just-used
  // draft, so the sync effect's setState calls are no-ops that never
  // actually re-trigger the live-update effect — meaning a flag meant to be
  // "consumed" by that effect would instead sit there and swallow the
  // user's very first real edit on the NEXT field change instead.
  const syncedClipIdRef = useRef(null)

  // Without this, the form kept showing whatever was last typed/picked
  // locally instead of the clip you just clicked — so re-selecting an
  // existing caption/lower-third to change its color showed a stale color,
  // and "Apply to Selected" would then overwrite that clip's real text,
  // position, animation, etc. with those stale leftover values too. Keying
  // on the clip id (not the whole object) means this only re-syncs when the
  // selection actually changes, not on every keystroke while editing it.
  useEffect(() => {
    if (!selectedTextClip) return
    syncedClipIdRef.current = selectedTextClip.id
    const style = selectedTextClip.textStyle || {}
    const bg = style.background || '#00000000'
    const hasBackground = bg !== '#00000000' && bg !== 'transparent'
    setText(selectedTextClip.text || selectedTextClip.name || 'Your text here')
    setFontFamily(style.fontFamily || 'Segoe UI')
    setFontVariant(style.fontVariant || 'Regular')
    setRenderFontFamily(style.renderFontFamily || null)
    setFontSize(Number(style.fontSize) || 64)
    setFillEnabled(style.fillEnabled !== false)
    setColor(style.color || '#ffffff')
    setShowBackground(hasBackground)
    setBackground(hasBackground ? bg : '#00000000')
    setBackgroundOpacity(style.backgroundOpacity === undefined ? 100 : Number(style.backgroundOpacity))
    setBackgroundSize(Number(style.backgroundSize) || 0)
    setBackgroundRadius(Number(style.backgroundRadius) || 0)
    setStrokeEnabled(Boolean(style.strokeEnabled))
    setStrokeColor(style.strokeColor || '#ffffff')
    setStrokeWidth(Number(style.strokeWidth) || 4)
    setStrokePosition(style.strokePosition || 'Outer')
    setShadowEnabled(Boolean(style.shadowEnabled))
    setShadowColor(style.shadowColor || '#000000')
    setShadowDistance(Number(style.shadowDistance) || 5)
    setShadowAngle(style.shadowAngle === undefined ? 135 : Number(style.shadowAngle))
    setShadowSize(Number(style.shadowSize) || 0)
    setShadowOpacity(style.shadowOpacity === undefined ? 60 : Number(style.shadowOpacity))
    setMaskWithText(Boolean(style.maskWithText))
    setAlign(style.align || 'center')
    setVerticalAnchor(style.verticalAnchor || 'middle')
    setBold(Boolean(style.bold))
    setItalic(Boolean(style.italic))
    setUnderline(Boolean(style.underline))
    setAllCaps(Boolean(style.allCaps))
    setSmallCaps(Boolean(style.smallCaps))
    setSuperscript(Boolean(style.superscript))
    setSubscript(Boolean(style.subscript))
    setTracking(Number(style.tracking) || 0)
    setLineSpacing(Number(style.lineSpacing) || 0)
    setBaselineShift(Number(style.baselineShift) || 0)
    setWrap(style.wrap !== false)
    setLineBreakMode(style.lineBreakMode ?? 'auto')
    setX(Number(style.x ?? 50))
    setY(Number(style.y ?? 50))
    setAnimationIn(style.animationIn || 'Fade In')
    setAnimationOut(style.animationOut || 'Fade Out')
    setAnimationDuration(Number(style.animationDuration) || .45)
    setDuration(Number(selectedTextClip.duration) || 5)
    if (style.fontFilePath) setCustomFontPaths((paths) => ({ ...paths, [style.fontFamily]: style.fontFilePath }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTextClip?.id])

  // Real live editing: previously every field here only ever touched local
  // draft state, and none of it reached the actual selected clip until you
  // pressed "Apply to Selected" — so changing color, size, position or
  // animation on an existing caption/lower-third silently did nothing until
  // that click, which read as "color/size can't be changed" or "I set
  // Animation to None but it still animates" (the clip's real textStyle
  // never changed). Now any field change while a clip is selected pushes a
  // (debounced, silent) update straight to that clip, matching how Adobe's
  // Properties panel behaves — "Apply to Selected" still works too, for
  // parity, but is no longer required.
  useEffect(() => {
    if (!selectedTextClip) return
    if (syncedClipIdRef.current !== selectedTextClip.id) return
    const timer = setTimeout(() => {
      onUpdateText(selectedTextClip.id, draft, { silent: true })
    }, 120)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    text, fontFamily, fontVariant, renderFontFamily, fontSize, fillEnabled, color, background, showBackground, backgroundOpacity, backgroundSize, backgroundRadius,
    strokeEnabled, strokeColor, strokeWidth, strokePosition, shadowEnabled, shadowColor, shadowDistance, shadowAngle, shadowSize, shadowOpacity, maskWithText,
    align, verticalAnchor, bold, italic, underline, allCaps, smallCaps, superscript, subscript, tracking, lineSpacing, baselineShift, wrap, lineBreakMode,
    x, y, animationIn, animationOut, animationDuration, duration,
  ])

  // Groups every installed face by its typographic family (e.g. all of
  // Poppins' weights under "Poppins") so picking a family and then a weight
  // in two dropdowns shows that family's REAL variants — "font pe click
  // karo to baaki saare (variants) show ho jaye" — instead of one flat list
  // of font names with no way to reach a specific weight.
  const loadPcFonts = async () => {
    if (!window.queryLocalFonts) return notify('This browser does not expose installed fonts; common fonts are available')
    try {
      const localFonts = await window.queryLocalFonts()
      const index = {}
      for (const font of localFonts) {
        if (!font.family) continue
        if (!index[font.family]) index[font.family] = []
        index[font.family].push({ style: font.style || 'Regular', fullName: font.fullName, postscriptName: font.postscriptName })
      }
      setFontVariantIndex((prev) => ({ ...prev, ...index }))
      const names = Object.keys(index).sort()
      setFonts((items) => [...new Set([...items, ...names])])
      notify(`${names.length} PC font families loaded (${localFonts.length} variants total)`)
    } catch {
      notify('Font access was not granted')
    }
  }

  const loadCustomFont = async (file) => {
    if (!file) return
    try {
      const family = file.name.replace(/\.[^.]+$/, '') || 'Custom Font'
      const data = await file.arrayBuffer()
      const fontFace = new FontFace(family, data)
      await fontFace.load()
      document.fonts.add(fontFace)
      const realPath = window.videoEditorDesktop?.getPathForFile?.(file) || null
      setFonts((items) => [...new Set([...items, family])])
      setCustomFontPaths((paths) => ({ ...paths, [family]: realPath }))
      setFontFamily(family)
      setFontVariant('Regular')
      setRenderFontFamily(null)
      notify(realPath ? `${family} loaded — will also burn into exported video` : `${family} loaded for preview only (export will use a close system font)`)
    } catch {
      notify('Could not load that font file')
    }
  }

  const pickColor = async (setter) => {
    if (!window.EyeDropper) return notify('Eyedropper not supported in this browser')
    try {
      const result = await new window.EyeDropper().open()
      setter(result.sRGBHex)
    } catch { /* user cancelled */ }
  }

  const updateSelected = (patch) => {
    if (!selectedTextClip) return notify('Select a text clip on the timeline first')
    onUpdateText(selectedTextClip.id, patch)
  }

  const applyPreset = (preset) => {
    setFontSize(preset.fontSize); setColor(preset.color)
    setShowBackground(preset.background !== '#00000000'); setBackground(preset.background)
    setAlign(preset.align); setBold(preset.bold); setItalic(preset.italic); setUnderline(preset.underline)
    setX(preset.x); setY(preset.y)
    setAnimationIn(preset.animationIn); setAnimationOut(preset.animationOut); setAnimationDuration(preset.animationDuration); setDuration(preset.duration)
    notify(`${preset.name} preset applied — fully customizable, edit any field below`)
  }

  const activePresetName = ANIMATION_PRESETS.find((preset) => preset.animationIn === animationIn && preset.animationOut === animationOut)?.name
  const variantOptions = variantOptionsFor(fontFamily)
  const STYLE_TOGGLES = [
    [<b>T</b>, 'Bold (faux)', bold, () => setBold((v) => !v)],
    [<i>T</i>, 'Italic (faux)', italic, () => setItalic((v) => !v)],
    ['TT', 'All Caps', allCaps, () => setAllCaps((v) => !v)],
    [<>T<sub style={{ fontSize: '.7em' }}>r</sub></>, 'Small Caps', smallCaps, () => setSmallCaps((v) => !v)],
    [<>T<sup>1</sup></>, 'Superscript', superscript, () => { setSuperscript((v) => !v); setSubscript(false) }],
    [<>T<sub>1</sub></>, 'Subscript', subscript, () => { setSubscript((v) => !v); setSuperscript(false) }],
    [<u>T</u>, 'Underline', underline, () => setUnderline((v) => !v)],
  ]
  const LINE_MODES = ['auto', 1, 2, 3, 4, 5]

  return (
    <div className="creative-panel text-workspace">
      <div className="creative-heading"><strong>PROPERTIES</strong><span>{selectedTextClip ? 'Editing selected text — changes apply live' : 'New text layer'}</span></div>

      <span className="creative-section-label">Quick style presets</span>
      <div className="text-preset-row">{TEXT_PRESETS.map((preset) => <button key={preset.name} onClick={() => applyPreset(preset)}>{preset.name}</button>)}</div>

      <textarea className="text-content-input" value={text} onChange={(event) => setText(event.target.value)} />

      <EffectSection title="Text" hint="Font, size, alignment, spacing">
        <div className="creative-row font-search-row">
          <input
            className="font-search-input"
            type="text"
            placeholder="Search fonts…"
            value={fontSearch}
            onChange={(event) => setFontSearch(event.target.value)}
          />
          <button
            type="button"
            className={`font-fav-toggle ${favoriteFonts.has(fontFamily) ? 'active' : ''}`}
            title={favoriteFonts.has(fontFamily) ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => toggleFavoriteFont(fontFamily)}
          >{favoriteFonts.has(fontFamily) ? '★' : '☆'}</button>
        </div>
        {favoriteFontList.length > 0 && (
          <div className="creative-row wrap font-favorites-row">
            {favoriteFontList.map((font) => (
              <button
                key={font}
                type="button"
                className={font === fontFamily ? 'active' : ''}
                title={`Switch to ${font}`}
                onClick={() => onFontFamilyChange(font)}
              >★ {font}</button>
            ))}
          </div>
        )}
        <div className="creative-row">
          <select value={fontFamily} onChange={(event) => onFontFamilyChange(event.target.value)}>
            {fontOptions.length ? fontOptions.map((font) => <option key={font}>{font}</option>) : <option disabled>No fonts match "{fontSearch}"</option>}
          </select>
        </div>
        <div className="creative-row">
          <select value={fontVariant} onChange={(event) => onFontVariantChange(event.target.value)}>{variantOptions.map((label) => <option key={label}>{label}</option>)}</select>
        </div>
        <div className="creative-row wrap style-icon-row">
          {STYLE_TOGGLES.map(([icon, title, active, onClick]) => (
            <button key={title} type="button" className={active ? 'active' : ''} title={title} onClick={onClick}>{icon}</button>
          ))}
        </div>
        <IconFieldRow icon={<IconSize />} value={fontSize} min={8} max={400} onChange={setFontSize} title="Font Size" />
        <div className="creative-row wrap align-icon-row">
          {['left', 'center', 'right'].map((value) => <button key={value} type="button" className={align === value ? 'active' : ''} onClick={() => setAlign(value)} title={`Align ${value}`}><IconAlign variant={value} /></button>)}
          {['top', 'middle', 'bottom'].map((value) => (
            <button key={value} type="button" className={verticalAnchor === value ? 'active' : ''} onClick={() => setVerticalAnchor(value)} title={`Vertical ${value}`}><IconVAlign variant={value} /></button>
          ))}
        </div>
        <div className="icon-field-grid">
          <IconFieldRow icon={<IconTracking />} value={tracking} min={-20} max={200} step={.5} onChange={setTracking} title="Tracking (letter spacing)" />
          <IconFieldRow icon={<IconLeading />} value={lineSpacing} min={-50} max={100} onChange={setLineSpacing} title="Line Spacing" />
          <IconFieldRow icon={<IconBaseline />} value={baselineShift} min={-50} max={50} onChange={setBaselineShift} title="Baseline Shift" />
        </div>
        <div className="creative-row wrap">
          <span className="clip-control-label">Lines</span>
          {LINE_MODES.map((mode) => (
            <button key={mode} className={lineBreakMode === mode ? 'active' : ''} onClick={() => setLineBreakMode(mode)} title={mode === 'auto' ? 'Free wrap (default)' : `Force exactly ${mode} line${mode > 1 ? 's' : ''}`}>{mode === 'auto' ? 'Auto' : mode}</button>
          ))}
        </div>
        {lineBreakMode === 'auto' && (
          <label className="text-bg-toggle"><input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} /> Wrap long text (off = single line)</label>
        )}
      </EffectSection>

      <EffectSection title="Appearance" hint="Fill, Stroke, Background, Shadow">
        <div className="appearance-row">
          <label className="text-bg-toggle"><input type="checkbox" checked={fillEnabled} onChange={(event) => setFillEnabled(event.target.checked)} /> Fill</label>
          <span className="swatch-wrap">
            <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            <button type="button" className="eyedropper-btn" title="Pick color from screen" onClick={() => pickColor(setColor)}><IconEyedropper /></button>
          </span>
        </div>

        <div className="appearance-row">
          <label className="text-bg-toggle"><input type="checkbox" checked={strokeEnabled} onChange={(event) => setStrokeEnabled(event.target.checked)} /> Stroke</label>
          <span className="swatch-wrap">
            <input type="color" value={strokeColor} onChange={(event) => setStrokeColor(event.target.value)} />
            <button type="button" className="eyedropper-btn" title="Pick color from screen" onClick={() => pickColor(setStrokeColor)}><IconEyedropper /></button>
          </span>
          {strokeEnabled && <>
            <input className="number-input small" type="number" min="0" max="60" value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))} title="Stroke width (px)" />
            <select value={strokePosition} onChange={(event) => setStrokePosition(event.target.value)} title="Stroke position (visual note: the browser always centers the stroke)">
              <option>Outer</option><option>Inner</option><option>Center</option>
            </select>
          </>}
        </div>

        <div className="appearance-row">
          <label className="text-bg-toggle"><input type="checkbox" checked={showBackground} onChange={(event) => setShowBackground(event.target.checked)} /> Background</label>
          <span className="swatch-wrap">
            <input type="color" value={background.length >= 7 ? background.slice(0, 7) : '#000000'} onChange={(event) => setBackground(`${event.target.value}b3`)} />
            <button type="button" className="eyedropper-btn" title="Pick color from screen" onClick={() => pickColor((hex) => setBackground(`${hex}b3`))}><IconEyedropper /></button>
          </span>
        </div>
        {showBackground && (
          <div className="icon-field-grid">
            <IconFieldRow icon={<IconOpacity />} value={backgroundOpacity} min={0} max={100} onChange={setBackgroundOpacity} title="Background Opacity" />
            <IconFieldRow icon={<IconSize />} value={backgroundSize} min={0} max={60} onChange={setBackgroundSize} title="Background Size (padding)" />
            <IconFieldRow icon={<IconRadius />} value={backgroundRadius} min={0} max={60} onChange={setBackgroundRadius} title="Corner Radius" />
          </div>
        )}

        <div className="appearance-row">
          <label className="text-bg-toggle"><input type="checkbox" checked={shadowEnabled} onChange={(event) => setShadowEnabled(event.target.checked)} /> Shadow</label>
          <span className="swatch-wrap">
            <input type="color" value={shadowColor} onChange={(event) => setShadowColor(event.target.value)} />
            <button type="button" className="eyedropper-btn" title="Pick color from screen" onClick={() => pickColor(setShadowColor)}><IconEyedropper /></button>
          </span>
        </div>
        {shadowEnabled && (
          <div className="icon-field-grid">
            <IconFieldRow icon={<IconDistance />} value={shadowDistance} min={0} max={60} onChange={setShadowDistance} title="Shadow Distance" />
            <IconFieldRow icon={<IconAngle />} value={shadowAngle} min={-180} max={180} onChange={setShadowAngle} title="Shadow Angle" />
            <IconFieldRow icon={<IconBlur />} value={shadowSize} min={0} max={40} onChange={setShadowSize} title="Shadow Blur" />
            <IconFieldRow icon={<IconOpacity />} value={shadowOpacity} min={0} max={100} onChange={setShadowOpacity} title="Shadow Opacity" />
          </div>
        )}

        <label className="text-bg-toggle"><input type="checkbox" checked={maskWithText} onChange={(event) => setMaskWithText(event.target.checked)} /> Mask with Text <small className="field-hint-inline">— reserved; needs a layer-grouping system we don't have yet</small></label>
      </EffectSection>

      <label className="creative-field-row">
        <span>Layer duration <small className="field-hint-inline">— total time this text stays on screen</small></span>
        <input type="number" min="0.5" step="0.5" value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
      </label>

      <EffectSection title="Animation" hint="Entrance / exit">
        <div className="text-anim-card-head">
          {activePresetName && <span className="text-anim-active-chip">{activePresetName}</span>}
        </div>

        <div className="anim-preset-row">
          {ANIMATION_PRESETS.map((preset) => (
            <button
              key={preset.name}
              className={animationIn === preset.animationIn && animationOut === preset.animationOut ? 'active' : ''}
              onClick={() => { setAnimationIn(preset.animationIn); setAnimationOut(preset.animationOut); setAnimationDuration(preset.animationDuration); notify(`${preset.name} animation applied`) }}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div className="creative-grid two">
          <label>Animation In<select value={animationIn} onChange={(event) => setAnimationIn(event.target.value)}>{TEXT_IN_ANIMATIONS.map(([label, value]) => <option key={label} value={value}>{label}</option>)}</select></label>
          <label>Animation Out<select value={animationOut} onChange={(event) => setAnimationOut(event.target.value)}>{TEXT_OUT_ANIMATIONS.map(([label, value]) => <option key={label} value={value}>{label}</option>)}</select></label>
        </div>

        <label className="creative-field-row anim-duration-field">
          <span>
            {animationIn === 'Word Reveal' || animationIn === 'Typewriter' ? 'Reveal duration' : 'Anim duration'}
            <small className="field-hint-inline">— entrance/exit only, separate from Layer duration above</small>
          </span>
          <input type="number" min="0.1" max="8" step="0.1" value={animationDuration} onChange={(event) => setAnimationDuration(Number(event.target.value))} />
        </label>
        <div className="anim-speed-row">
          {[['Fast', .3], ['Normal', .8], ['Slow', 1.6]].map(([label, value]) => (
            <button key={label} className={animationDuration === value ? 'active' : ''} onClick={() => setAnimationDuration(value)}>{label}</button>
          ))}
        </div>
      </EffectSection>

      {selectedTextClip ? (
        <TextAlignTransformSection clip={selectedTextClip} onUpdate={onUpdateTransform} playhead={playhead} setPlayhead={setPlayhead} />
      ) : (
        <p className="field-hint-inline align-transform-hint">Add the layer first — Align and Transform (position, anchor, scale, rotation, opacity, all keyframeable) appears here once a text clip is selected.</p>
      )}

      <span className="creative-section-label">Fonts</span>
      <div className="creative-row wrap">
        <button onClick={loadPcFonts}>Load PC Fonts</button>
        <button onClick={() => customFontRef.current?.click()}>Custom Font</button>
        <input ref={customFontRef} type="file" accept=".ttf,.otf,.woff,.woff2" hidden onChange={(event) => loadCustomFont(event.target.files?.[0])} />
      </div>

      <div className="creative-actions">
        <button className="primary" onClick={() => onAddText(draft)}>+ Add Text Layer</button>
        <button onClick={() => updateSelected(draft)}>Apply to Selected</button>
      </div>
    </div>
  )
}

export function TransitionWorkspace({ onApply, notify }) { const [duration,setDuration]=useState(.45); const transitions=['Cross Dissolve','Fade','Dip to Black','Dip to White','Slide Left','Slide Right','Push','Zoom In','Zoom Out','Smooth Zoom In','Smooth Zoom Out','Zoom In + Distort','Zoom Out + Distort','Zoom In Rotate','Zoom Out Rotate','Rotate + Zoom','Camera Push In','Camera Pull Out','Camera Pan Left','Camera Pan Right','Camera Tilt Up','Camera Tilt Down','Camera Shake','Handheld Camera','Whip Pan Left','Whip Pan Right','Light Leak Warm','Light Leak Cool','Light Leak Film','Flash','Blur Transition','Spin Zoom']; return <div className="creative-panel"><div className="creative-heading"><strong>TRANSITIONS</strong><span>Apply to selected video clip</span></div><label className="creative-slider">Duration <input type="range" min="0.1" max="2" step="0.05" value={duration} style={{'--range-progress':((duration-0.1)/1.9)*100}} onChange={(event)=>setDuration(Number(event.target.value))}/><span>{duration.toFixed(2)}s</span></label><div className="preset-grid">{transitions.map((transition)=><button key={transition} onClick={()=>{onApply(transition,duration);notify(`${transition} applied`)}}>{transition}</button>)}</div></div> }
export function EffectsWorkspace({ onApply,onReset,notify }) { const [intensity,setIntensity]=useState(50); const effects=['Blur','Sharpen','Vignette','Grayscale','Brightness','Contrast','Saturate','Sepia','Hue Rotate','Film Grain']; return <div className="creative-panel"><div className="creative-heading"><strong>VIDEO EFFECTS</strong><button onClick={()=>{onReset();notify('Effects reset')}}>Reset</button></div><label className="creative-slider">Intensity <input type="range" min="0" max="100" value={intensity} style={{'--range-progress':intensity}} onChange={(event)=>setIntensity(Number(event.target.value))}/><span>{intensity}%</span></label><div className="preset-grid">{effects.map((effect)=><button key={effect} onClick={()=>{onApply(effect,intensity);notify(`${effect} applied`)}}>{effect}</button>)}</div></div> }

const BUILT_IN_SFX = [
  {id:'whoosh',name:'Whoosh',duration:.7},{id:'whoosh-fast',name:'Whoosh Fast',duration:.4},{id:'impact',name:'Impact Hit',duration:.5},{id:'cinematic-hit',name:'Cinematic Hit',duration:.8},{id:'pop',name:'Pop',duration:.25},{id:'rise',name:'Rise',duration:1.2},{id:'glitch',name:'Glitch',duration:.55},{id:'bass',name:'Bass Drop',duration:.9},{id:'swipe',name:'Swipe',duration:.45},{id:'boom',name:'Boom',duration:1},{id:'typing',name:'Typing',duration:.8},{id:'notification',name:'Notification',duration:.35},{id:'click',name:'Camera Click',duration:.2},{id:'transition',name:'Transition Sweep',duration:.65},{id:'reverse',name:'Reverse Whoosh',duration:.8},{id:'riser-short',name:'Short Riser',duration:.7}
].map((sfx)=>({...sfx,url:`${import.meta.env.BASE_URL}sfx/${sfx.id}.wav`,packaged:true}))

export function SfxWorkspace({ onAddSfx, notify }) {
  const [mode,setMode]=useState('library')
  const [search,setSearch]=useState(''); const fileRef=useRef(null); const previewRef=useRef(null); const filtered=useMemo(()=>BUILT_IN_SFX.filter((sfx)=>sfx.name.toLowerCase().includes(search.toLowerCase())),[search])
  const [smartText,setSmartText]=useState(''); const [smartResults,setSmartResults]=useState([])
  const previewSfx=(sfx)=>{if(!sfx)return notify('No built-in SFX for this — import one manually');try{previewRef.current?.pause();const audio=new Audio(sfx.url);previewRef.current=audio;audio.play().catch(()=>notify('Could not preview that SFX'))}catch{notify('Could not preview that SFX')}}
  const importOwnSfx=(file)=>{if(!file)return;const url=URL.createObjectURL(file);const sourcePath=window.videoEditorDesktop?.getPathForFile?.(file)||'';const audio=new Audio(url);audio.addEventListener('loadedmetadata',()=>{onAddSfx({id:`custom-${Date.now()}`,name:file.name,duration:Number.isFinite(audio.duration)?audio.duration:3,url,sourcePath,custom:true});notify(sourcePath?`${file.name} added to timeline`:`${file.name} added for preview only — will be skipped in export`)},{once:true});audio.addEventListener('error',()=>notify('Could not read that audio file'),{once:true})}
  const runSmartFinder=()=>{
    const lines=splitScriptText(smartText)
    if(!lines.length)return notify('Scene ya action describe karo pehle')
    setSmartResults(lines.map((text,index)=>({id:`smart-${index}-${Date.now()}`,text,suggestion:suggestSfxForLine(text)})))
    notify(`${lines.length} line(s) analyzed`)
  }
  const addSmartSfx=(suggestion)=>{const sfx=getLibrarySfx(suggestion?.libraryId);if(!sfx)return notify('No built-in SFX for this — import one manually');onAddSfx(sfx)}
  return <div className="creative-panel sfx-workspace">
    <div className="creative-heading">
      <strong>{mode==='library'?'SFX LIBRARY':'SFX SMART FINDER'}</strong>
      <div className="sfx-mode-row">
        <button className={mode==='library'?'active':''} onClick={()=>setMode('library')}>Browse Library</button>
        <button className={mode==='smart'?'active':''} onClick={()=>setMode('smart')}>Smart Finder</button>
      </div>
      {mode==='library' && <button onClick={()=>fileRef.current?.click()}>+ Import SFX</button>}
    </div>
    {mode==='library' ? <>
      <input className="creative-search" placeholder="Search SFX" value={search} onChange={(event)=>setSearch(event.target.value)}/>
      <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(event)=>importOwnSfx(event.target.files?.[0])}/>
      <div className="sfx-list">{filtered.map((sfx)=><div className="sfx-row" key={sfx.id} draggable onDragStart={(event)=>{event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('application/x-video-editor-sfx',JSON.stringify(sfx))}}><button className="sfx-play" onClick={()=>previewSfx(sfx)}>▶</button><span>{sfx.name}</span><small>{sfx.duration.toFixed(2)}s</small><button onClick={()=>onAddSfx(sfx)}>Add</button></div>)}</div>
    </> : <div className="sfx-smart-finder">
      <p className="sfx-smart-hint">Scene ya action likho (ek line ya poora script paste karo) — matching sound suggest karega. Free, rule-based hai, koi API nahi.</p>
      <textarea className="sfx-smart-input" value={smartText} onChange={(event)=>setSmartText(event.target.value)} placeholder="e.g. He knocked on the door nervously, then the phone rang..."/>
      <div className="sfx-smart-actions"><button className="primary" onClick={runSmartFinder}>Find Matching SFX</button></div>
      <div className="sfx-smart-results">
        {smartResults.map((item)=>(
          <div className="sfx-smart-row" key={item.id}>
            <span className="sfx-smart-text">{item.text}</span>
            {item.suggestion ? <div className="sfx-smart-match">
              <span className={`sfx-smart-chip${item.suggestion.libraryId?'':' missing'}`}>{item.suggestion.libraryId?item.suggestion.libraryName:item.suggestion.label}</span>
              {item.suggestion.libraryId && <>
                <button onClick={()=>previewSfx(getLibrarySfx(item.suggestion.libraryId))}>▶</button>
                <button onClick={()=>addSmartSfx(item.suggestion)}>+ Add</button>
              </>}
              {item.suggestion.note && <small className="sfx-smart-note">{item.suggestion.note}</small>}
            </div> : <span className="sfx-smart-none">No specific SFX cue detected — browse library manually</span>}
          </div>
        ))}
      </div>
    </div>}
  </div>
}
