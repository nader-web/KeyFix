# KeyFix — Arabic/English Typo Fixer

Fix text typed on the **wrong keyboard layout** instantly — right in your browser.
Typed a whole paragraph in English while your keyboard was on Arabic (or the reverse)?
KeyFix converts it in place, character for character. **100% local — nothing ever leaves your device.**

```
;lhv hgrhlfm —→ the message
المنتدى ←— lge,kn
```

## Features

- **Popup converter** — paste or type the wrong-layout text, get the fixed version, copy it back. Auto-detects direction (`ar2en` / `en2ar`), or swap manually.
- **Real-time detection** — while you type on any page, KeyFix watches for wrong-layout text and plays a soft chime with a bilingual fix chooser when it's confident (≥ 80% of characters map).
- **Fix selection** — select any text on a page and fix it via context menu (`Ctrl+Shift+L`) or the toolbar popup (`Ctrl+Shift+K`).
- **Works everywhere** — runs in all frames, including same-origin iframes (TinyMCE and other rich editors).
- **Dark & light themes**, animated shortcut hints, MIT licensed.

## Install (from source)

1. Download or clone this repository.
2. Open `chrome://extensions` (works in Chrome, Edge, Brave, and other Chromium browsers; Firefox needs minor manifest adjustments).
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.

## Usage

| Action | How |
|---|---|
| Convert pasted text | Click the KeyFix icon (or `Ctrl+Shift+K`) |
| Fix selected text on a page | Right-click → *Fix "…" with KeyFix*, or `Ctrl+Shift+L` |
| Get alerted while typing | Just type — after a short pause KeyFix checks what you wrote |
| Toggle theme | Sun/moon button inside the popup |

### Detection tuning

The real-time detector lives at the top of [`content.js`](content.js):

| Constant | Default | Meaning |
|---|---|---|
| `IDLE_MS` | `1500` | Pause before analyzing typed text |
| `MIN_WORDS` | `3` | Minimum words before checking |
| `CONFIDENCE_THRESHOLD` | `0.8` | Share of characters that must map to the other layout |
| `COOLDOWN_MS` | `8000` | Minimum time between alerts per field |

## How it works

The engine ([`keymap.js`](keymap.js)) is dependency-free and pure:

- Forward maps (`UNSHIFTED`, `SHIFTED`) translate each physical key between the Arabic and US layouts.
- Reverse maps are built from the forward maps; ASCII punctuation produced by shifted keys is deliberately excluded so mixed-language text isn't mangled.
- Multi-character sequences like `لا`, `لإ`, `لأ`, `لآ` are converted atomically with lookahead.
- `detectDirection(text)` returns `"ar2en"`, `"en2ar"`, or `null` when ambiguous.

```js
KeyFixMap.convert(";lhv hgrhlfm", "ar2en"); // "the message"
KeyFixMap.detectDirection("لولخ");          // "ar2en"
```

## Project structure

```
├── manifest.json      # MV3 manifest: permissions, commands, content scripts
├── keymap.js          # Layout maps + convert()/detectDirection() engine
├── content.js         # Real-time detection, chime, bilingual fix chooser
├── background.js      # Service worker: context menus + message routing
├── popup.html/js      # Manual conversion UI
├── icons/             # Extension icons (16/32/48/128)
└── tests/
    ├── test-suite.html        # Manual smoke tests (open in a tab)
    └── e2e/                   # Playwright suite (extension loaded in Chromium)
```

## Testing

The automated E2E suite loads the real extension into Chromium via Playwright:

```bash
cd tests/e2e
bun install
bunx playwright install chromium
bun run test                 # full matrix
KEYFIX_QUICK=1 bun run test  # 6 representative viewports, skip @slow
```

Or open `tests/test-suite.html` in a browser tab for quick manual checks.

## Privacy

KeyFix requires no network access and stores nothing about you. All conversion,
detection, and audio happen locally. Permissions used:

- `contextMenus` — the "Fix …" right-click entry
- `storage` — your preferences (theme, toggles)
- `activeTab` + `scripting` — replacing selected text on the page you're on

## License

[MIT](LICENSE)
