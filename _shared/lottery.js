// ===================================================================
// _shared/lottery.js
//
// Single source of truth for the lottery paradigm visuals shared by
// every infant-cognition study (1_possibilities_over_locations,
// 2_probabilistic_deduction, 3_statistical_learning_vs_logic).
//
// Visual vocabulary mirrors the canonical canvas-based animation at
// 2_probabilistic_deduction/paradigm-animation.html:
//   * Pills are capsule-shaped (rounded rectangle), with a colored
//     top portion (yellow = happy, red = angry) and a gray bottom.
//   * The top portion carries a simple face: two eyes plus a smile
//     (happy) or a downward frown (angry).
//   * Pills live inside a rectangular ARENA. A blue/gray OCCLUDER
//     panel can slide over the arena to hide its contents.
//   * A short translucent TUBE hangs below the center of the arena.
//     A pill traveling through it is silhouetted in gray.
//   * Below the tube is a REVEAL slot where the dispensed pill comes
//     to rest. A separate cover can hide that slot.
//
// USAGE: load via a classic <script> tag (NOT type=module) so the
// file works equally over file:// and http://. The library attaches
// itself to `window.Lottery`:
//
//   <script src="../_shared/lottery.js"></script>
//   <script>
//     const { lotterySVG } = Lottery;
//     container.innerHTML = lotterySVG({ pills: ['happy','angry'] });
//   </script>
//
// Edit colors, geometry, or face shapes HERE and every consumer
// updates automatically.
// ===================================================================
(function (global) {

// ----------------------------------------------------------------
// CANVAS (viewBox) — every state is rendered at this native size.
// Consumers scale via the wrapping <svg> width / height / viewBox.
// ----------------------------------------------------------------
const STAGE_W = 700;
const STAGE_H = 600;

// A tight viewBox that crops out the empty space above the arena and
// below the dispensed-out pill. Use via `tightViewBox()` below.
// 12px padding on each side keeps strokes from getting clipped.
const TIGHT_PAD = 12;

// ----------------------------------------------------------------
// PILL geometry — matches 2_probabilistic_deduction/paradigm-animation
// constants so that pills look identical across canvas and SVG.
// ----------------------------------------------------------------
const PILL_W = 60;
const PILL_H = 95;
const PILL_R = PILL_W / 2;           // capsule corner radius (half of width)
const COLOR_SPLIT = 0.62;            // top 62 % colored, bottom 38 % gray

// ----------------------------------------------------------------
// ARENA geometry — rectangle that holds the pills.
// ----------------------------------------------------------------
const ARENA_X = 100;
const ARENA_Y = 80;
const ARENA_W = 460;
const ARENA_H = 360;
const ARENA_CX = ARENA_X + ARENA_W / 2;
const ARENA_CY = ARENA_Y + ARENA_H / 2;

// ----------------------------------------------------------------
// TUBE geometry — translucent capsule-tube hanging below arena.
// ----------------------------------------------------------------
// Tube is intentionally NARROWER than the pill (PILL_DRAW_W ≈ 53 px)
// so the visible bulge reads as "tube being forced open by the pill"
// rather than as an arbitrary thickening of the wall. Empty (above and
// below the pill) the tube sits at this natural width; at the pill's
// y-position the wall is pushed outward to (pillHalfW + tubeBulge) to
// accommodate it.
const TUBE_W = 42;
// Tube ~2× the pill height so the pill clearly travels through it and
// the elastic bulge is localized to the pill's y-position.
const TUBE_H = 112;   // shorter chute; pill travel auto-slows to keep descent timing/sound
const TUBE_X = ARENA_CX - TUBE_W / 2;
const TUBE_TOP = ARENA_Y + ARENA_H;
const TUBE_BOT = TUBE_TOP + TUBE_H;

// ----------------------------------------------------------------
// REVEAL position — matches PILL_SETTLE_Y in the canvas paradigm:
// the dispensed pill rests with its TOP still inside the tube and
// its bottom hanging out below (the classic "sticking out of the
// tube" look in the prob-deduction animation).
// ----------------------------------------------------------------
const REVEAL_CX = ARENA_CX;
// Silhouette sits HIGH (still inside the tube). A revealed pill sits
// LOWER (it has been dispensed OUT of the tube).
const REVEAL_CY     = TUBE_BOT - 38;  // silhouette rest: pill's visible bottom (~34px below center) clears TUBE_BOT
const REVEAL_CY_OUT = TUBE_BOT + PILL_H * 0.55;  // dispensed-out position

// ----------------------------------------------------------------
// THEME — restyle the entire system by editing these values.
// ----------------------------------------------------------------
const THEME = {
  arenaFill:    '#FFFBF0',
  arenaStroke:  '#5FB6CC',
  arenaSW:      5,
  occluderFill: '#8898B0',
  occluderStr:  '#6878A0',
  occluderSW:   3,
  occluderStripe: 'rgba(100,120,150,0.12)',

  tubeBody:     'rgba(160,214,236,0.30)',
  tubeWall:     'rgba(28,112,130,0.95)',
  tubeRim:      '#1C7082',
  tubeRimStr:   '#103840',

  pillGray:     '#B0B0B0',
  pillGrayStr:  '#999999',
  happyFill:    '#FFCC00',
  happyStroke:  '#CC9900',
  angryFill:    '#DD3333',
  angryStroke:  '#AA1111',
  faceInk:      '#2A1A0A',
  faceWhite:    '#FFFFFF',
  smileFill:    '#F5F0E8',
  smileStroke:  '#996633',

  silhouette:   '#B0B0B0',
  silhouetteSt: '#9C9C9C',
};

// ----------------------------------------------------------------
// SLOT POSITIONS inside the arena (cx,cy for N pills, centered).
// cy is fixed (vertical center of arena); cx is symmetric around
// arena center.
// ----------------------------------------------------------------
function slotsFor(n) {
  const cy = ARENA_CY;
  if (n === 0) return [];
  if (n === 1) return [{ cx: ARENA_CX, cy }];
  if (n === 2) return [
    { cx: ARENA_CX - 100, cy },
    { cx: ARENA_CX + 100, cy },
  ];
  // n === 4 — happy pair on the LEFT, angry pair on the RIGHT, with
  // a clear gap between the two groups so the colors read as two
  // distinct teams instead of an evenly-spaced row.
  if (n === 4) return [
    { cx: ARENA_CX - 145, cy },
    { cx: ARENA_CX -  70, cy },
    { cx: ARENA_CX +  70, cy },
    { cx: ARENA_CX + 145, cy },
  ];
  // n === 3 (or > 4) — fall back to evenly spread.
  const span = ARENA_W * 0.6;
  const step = span / (n - 1);
  const x0 = ARENA_CX - span / 2;
  return Array.from({ length: n }, (_, i) => ({ cx: x0 + i * step, cy }));
}

// ----------------------------------------------------------------
// PILL ARTWORK — bitmap drawings replace the SVG-painted capsule.
//
// Both PNGs in _shared/ are padded to the SAME canvas size with the
// pills' dark-outline centroids aligned to canvas center (verified
// to within ~1 px), so swapping happy↔angry doesn't shift the
// drawing. PNG canvas ratio drives PILL_DRAW_W / PILL_DRAW_H below.
//
// Path is relative to the consuming HTML document (every study lives
// one folder deep, so ../_shared/<name>.png works uniformly).
// ----------------------------------------------------------------
// Asset base: study pages live one folder deep, so '../' is the default. A page
// at a different depth (e.g. the root-level design.html) sets
// window.LOTTERY_ASSET_BASE before loading this script (e.g. '' for the root).
const ASSET_BASE = (typeof window !== 'undefined' && window.LOTTERY_ASSET_BASE != null)
  ? window.LOTTERY_ASSET_BASE : '../';
const PILL_ART = {
  happy: `${ASSET_BASE}_shared/yellow.png`,
  angry: `${ASSET_BASE}_shared/red.png`,
};
// Pre-rendered rotation frames (37 per color, 5° apart). Frame 000 is
// the front face; 036 is the gray back ("hidden" state — replaces the
// SVG silhouette). Any angle 0–180° picks the nearest frame.
const PILL_FRAME_PATH = (kind, rotationDeg) => {
  const k = (kind === 'angry') ? 'red' : 'yellow';
  const idx = Math.max(0, Math.min(36, Math.round(rotationDeg / 5)));
  return `${ASSET_BASE}_shared/frames/${k}_${String(idx).padStart(3, '0')}.png`;
};
// PNG intrinsic aspect (1086 × 1542 ≈ 0.704). The drawn pills feel
// visually smaller than the old SVG capsule unless we scale up a
// touch; 1.4× lands roughly the same outline width as the old PILL_W.
const PILL_DRAW_SCALE = 0.803;       // another 15 % smaller (was 0.945)
const PILL_PNG_ASPECT = 1086 / 1542;
const PILL_DRAW_H = PILL_H * PILL_DRAW_SCALE;
const PILL_DRAW_W = PILL_DRAW_H * PILL_PNG_ASPECT;
// The pill PNG canvas (1086 × 1542) was padded by 30 px on every side
// past the pill's visible outline, so the actual ink only fills 1026
// × 1482 of the canvas. Consumers that want to do collision against
// the visible outline (e.g. the physics sim in study 3) should scale
// PILL_DRAW_W / PILL_DRAW_H by these ratios.
const PILL_VISIBLE_RATIO_W = 1026 / 1086;   // ≈ 0.945
const PILL_VISIBLE_RATIO_H = 1482 / 1542;   // ≈ 0.961

// ----------------------------------------------------------------
// PILL — returns SVG markup for one pill centered at (cx, cy).
// type: 'happy' (yellow) | 'angry' (red)
// scale: 1 = native draw size; pass a smaller number to shrink.
// ----------------------------------------------------------------
function renderPill(type, cx, cy, scaleX = 1, scaleY, rotationDeg = 0) {
  // scaleY defaults to scaleX (uniform). Pass a different scaleY for
  // squish/stretch animation (preserveAspectRatio="none" then lets
  // the PNG distort vertically vs horizontally).
  if (scaleY === undefined) scaleY = scaleX;
  // Pick the rotation frame for any angle in 0–180°. At 0 the pill
  // shows its face; at 180 the back. Frame 000 matches the source PNG
  // so animation tweens through rot=0 land on the same artwork.
  const href = PILL_FRAME_PATH(type, rotationDeg);
  if (!href) return '';
  const w = PILL_DRAW_W * scaleX;
  const h = PILL_DRAW_H * scaleY;
  return `<image href="${href}" x="${cx - w/2}" y="${cy - h/2}"
            width="${w}" height="${h}"
            preserveAspectRatio="none"/>`;
}

// A "silhouette" pill — the BACK of one of the drawn pills (rotation
// frame 036). Replaces the old SVG capsule. The choice of color key
// doesn't matter for the back view — both yellow and red backs are
// identical gray with the same outline.
function renderSilhouette(cx, cy, scaleX = 1, scaleY) {
  if (scaleY === undefined) scaleY = scaleX;
  return renderPill('happy', cx, cy, scaleX, scaleY, 180);
}

// Reveal indicator — currently disabled. The previous purple halo
// Neutral-coloured "split-frame" burst behind the revealed pill —
// Confetti burst — SVG equivalent of the canvas drawFireworks().
// Same deterministic hash, same colors/physics. `p` is state.burst (0→1).
function renderBurst(cx, cy, p) {
  if (p <= 0.001 || p >= 1) return '';
  const BURST_COLORS = ['#6E8BE6', '#7E72E4', '#9270E2', '#A07BDC', '#5B7BE6', '#B488EC'];
  const N = 120, maxR = PILL_W * 3.1, gravity = PILL_H * 0.65;
  const rand = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const ease   = 1 - (1 - p) * (1 - p);
  const launch = Math.min(1, p / 0.06);
  const fade   = Math.pow(Math.max(0, 1 - p), 0.9);
  const alpha  = Math.min(1, launch * fade);
  if (alpha < 0.005) return '';
  let s = '';
  for (let i = 0; i < N; i++) {
    const ang  = i * 2.399963 + (rand(i, 1) - 0.5) * 0.7;
    const sp   = 0.5 + rand(i, 2) * 0.5;
    const dist = ease * maxR * sp;
    const x    = cx + Math.cos(ang) * dist;
    const y    = cy + Math.sin(ang) * dist + p * p * gravity;
    const size = (2.5 + rand(i, 4) * 3.0) * (1 - 0.4 * p);
    const col  = BURST_COLORS[Math.floor(rand(i, 3) * BURST_COLORS.length)];
    s += `<rect x="${(x-size/2).toFixed(1)}" y="${(y-size/2).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" fill="${col}" opacity="${alpha.toFixed(3)}"/>`;
  }
  return s;
}

// twelve cream rays + a soft cream halo, drawn before the pill so it
// sits on top. `intensity` ∈ [0, 1] controls overall opacity / size so
// the keyframes can animate a quick burst (0 → 1 → 0).
function renderFireworks(cx, cy, intensity = 1) {
  const i = Math.max(0, Math.min(1, intensity));
  if (i <= 0.001) return '';
  const scale  = 0.85 + 0.45 * i;     // 0.85 → 1.30
  const opa    = i;
  const rayLen = PILL_H * 0.95 * scale;
  const innerR = PILL_W * 0.50 * scale;
  const ringR  = PILL_W * 0.62 * scale;
  const RAYS   = 12;
  const COLOR_RAY  = '#9C8868';
  const COLOR_HALO = '#E8DECF';
  let rays = '';
  for (let k = 0; k < RAYS; k++) {
    const ang = (k * (360 / RAYS) - 90) * Math.PI / 180;
    const x1 = innerR * Math.cos(ang);
    const y1 = innerR * Math.sin(ang);
    const x2 = (innerR + rayLen) * Math.cos(ang);
    const y2 = (innerR + rayLen) * Math.sin(ang);
    rays += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
                   stroke="${COLOR_RAY}" stroke-width="${4 * scale}"
                   stroke-linecap="round" opacity="0.75"/>`;
  }
  return `<g transform="translate(${cx}, ${cy})" opacity="${opa}">
            <circle cx="0" cy="0" r="${ringR}" fill="${COLOR_HALO}" opacity="0.55"/>
            ${rays}
          </g>`;
}

// ----------------------------------------------------------------
// SCENE — top-level renderer.
//
// Visual contract follows the canvas paradigm-animation:
//   * Pills sit inside a rectangular arena.
//   * An opaque OCCLUDER panel (with subtle vertical texture stripes)
//     hides the arena contents when arenaCover > 0.
//   * A short translucent TUBE hangs below the arena. When a pill is
//     "in the tube" (tubePill) it is drawn as a gray silhouette
//     visible through the tube's translucent wall.
//   * A dispensed-and-revealed pill (revealedPill) is drawn in full
//     color resting in space just below the tube — no surrounding
//     box, no question mark.
//
// state {
//   pills:        ['happy'|'angry', ...] inside the arena.
//   arenaCover:   0..1 opacity of opaque cover over the arena.
//   revealedPill: null | 'happy' | 'angry' | 'silhouette'
//                 A pill resting just below the tube.
//                   'happy'      → yellow pill, fully revealed
//                   'angry'      → red pill, fully revealed
//                   'silhouette' → gray faceless pill (dispensed, but
//                                  identity hidden — used in study 3
//                                  critical trials).
//                 Always drawn at the same size as the arena pills.
//   shakeX:       pixel offset applied to the arena (gentle shake).
// }
//
// opts { tx, ty, scale }   transform applied to the whole scene.
// Returns SVG inner markup. Caller wraps it in an <svg viewBox=...>.
// ----------------------------------------------------------------
function renderScene(state = {}, opts = {}) {
  const { tx = 0, ty = 0, scale = 1 } = opts;
  const {
    pills           = [],
    arenaCover      = 0,
    revealedPill    = null,
    shakeX          = 0,
    // Horizontal fraction of the arena that the cover spans, anchored on
    // the LEFT side (so the RIGHT side of the arena is exposed when < 1).
    // Use a negative value to anchor on the right instead (cover sits on
    // the right; left side is exposed). 1 = full cover (default).
    coverFraction   = 1,
    coverAnchor     = 'left',  // 'left' | 'right' — which side the cover hugs
    // Opacity (0..1) applied to the pills inside the arena. Use < 1 to
    // ghost the pills (looks like a second, semi-transparent screen sits
    // over them).
    pillsOpacity    = 1,
    // Optional probability overlay drawn at the bottom of the canvas
    // (in the white space below the tube). { happy: 0..1, angry: 0..1 }
    // or null to omit. Colors match the pill fills exactly.
    probs           = null,
    // When true, draws a radial fireworks/sparkle burst centered on the
    // dispensed pill. Makes the reveal event salient even if the pill
    // itself is hidden, blocked, or off-screen of the infant's gaze.
    fireworks       = false,
    burst           = 0,
    // When true, the dispensed pill is rendered as a GRAY SILHOUETTE
    // instead of its actual identity — the reveal event happens (halo,
    // pill in dispensed position) but the infant cannot see whether
    // the dispensed pill was happy or angry. Used in the Baseline,
    // Supports, and Contradicts conditions where the test asks whether
    // the infant infers the identity from the deduction phase.
    coverRevealedPill = false,
    // Per-color animation offsets + per-axis scales — used by study 3's
    // intro "dance" sequence so the yellow happy pills can squish-jump
    // and the red angry pills can shudder before the rest of the trial
    // plays.
    yellowDx = 0, yellowDy = 0, yellowScaleX = 1, yellowScaleY = 1,
    redDx    = 0, redDy    = 0, redScaleX    = 1, redScaleY    = 1,
    // Per-pill offsets (indexed by position in `pills`) — used by the
    // "mixing" phase after the dances, where each pill wanders on its
    // own path so the group clearly scrambles.
    pillOffsets = null,
    // ELASTIC-TUBE animation parameters. When revealedPill is set
    // (silhouette or color), the pill is drawn inside / below the tube.
    //   tubePillY        — y-position of the silhouette while traveling
    //                       through the tube. null → falls back to the
    //                       existing static REVEAL_CY.
    //   tubePillScaleX/Y — squeeze the silhouette pill as it's pressed
    //                       between the tube walls. <1 on X = squeezed
    //                       horizontally, >1 on Y = stretched vertically.
    //   tubeBulge        — px the tube wall bulges out past the pill's
    //                       half-width at the pill's y position (the
    //                       elastic deformation). Higher = tube stretches
    //                       further around the pill.
    //   tubeTaper        — px above and below the bulge over which the
    //                       tube tapers back to its normal width. Higher
    //                       = smoother, springier tube; lower = sharper,
    //                       more localized bulge.
    tubePillY      = null,
    tubePillScaleX = 1,
    tubePillScaleY = 1,
    tubeBulge      = 4,
    tubeTaper      = PILL_H * 0.55,
    // Skip rendering the arena rectangle + its contents. Used by the
    // isolated tube-exit workspace so the arena floor doesn't bleed
    // into the viewBox.
    hideArena      = false,
    // Occlusion-mode "built-in door" that slides in from the right.
    // 0 = none, 1 = fully covers the arena window.
    occluderFrac   = 0,
  } = state;

  let s = `<g transform="translate(${tx},${ty}) scale(${scale})">`;

  // -------- ARENA + pills + cover (whole group shakes together) --------
  // Wrap in `if (!hideArena)` so the tube-only workspace can opt out.
  if (!hideArena) {
  s += `<g transform="translate(${shakeX},0)">`;

  // Arena rectangle
  s += `<rect x="${ARENA_X}" y="${ARENA_Y}" width="${ARENA_W}" height="${ARENA_H}"
         rx="14" ry="14"
         fill="${THEME.arenaFill}" stroke="${THEME.arenaStroke}"
         stroke-width="${THEME.arenaSW}"/>`;

  // Pills inside arena. `pills` may contain null/undefined entries to
  // leave a slot empty while keeping the rest of the layout fixed
  // (used in partial-reveal frames where the hidden side of the arena
  // shouldn't render a pill that the cover is hiding anyway). When
  // `pillsOpacity` < 1, all pills inside the arena are rendered
  // semi-transparent — used in fam to show the arena opens but the
  // pills inside are still hidden behind an inner screen.
  const slots = slotsFor(pills.length);
  if (pills.some(Boolean)) {
    const op = (typeof pillsOpacity === 'number') ? pillsOpacity : 1;
    const wrapOpen  = op < 1 ? `<g opacity="${op}">` : '';
    const wrapClose = op < 1 ? `</g>` : '';
    s += wrapOpen;
    pills.forEach((entry, i) => {
      const slot = slots[i];
      if (!slot || !entry) return;
      // Entry can be a plain string ('happy' | 'angry' | 'silhouette')
      // OR an object {kind, rot} with a per-pill rotation in degrees.
      // Rotation 0 = face out, 180 = back (hidden). 'silhouette' string
      // is a back-rotated yellow (any color works — backs are identical).
      let kind, rot;
      if (typeof entry === 'string') {
        if (entry === 'silhouette') { kind = 'happy'; rot = 180; }
        else                         { kind = entry;   rot = 0;   }
      } else {
        kind = entry.kind;
        rot  = (typeof entry.rot === 'number') ? entry.rot : 0;
      }
      let cx = slot.cx, cy = slot.cy;
      let sx = 1, sy = 1;
      if (kind === 'happy') {
        cx += yellowDx; cy += yellowDy;
        sx = yellowScaleX; sy = yellowScaleY;
      } else if (kind === 'angry') {
        cx += redDx; cy += redDy;
        sx = redScaleX; sy = redScaleY;
      }
      if (pillOffsets && pillOffsets[i]) {
        cx += pillOffsets[i].dx || 0;
        cy += pillOffsets[i].dy || 0;
      }
      s += renderPill(kind, cx, cy, sx, sy, rot);
    });
    s += wrapClose;
  }

  // Arena cover — opaque panel with subtle vertical texture stripes,
  // mirroring the canvas drawOccluder. (No "?" anywhere.) When
  // coverFraction < 1, the cover spans only that horizontal portion of
  // the arena, anchored to coverAnchor side, leaving the other side
  // exposed (used for partial-reveal trials).
  if (arenaCover > 0) {
    const frac = Math.max(0, Math.min(1, coverFraction));
    const coverW = ARENA_W * frac;
    const coverX = coverAnchor === 'right'
      ? ARENA_X + ARENA_W - coverW
      : ARENA_X;
    if (coverW > 0) {
      s += `<rect x="${coverX}" y="${ARENA_Y}" width="${coverW}" height="${ARENA_H}"
             rx="14" ry="14"
             fill="${THEME.occluderFill}" stroke="${THEME.occluderStr}"
             stroke-width="${THEME.occluderSW}" opacity="${arenaCover}"/>`;
      // Texture stripes (drawn at full opacity, on top of the cover).
      const stripeOp = arenaCover;
      const stripeStart = coverX + 22;
      const stripeEnd   = coverX + coverW - 10;
      for (let xx = stripeStart; xx < stripeEnd; xx += 22) {
        s += `<rect x="${xx}" y="${ARENA_Y + 14}" width="1.2" height="${ARENA_H - 28}"
               fill="${THEME.occluderStripe}" opacity="${stripeOp}"/>`;
      }
    }
  }

  // Occlusion-mode "built-in door" — warm cream-taupe panel sliding in from the
  // right (matches drawOccluder() in design.html). occluderFrac 0→1.
  if (occluderFrac > 0) {
    const r = 14, B = ARENA_Y + ARENA_H, xR = ARENA_X + ARENA_W;
    const w = ARENA_W * Math.min(1, occluderFrac), x0 = xR - w;
    const fullLeft = x0 <= ARENA_X + 0.5;
    const uid = 'occ' + (renderScene._uid = (renderScene._uid || 0) + 1);
    // panel outline: right corners always rounded; left corners rounded only when closed
    const d = fullLeft
      ? `M ${ARENA_X + r},${ARENA_Y} H ${xR - r} Q ${xR},${ARENA_Y} ${xR},${ARENA_Y + r} V ${B - r} Q ${xR},${B} ${xR - r},${B} H ${ARENA_X + r} Q ${ARENA_X},${B} ${ARENA_X},${B - r} V ${ARENA_Y + r} Q ${ARENA_X},${ARENA_Y} ${ARENA_X + r},${ARENA_Y} Z`
      : `M ${x0},${ARENA_Y} H ${xR - r} Q ${xR},${ARENA_Y} ${xR},${ARENA_Y + r} V ${B - r} Q ${xR},${B} ${xR - r},${B} H ${x0} Z`;
    s += `<defs><linearGradient id="${uid}" x1="0" y1="${ARENA_Y}" x2="0" y2="${B}" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#eef7fa"/><stop offset="0.5" stop-color="#d9e9ef"/><stop offset="1" stop-color="#c4dbe3"/>
          </linearGradient></defs>`;
    if (!fullLeft) s += `<rect x="${x0 - 16}" y="${ARENA_Y}" width="16" height="${ARENA_H}" fill="#1c505f" opacity="0.18"/>`;  // cool shadow left
    s += `<path d="${d}" fill="url(#${uid})"/>`;
    for (let k = 1; k <= 3; k++) {                                  // faint teal seams + hairline highlight
      const yy = ARENA_Y + ARENA_H * k / 4;
      s += `<line x1="${x0 + 14}" y1="${yy}" x2="${xR - 10}" y2="${yy}" stroke="#1C7082" stroke-width="1.5" stroke-opacity="0.16" stroke-linecap="round"/>`;
      s += `<line x1="${x0 + 14}" y1="${yy + 1.3}" x2="${xR - 10}" y2="${yy + 1.3}" stroke="#ffffff" stroke-width="1" stroke-opacity="0.45" stroke-linecap="round"/>`;
    }
    s += `<rect x="${x0}" y="${ARENA_Y}" width="2.5" height="${ARENA_H}" fill="${THEME.tubeWall}"/>`;          // teal trim edge
    s += `<rect x="${x0 + 2.5}" y="${ARENA_Y}" width="1.5" height="${ARENA_H}" fill="#f5fcfe" opacity="0.7"/>`; // bright lip
  }
  s += `</g>`; // end shake group
  } // end if (!hideArena)

  // -------- TUBE (translucent capsule) --------
  //
  // Render order matters here: the in-tube silhouette pill must sit
  // BEHIND the translucent tube body so the blue fill tints it
  // (the pill reads as "inside the tube" rather than "in front of"
  // it). Then the opaque rim is drawn LAST so it hides any pill that
  // tries to poke up above the tube top while it's still entering.
  //
  //   1. Silhouette (only when in-tube)   ← behind everything
  //   2. Tube body                         ← translucent, tints silhouette
  //   3. Tube rim                          ← opaque, on top

  // 1. Silhouette (drawn BEFORE the tube body so the translucent blue
  //    tints the part of the pill that's inside the tube).
  if (revealedPill === 'silhouette') {
    const py = (typeof tubePillY === 'number') ? tubePillY : REVEAL_CY;
    s += renderSilhouette(REVEAL_CX, py, tubePillScaleX, tubePillScaleY);
  }

  // Tube body. When a pill (silhouette) is inside the tube, the tube
  // bulges outward around the pill — drawn as a path with a wider belly
  // at the pill's y-position so the tube looks stretched. Otherwise
  // it's just a simple rectangle.
  let rimHalfW = TUBE_W / 2 + 4;   // ring half-width; updated below when pill is in tube
  if (revealedPill === 'silhouette') {
    // Bulge geometry: the pill sits at `ymid` (state.tubePillY, default
    // REVEAL_CY) with squeezed half-width `PILL_R * tubePillScaleX`.
    // Tube wall at the bulge is pushed `tubeBulge` px past that
    // squeezed pill edge. Above and below, the tube tapers back to its
    // normal width over `tubeTaper` px — bigger taper = springier feel.
    const pillHalfW = (PILL_DRAW_W / 2) * tubePillScaleX;
    const tubeHX = TUBE_W / 2;               // wall half-width at top/bottom
    const cx     = ARENA_CX;
    const y0     = TUBE_TOP;
    const y1     = TUBE_BOT;
    const pillY  = (typeof tubePillY === 'number') ? tubePillY : REVEAL_CY;
    // The pill silhouette can sit ABOVE the tube top while it's still
    // entering (or below the bottom while it's exiting). Clamp the
    // BULGE position into the tube so the path stays well-formed,
    // and FADE the bulge out smoothly as the pill moves past the
    // tube edge so there's no hard pop.
    const margin = 4;
    const ymid   = Math.max(y0 + margin, Math.min(y1 - margin, pillY));
    // distance the pill center is OUTSIDE the tube — used to attenuate
    // the bulge as the pill enters/exits.
    const overshoot = Math.max(0, y0 - pillY, pillY - y1);
    // 0..1 attenuation: full bulge when pill is well inside, zero
    // bulge by the time the pill center is one pill-radius past the
    // tube edge.
    const insideFactor = Math.max(0, 1 - overshoot / (PILL_H / 2));
    const half   = tubeHX + (pillHalfW - tubeHX + tubeBulge) * insideFactor;
    const taper  = tubeTaper;

    // How close is the pill to each end of the tube? When the pill is
    // within `taper` of the bottom, there isn't room for the wall to
    // taper all the way back to tubeHX, so we BLEND the lower endpoint
    // from tubeHX (pill mid-tube) toward `half` (pill at the rim). The
    // tube wall then stays flared at the bottom rather than fighting a
    // squashed taper. Same logic mirrored for the top edge.
    const distFromTop = Math.max(0, ymid - y0);
    const distFromBot = Math.max(0, y1 - ymid);
    const upperBlend  = Math.max(0, Math.min(1, 1 - distFromTop / taper));
    const lowerBlend  = Math.max(0, Math.min(1, 1 - distFromBot / taper));
    const wallStartX  = tubeHX + (half - tubeHX) * upperBlend;   // x at y = y0
    const wallEndX    = tubeHX + (half - tubeHX) * lowerBlend;   // x at y = y1
    rimHalfW = wallStartX + 4;   // ring tracks the tube's actual top-edge width
    // Control-point y-offsets shrink when there isn't enough room.
    const upperCtrlY  = Math.min(taper * 0.35, distFromTop * 0.55);
    const lowerCtrlY  = Math.min(taper * 0.35, distFromBot * 0.55);
    // The straight-wall top/bottom only exist when there IS room
    // (i.e. when blend is 0). When blend > 0, the wall curves all the
    // way to the tube edge — no straight segment.
    const yTop2 = Math.max(y0 + margin, ymid - taper);
    const yBot2 = Math.min(y1 - margin, ymid + taper);

    // Build a symmetric closed path around the tube center line. The
    // LEFT wall reads: top edge (at wallStartX) → optional straight
    // segment → curve out to bulge → curve back to wallEndX → bottom
    // edge. Mirror on the right.
    const d = [
      `M ${cx - wallStartX} ${y0}`,
      `L ${cx - tubeHX}     ${yTop2}`,
      `Q ${cx - half}       ${ymid - upperCtrlY}, ${cx - half} ${ymid}`,
      `Q ${cx - half}       ${ymid + lowerCtrlY}, ${cx - tubeHX} ${yBot2}`,
      `L ${cx - wallEndX}   ${y1}`,
      `Q ${cx}              ${y1 + 4},            ${cx + wallEndX} ${y1}`,
      `L ${cx + tubeHX}     ${yBot2}`,
      `Q ${cx + half}       ${ymid + lowerCtrlY}, ${cx + half} ${ymid}`,
      `Q ${cx + half}       ${ymid - upperCtrlY}, ${cx + tubeHX} ${yTop2}`,
      `L ${cx + wallStartX} ${y0}`,
      `Z`,
    ].join(' ');

    s += `<path d="${d}" fill="${THEME.tubeBody}"
           stroke="${THEME.tubeWall}" stroke-width="2.5"
           stroke-linejoin="round"/>`;
  } else {
    // No pill in tube — simple capsule shape.
    s += `<rect x="${TUBE_X}" y="${TUBE_TOP}" width="${TUBE_W}" height="${TUBE_H}"
           rx="6" ry="6"
           fill="${THEME.tubeBody}" stroke="${THEME.tubeWall}" stroke-width="2.5"/>`;
  }

  // 3. Rim across the top of the tube — drawn LAST so it sits on top
  //    of the tube body AND hides any pill that pokes up above
  //    TUBE_TOP while it's still entering.
  s += `<rect x="${ARENA_CX - rimHalfW}" y="${TUBE_TOP-3}" width="${rimHalfW * 2}" height="10"
         rx="3" fill="${THEME.tubeRim}" stroke="${THEME.tubeRimStr}" stroke-width="1.5"/>`;

  // -------- BURST + FIREWORKS — drawn BEFORE the pill so the pill sits on top --
  if (burst > 0)     { s += renderBurst(REVEAL_CX, REVEAL_CY_OUT, burst); }
  if (fireworks > 0) { s += renderFireworks(REVEAL_CX, REVEAL_CY_OUT, fireworks); }

  // -------- REVEALED dispensed pill — sits in space below the tube --------
  // The 'silhouette' case is already drawn above (behind the tube body,
  // so the translucent blue tints the in-tube part). Here we only need
  // to handle the colored dispensed-out case.
  if (revealedPill && revealedPill !== 'silhouette') {
    // Revealed pill has been dispensed OUT — sits lower than silhouette.
    // If coverRevealedPill is set, the pill's identity is hidden
    // (rendered as a silhouette in the dispensed-out position) even
    // though the reveal event still occurs (halo, position change).
    if (coverRevealedPill) {
      s += renderSilhouette(REVEAL_CX, REVEAL_CY_OUT);
    } else {
      s += renderPill(revealedPill, REVEAL_CX, REVEAL_CY_OUT);
    }
  }

  // -------- Probability overlay (optional) --------
  // Sits in the WHITE SPACE that already exists in the deduction
  // frame: to the LEFT and RIGHT of the dispensed-out pill area.
  // No viewBox extension — the labels fit in dead space the scene
  // wasn't using. Sized as large as possible without overlapping
  // the tube/pill or running off the canvas.
  if (probs && (probs.happy != null || probs.angry != null)) {
    const pct = (v) => `${Math.round(v * 100)}%`;
    // Vertical center of the white band beside the dispensed pill.
    // Sits centered between the tube bottom and the viewBox bottom
    // (≈ REVEAL_CY_OUT). Use that y so labels align with the pill.
    const labelY    = REVEAL_CY_OUT + 14;  // visual baseline
    const fontSize  = 64;
    // Place labels far out toward the left/right edges of the arena
    // so they don't crowd the centered tube/pill column.
    const xHappy = ARENA_X + 110;
    const xAngry = ARENA_X + ARENA_W - 110;
    s += `<text x="${xHappy}" y="${labelY}"
              text-anchor="middle" font-size="${fontSize}"
              font-weight="800"
              font-family="Helvetica Neue, Helvetica, sans-serif"
              fill="${THEME.happyFill}">${pct(probs.happy)}</text>`;
    s += `<text x="${xAngry}" y="${labelY}"
              text-anchor="middle" font-size="${fontSize}"
              font-weight="800"
              font-family="Helvetica Neue, Helvetica, sans-serif"
              fill="${THEME.angryFill}">${pct(probs.angry)}</text>`;
  }

  s += `</g>`;
  return s;
}

// ----------------------------------------------------------------
// Convenience wrapper — returns a complete standalone <svg> at the
// native stage size. Pass a different viewBox or transform via opts
// to embed in larger / smaller contexts.
// ----------------------------------------------------------------
function sceneSVG(state, viewBox = `0 0 ${STAGE_W} ${STAGE_H}`, opts) {
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg"
                preserveAspectRatio="xMidYMid meet">`
       + renderScene(state, opts)
       + `</svg>`;
}

// ----------------------------------------------------------------
// Returns a viewBox string that tightly crops the canvas to the
// largest extent the visuals occupy across all states: arena (top)
// down through the fully-dispensed pill below the tube (bottom),
// plus a small uniform padding. The same viewBox is suitable for
// EVERY state so frames remain visually consistent regardless of
// whether their dispensed pill is silhouette or revealed.
// ----------------------------------------------------------------
function tightViewBox(pad = TIGHT_PAD) {
  const x0 = ARENA_X - pad;
  const y0 = ARENA_Y - pad;
  // Bottom-most element is the revealed (dispensed-out) pill,
  // centered at REVEAL_CY_OUT with half-height PILL_H/2.
  const y1 = REVEAL_CY_OUT + PILL_H / 2 + pad;
  const w  = ARENA_W + pad * 2;
  const h  = y1 - y0;
  return `${x0} ${y0} ${w} ${h}`;
}

// Shorthand: scene rendered into the tight viewBox.
function tightSceneSVG(state, opts) {
  return sceneSVG(state, tightViewBox(), opts);
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------
global.Lottery = {
  // geometry constants
  STAGE_W, STAGE_H,
  PILL_W, PILL_H, COLOR_SPLIT,
  PILL_DRAW_W, PILL_DRAW_H, PILL_VISIBLE_RATIO_W, PILL_VISIBLE_RATIO_H,
  ARENA_X, ARENA_Y, ARENA_W, ARENA_H, ARENA_CX, ARENA_CY,
  TUBE_X, TUBE_TOP, TUBE_W, TUBE_H, TUBE_BOT,
  REVEAL_CX, REVEAL_CY, REVEAL_CY_OUT,
  // Arena stroke width — exposed so the physics sim can offset the
  // wall-collision bounds by half the stroke so pill outlines sit
  // perfectly inside the arena outline.
  arenaSW: THEME.arenaSW,

  // theme + primitives
  THEME,
  renderPill,
  renderSilhouette,
  renderFireworks,
  renderScene,
  sceneSVG,
  tightViewBox,
  tightSceneSVG,

  // back-compat alias for the previous library shape
  lotterySVG: sceneSVG,
};

})(typeof window !== 'undefined' ? window : globalThis);
