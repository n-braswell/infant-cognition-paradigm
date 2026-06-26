# Sounds — what's live

Active clips live in this folder (`_shared/sounds/`). Every raw take, source clip,
alternate, and ElevenLabs original is in `sources/` (nothing here is wired to the
animation — it's the archive used to build the active files).

## Active cues (design.html → SOUND_DEFAULTS / SOUND_CUES)

| Cue | File | Fires at (beat) | Notes |
|-----|------|-----------------|-------|
| happySeq | `seq_happy.mp3` | yellowDance | dance music + "yay" (premixed) |
| angrySeq | `seq_angry.mp3` | redDance | dance music + male voice (premixed) |
| orbit | `whoosh_orbit_flat.mp3` | orbit | Web Audio, live gain envelope |
| flip | `flip.mp3` | turn / reveal / rehide | the 3D turnarounds (not the dispense) |
| ding | `ding.mp3` | revealHold ×2 | the two reveal pops |
| tubeSlide | `tube_slide.mp3` | exit | slide whistle down the tube |
| vibrate | `vibrate.mp3` | preSpit | 2.5s rattle (cartoon hollow object), builds to the pop |
| pop | `pop__light0.ogg` | spit | tube snaps the pill out |
| revealChime | `reveal_combo.mp3` | dispense | reveal chime + firework pop |

CC0 Kenney `*.ogg` clips also live here (library candidates). See `CREDITS.md`.

## sources/
Raw ElevenLabs originals (`src_*.mp3`), pre-mix stems (`music_*`, `voice_*`),
and earlier takes/alternates. Keep for rebuilding; not loaded at runtime.
