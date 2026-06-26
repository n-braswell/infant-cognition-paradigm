# Pill rotation — how the 180° flip is made (and how to re-do it in 2 minutes)

This is the one doc to read before you touch the pill animation. It explains the
look we landed on, why it's built the way it is, and — most importantly — **how to
swap in new pill drawings without redoing any of the hard work.**

---

## What the animation uses

The study movie (`design.html`) does **not** rotate the pill live. It plays a
**pre-baked flipbook**: 37 PNG frames per colour, 0° (front) → 180° (back), stored in:

```
_shared/frames/yellow_000.png … yellow_036.png    (happy / yellow pill)
_shared/frames/red_000.png    … red_036.png       (angry / red pill)
```

`design.html` just draws the right frame for the current angle. So **the entire look
of the flip lives in those 74 PNGs.** Swapping the art = re-baking those 74 PNGs.
Nothing in `design.html` needs to change.

The frames are produced by a headless 3D renderer (Three.js) kept in
`_archive/` — see "Re-swapping" below. You never have to open it by hand.

---

## The look we landed on (what made it right)

Each frame is a **real 3D extruded tablet**, rendered orthographically and unlit, with:

- **Front face = the drawing, pasted exactly.** Unlit, full-resolution, no relighting,
  no warping. It is the PNG, untouched.
- **Back face = the drawn back** (`_shared/back_new.png`), same treatment.
- **Side (the peel) = uniform light gray** (`#c4c4c4`) — the gray of the back peel.
- **One crisp black outline of consistent weight** on the front, the side, and the back,
  matching the weight of the art's own drawn outline.
- **Edge-on (~90°): both black edge-lines stay visible** — front rim line, gray middle,
  back rim line.
- Body is **exactly as tall/wide as the front face** (silhouette traced from the art's
  own alpha), so nothing of the side or back peeks out at 0°.

### The three problems we had to kill (don't reintroduce them)

1. **Gray "splotches" on the side.** Caused by two meshes (black slab + gray inset)
   having **coincident side-walls over the same depth** → z-fighting. Fixed by building
   the body as **three non-overlapping depth bands**: a thin black *front lip*, the gray
   *middle*, a thin black *back lip*. Zero coincident geometry → no z-fighting, uniform
   gray side, and both edge-lines show edge-on. No `polygonOffset` tricks.

2. **Only one black line near 90°.** That was the old inverted-hull outline (it only
   outlines the away-facing edge). The three-band construction above fixes this for free.

3. **Gray/white halo hugging the outer black line.** This was **baked into the source
   PNGs**: background removal left a ~4px *opaque* light-gray matte ramp
   (≈ `132 → 78 → 24 → black`) just outside the drawn outline. Because it's opaque,
   `alphaTest` can't drop it. Fixed by **recoloring that rim to black** (`defringe()` in
   the renderer): any opaque pixel within R=4px of the transparent edge is painted solid
   black. This kills the halo *without trimming the silhouette*, so the drawn outline
   keeps its **full, as-in-the-PNG thickness** everywhere.
   - NOTE: an earlier version *eroded* the alpha instead. Erosion (a square min-filter)
     recedes diagonals/corners ~√2× faster than flat edges, which **thinned and unevened
     the outline** — corners looked heavier, sides thinner. That's why we recolor, not
     erode. Don't switch it back.
   - The outline is **not perfectly uniform**, and that's intentional: the heavier-top /
     thinner-sides look is in the original artwork. We render it faithfully (decision
     2026-06-25: keep it as the PNG). If you ever want a truly constant line, it has to be
     fixed in the source art, not the renderer.

---

## Re-swapping the drawings (the whole point of this doc)

The new art will be roughly the same pill shape, so this is now trivial. **You do not
need to open or fiddle with the 3D generator UI** — one command re-bakes everything.

### 1. Replace the three source PNGs (keep the same filenames)

```
_shared/happy_cut.png     ← new yellow / happy front
_shared/angry_cut.png     ← new red / angry front
_shared/back_new.png      ← new shared back
```

Requirements for the new PNGs (the same as the current ones):
- Transparent background (background already removed).
- The pill roughly fills the image; a soft/anti-aliased or matte edge is **fine** —
  `defringe()` cleans it automatically.
- Front art has its black outline drawn in (we don't add one; we trace and frame it).

### 2. Make sure a static server is running at the project root

```
python3 -m http.server 8011
```
(Run it from this folder — the project root. Leave it running.)

### 3. Re-bake all 74 frames

```
cd _archive/render
node bake.mjs
```

That's it. It writes fresh `yellow_*.png` / `red_*.png` into `_shared/frames/`,
overwriting the old ones. Reload `design.html` and the new pills flip correctly.

To eyeball the result before trusting it:
```
node shotcheck.mjs   # → outcheck_turn.png : 0/20/40/60/90/120/150/180° contact sheet
node shotzoom.mjs    # → zoom_0/40/90.png  : high-res single angles
```

### If the new art needs a tweak (usually it won't)

Open `_archive/pill-3d-generator.html` and adjust, then re-bake:

| Symptom | Knob (in the file) |
| --- | --- |
| Outline too thick / thin | `ow = W*0.026` in `buildPill()` |
| Gray/white fringe still showing | widen the black rim: `defringe(img, R=4)` → `5` or `6` |
| Side peel too thick / thin | `thick: 0.12` in `state` (or the Thickness slider) |
| Side gray wrong shade | `edge: '#c4c4c4'` in `state` |
| Geometry pokes past the outline | `fx/fy` inset (`ow*0.4`) in `buildPill()` |
| Number of frames | `frames: 37` in `state` (must match what `design.html` expects) |

---

## Where everything lives

```
design.html                  the study movie (plays the baked frames) — LIVE
_shared/frames/              the 74 baked frames the movie plays — LIVE, regenerated by bake
_shared/happy_cut.png        source art (front yellow)
_shared/angry_cut.png        source art (front red)
_shared/back_new.png         source art (shared back)

_archive/pill-3d-generator.html   the 3D renderer (source of the look) — drives the bake
_archive/render/bake.mjs          headless re-bake script (the command above)
_archive/render/shotcheck.mjs     QA contact sheet
_archive/render/shotzoom.mjs      QA high-res single angles
_archive/legacy/                  superseded experiments & old scratch art (safe to ignore)
```

Keep `_archive/` around — it's how you re-bake. Everything in it is parked, not deleted.
