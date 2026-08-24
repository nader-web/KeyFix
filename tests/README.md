# KeyFix Test Suite

Two layers:

| Layer | Entry | What it covers |
|---|---|---|
| Manual browser suite | `tests/test-suite.html` (open in a tab) | Detection heuristics & conversion smoke tests |
| **Automated E2E suite** | `tests/e2e` (this folder) | Real extension loaded in Chromium: engine, popup, content script, service worker, and every screen size |

## Run

Uses **bun** (package cache at `G:\.bun-store` via `BUN_INSTALL_CACHE_DIR`):

```bash
cd tests/e2e
bun install
bunx playwright install chromium
bun run test
```

Useful variations:

```bash
KEYFIX_QUICK=1 bun run test        # 6 representative viewports instead of the full 24-size matrix
bun run test:quick                 # skip @slow-tagged tests
KEYFIX_WORKERS=4 bun run test      # more parallel browser instances
KEYFIX_BROWSER_CHANNEL=chrome bun run test   # use installed Google Chrome instead of bundled Chromium
```

A tiny static server (`server.js`, port 8899) serves the fixture pages; Playwright starts it automatically.

## What is tested

### `specs/keymap.spec.js` — conversion engine
- en2ar / ar2en for words, digits, whitespace, unmapped unicode
- Shift states: harakat, hamza forms, Arabic punctuation (`؟ ، ؛ ÷ ×`)
- Multi-char ligatures (`لا لأ لإ لآ`) including adjacent sequences
- Round-trip properties over **every** key on both keyboard rows
- Documented engine behaviors: lossy reverse for ASCII-valued shifted keys
  (`( ) { } < > D F L Z C V M`) and the `gh → لا → b` ligature ambiguity
- Regression: printable ASCII passes through `ar2en` untouched (mixed text no
  longer mangles `, . ' / [ ] { } ~ < >` into letters)
- `detectDirection` heuristics incl. diacritics and majority rules
- `manifest.json`: MV3 shape, permissions, declared assets exist on disk

### `specs/popup.spec.js`
Auto/manual direction, swap, clear, copy + toast, theme persistence, last-input
restoration, `kf_pendingSelection` from the context menu, real-time toggle,
shortcut-hints lifecycle (fresh / seen×2 / interaction / Escape /
reduced-motion), accessibility names.

### `specs/content.spec.js`
Real typing on a fixture page with idle-timer detection:
- Full-sentence fix in both directions via the indicator dot
- Plausible English / short text never trigger
- Re-typing hides pending alerts; deletion resets the cooldown
- Bilingual chooser (`ع` / EN), mouse + keyboard, arabic-majority regression
- Editable surfaces: `<input>`, `<textarea>`, contenteditable, **shadow DOM**, **iframe**
- Indicator z-index above overlays, click hit-testing, framework-visible input events

### `specs/background.spec.js`
Service worker context menus (ids, contexts, `%s` title), keyboard command
registration, worker responsiveness across popup activity.

### `specs/responsive.spec.js` — all screen sizes
Runs popup + content-script checks across a 24-viewport matrix covering small
phones (320×480), large phones, landscape phones, tablets (both orientations),
laptops (1280→1536), desktops (1600→2560), ultrawide (3440) and 4K:

1. Popup renders, no horizontal overflow (≥400px wide), tap targets ≥20px
   (toggle ≥24px), conversion works, copy toast stays inside the viewport
2. Indicator dot appears inside the viewport on centered fields and **clamps**
   correctly for fields pinned to the top-right (latin) and bottom-left (arabic)
3. Bilingual chooser fits inside the viewport and remains clickable

## Notes & known trade-offs

- Popups have a fixed 380px body; Chrome sizes real popups to fit, so overflow
  assertions only apply at viewports ≥400px.
- The seven-plus-punctuation "lossy" shifted keys are an intentional keymap
  trade-off: their outputs are plain ASCII, and protecting real punctuation in
  mixed text beats recovering those shift-states heuristically.
- Tests wait out the content script's 1.5s idle timer; the full matrix takes a
  few minutes — use `KEYFIX_QUICK=1` while iterating.
