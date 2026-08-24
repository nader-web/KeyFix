// KeyFix Content Script — Real-time wrong-layout detection with subtle sound alert
// Runs in all frames (including same-origin iframes for TinyMCE, etc.)

(function () {
  "use strict";

  // ── Configuration ──────────────────────────────────────────────
  const IDLE_MS = 1500;           // pause before analyzing
  const MIN_WORDS = 3;            // minimum words to trigger
  const CONFIDENCE_THRESHOLD = 0.8; // 80% chars must map
  const COOLDOWN_MS = 8000;       // don't alert more than once per 8s per field

  // ── State ──────────────────────────────────────────────────────
  let idleTimer = null;
  let lastAlertTime = 0;
  let audioCtx = null;
  let isEnabled = true;
  let alertedField = null;
  const textLengths = new WeakMap(); // field -> last known text length

  // ── Sound: Soft chime (Web Audio API) ─────────────────────────
  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playChime() {
    try {
      const ctx = ensureAudioContext();
      const now = ctx.currentTime;

      // Two-tone chime: gentle, not alarming
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.value = 880;  // A5
      osc2.frequency.value = 1108; // C#6 (major third)

      gain.gain.value = 0;
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      // Quick attack, gentle decay
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.6);
      osc2.stop(now + 0.6);
    } catch (e) {
      // Silently fail if audio blocked
    }
  }

  // ── Load KeyFixMap (injected via manifest) ────────────────────
  // KeyFixMap is globally available from keymap.js (loaded in manifest)

  // ── Detection Logic ───────────────────────────────────────────
  function analyzeText(text) {
    if (!text || text.trim().length < 3) return null;

    const words = text.trim().split(/\s+/);
    if (words.length < MIN_WORDS) return null;

    function changedRatio(original, converted) {
      let changed = 0;
      let total = 0;
      for (let i = 0; i < original.length; i++) {
        const o = original[i];
        if (/[\s\n\r]/.test(o)) continue;
        total++;
        if (o !== converted[i]) changed++;
      }
      return total > 0 ? changed / total : 0;
    }

    function isPlausibleEnglish(s) {
      const ws = s.trim().split(/\s+/).filter((w) => w.length >= 2);
      if (ws.length === 0) return false;
      let v = 0;
      for (const w of ws) if (/[aeiouAEIOU]/.test(w)) v++;
      return v / ws.length > 0.4;
    }

    // Bilingual = contains both scripts → chooser must be offered regardless
    // of plausibility, since one script is intentionally the other language.
    const isBilingualText = /[\u0600-\u06FF]/.test(text) && /[a-zA-Z]/.test(text);

    const en2ar = KeyFixMap.convert(text, "en2ar");
    const ar2en = KeyFixMap.convert(text, "ar2en");
    const en2arRatio = changedRatio(text, en2ar);
    const ar2enRatio = changedRatio(text, ar2en);
    const direction = en2arRatio > ar2enRatio ? "en2ar" : "ar2en";
    const confidence = Math.max(en2arRatio, ar2enRatio);

    // Bilingual text never takes the global full-fix path: word-count dominance
    // there reflects script majority, not the typo direction. Route it to the
    // per-word analysis below so the language chooser is offered instead.
    if (!isBilingualText && confidence >= CONFIDENCE_THRESHOLD) {
      const converted = direction === "en2ar" ? en2ar : ar2en;
      // Avoid false positives when layout actually matches typing:
      // Latin that is already plausible English should not be flagged as en2ar wrong
      // Arabic whose en2ar-converted English is implausible is real Arabic, not wrong
      if (direction === "en2ar" && isPlausibleEnglish(text)) return null;
      if (direction === "ar2en" && !isPlausibleEnglish(converted)) return null;
      return { direction, confidence, converted, en2arRatio, ar2enRatio };
    }

    // Mixed / partially fixed sentences: e.g. "أنا مسافر ا yhk ihpsd hgals hd,m"
    let en2arWords = 0;
    let ar2enWords = 0;
    for (const w of words) {
      if (w.length < 2) continue;
      const wEn2ar = KeyFixMap.convert(w, "en2ar");
      const wAr2en = KeyFixMap.convert(w, "ar2en");
      const rEn = changedRatio(w, wEn2ar);
      const rAr = changedRatio(w, wAr2en);
      if (rEn >= CONFIDENCE_THRESHOLD && rEn > rAr) en2arWords++;
      else if (rAr >= CONFIDENCE_THRESHOLD && rAr > rEn) ar2enWords++;
    }
    const dominant = en2arWords > ar2enWords ? "en2ar" : "ar2en";
    const dominantCount = Math.max(en2arWords, ar2enWords);
    if (dominantCount >= 2) {
      const converted = dominant === "en2ar" ? en2ar : ar2en;
      // Bilingual text always gets the chooser; single-script text keeps
      // the plausibility guards to avoid false positives.
      if (!isBilingualText) {
        if (dominant === "en2ar" && isPlausibleEnglish(text)) return null;
        if (dominant === "ar2en" && !isPlausibleEnglish(converted)) return null;
      }
      const partialConfidence = dominantCount / words.length;
      return { direction: dominant, confidence: partialConfidence, converted, en2arRatio, ar2enRatio, partial: true, bilingual: isBilingualText, en2arWords, ar2enWords };
    }

    return null;
  }

  // ── UI: Subtle indicator dot near caret ───────────────────────
  let indicator = null;

  // Position relative to the field's container box (works uniformly for
  // inputs, textareas and rich editors). Side follows the language of the
  // typed text: Arabic-dominant → left of container, Latin-dominant → right.
  function computeIndicatorPosition(target, width, height) {
    const rect = target.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const detected = KeyFixMap.detectDirection(getEditableText(target));
    const latinDominant = detected === "en2ar";
    let left = latinDominant ? rect.right + 6 : rect.left - width - 6;
    let top = rect.top + rect.height / 2 - height / 2;
    left = Math.max(8, Math.min(left, vw() - width - 8));
    top = Math.max(8, Math.min(top, vh() - height - 8));
    return { left: left + scrollX, top: top + scrollY };
  }

  function vw() { return document.documentElement.clientWidth || window.innerWidth; }
  function vh() { return document.documentElement.clientHeight || window.innerHeight; }

  function showIndicatorNearCaret(target, result) {
    if (!target || typeof target.getBoundingClientRect !== "function") return;
    if (indicator) indicator.remove();

    const isPartial = !!(result && result.partial);

    if (isPartial) {
      indicator = document.createElement("div");
      indicator.id = "keyfix-indicator";
      indicator.setAttribute("role", "group");
      indicator.setAttribute("aria-label", "KeyFix: mixed layout detected. Choose language to fix to.");
      indicator.style.cssText = `
        position: absolute;
        display: flex; align-items: center; gap: 6px;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 20px;
        padding: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 2147483647;
        opacity: 0;
        transform: scale(0.85);
        transition: opacity 0.18s ease, transform 0.18s ease;
      `;

      function makeBtn(label, ariaLabel, title, bg, color, dir) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        btn.setAttribute("aria-label", ariaLabel);
        btn.title = title;
        btn.style.cssText = `
          width: 30px; height: 26px;
          border: none; border-radius: 14px;
          background: ${bg}; color: ${color};
          font: 700 12px/1 system-ui, sans-serif;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.12s ease, filter 0.12s ease;
        `;
        btn.addEventListener("mouseenter", () => { btn.style.transform = "scale(1.08)"; });
        btn.addEventListener("mouseleave", () => { btn.style.transform = "scale(1)"; });
        btn.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); applyFix(target, dir); });
        btn.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); applyFix(target, dir); } });
        return btn;
      }

      // Bilingual: no pre-selection — script majority ≠ typo direction, so the
      // user must choose. Single-script partials keep directional highlight.
      const highlightAr = !result.bilingual && result.direction === "en2ar";
      const highlightEn = !result.bilingual && result.direction === "ar2en";
      const btnAr = makeBtn("ع", "Fix to Arabic", "Switch to Arabic (en → AR)", highlightAr ? "#d46b45" : "#f3f4f6", highlightAr ? "#fff" : "#374151", "en2ar");
      const btnEn = makeBtn("EN", "Fix to English", "Switch to English (AR → EN)", highlightEn ? "#d46b45" : "#f3f4f6", highlightEn ? "#fff" : "#374151", "ar2en");
      indicator.appendChild(btnAr);
      indicator.appendChild(btnEn);

      const chooserWidth = 76;
      const chooserHeight = 36;
      const pos = computeIndicatorPosition(target, chooserWidth, chooserHeight);
      indicator.style.left = `${pos.left}px`;
      indicator.style.top = `${pos.top}px`;
      document.body.appendChild(indicator);
      requestAnimationFrame(() => { indicator.style.opacity = "1"; indicator.style.transform = "scale(1)"; });
      return;
    }

    indicator = document.createElement("div");
    indicator.id = "keyfix-indicator";
    indicator.setAttribute("role", "button");
    indicator.setAttribute("tabindex", "0");
    indicator.setAttribute("aria-label", "KeyFix: wrong keyboard layout detected. Activate to fix text.");
    indicator.title = "Wrong layout detected — click to fix (Enter)";
    indicator.style.cssText = `
      position: absolute;
      display: flex; align-items: center; justify-content: center;
      width: 26px; height: 26px;
      background: #d46b45;
      color: #fff;
      font: 700 14px/1 system-ui, sans-serif;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(212,107,69,0.45);
      cursor: pointer;
      pointer-events: auto;
      z-index: 2147483647;
      opacity: 0;
      transform: scale(0.6);
      transition: opacity 0.18s ease, transform 0.18s ease;
      user-select: none;
    `;
    indicator.textContent = "\u21C4";

    indicator.addEventListener("mouseenter", () => {
      indicator.style.transform = "scale(1.15)";
      indicator.style.boxShadow = "0 3px 12px rgba(212,107,69,0.6)";
    });
    indicator.addEventListener("mouseleave", () => {
      indicator.style.transform = "scale(1)";
      indicator.style.boxShadow = "0 2px 8px rgba(212,107,69,0.45)";
    });

    const indicatorWidth = 26;
    const pos = computeIndicatorPosition(target, indicatorWidth, indicatorWidth);
    indicator.style.left = `${pos.left}px`;
    indicator.style.top = `${pos.top}px`;

    document.body.appendChild(indicator);
    requestAnimationFrame(() => {
      indicator.style.opacity = "1";
      indicator.style.transform = "scale(1)";
    });

    const forcedDir = result ? result.direction : null;
    indicator.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      applyFix(target, forcedDir);
    });
    indicator.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        applyFix(target, forcedDir);
      }
    });
  }

  function hideIndicator() {
    if (indicator) {
      const el = indicator;
      indicator = null;
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 200);
    }
  }

  // ── Apply Fix ─────────────────────────────────────────────────
  function applyFix(target, forcedDirection) {
    const text = getEditableText(target);
    if (!text) return;

    let converted;
    if (forcedDirection) {
      converted = KeyFixMap.convert(text, forcedDirection);
    } else {
      const result = analyzeText(text);
      if (!result) return;
      converted = result.converted;
    }

    replaceEditableText(target, converted);
    textLengths.set(target, converted.length);
    hideIndicator();
    alertedField = null;
    playChime();
    lastAlertTime = Date.now();
    target.focus();
  }

  // ── Editable Text Helpers ─────────────────────────────────────
  function getEditableText(el) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      return el.value;
    }
    if (el.isContentEditable) {
      return el.textContent || "";
    }
    return "";
  }

  function replaceEditableText(el, newText) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = newText;
      // Try to preserve cursor position reasonably
      el.setSelectionRange(start, start + newText.length);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (el.isContentEditable) {
      el.textContent = newText;
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {}
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // ── Editable Element Detection (handles iframes, shadow DOM) ──
  function getActiveEditable() {
    // Check active element in this frame
    let el = document.activeElement;
    if (el && isEditable(el)) return el;

    // Walk up for contenteditable ancestor
    while (el && el !== document.body) {
      if (el.isContentEditable) return el;
      el = el.parentElement;
    }

    // Check shadow DOM
    el = document.activeElement;
    while (el) {
      if (el.shadowRoot) {
        const activeInShadow = el.shadowRoot.activeElement;
        if (activeInShadow && isEditable(activeInShadow)) return activeInShadow;
      }
      el = el.parentElement;
    }

    return null;
  }

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
      const type = el.type?.toLowerCase();
      return !["checkbox", "radio", "file", "button", "submit", "reset", "hidden", "image"].includes(type);
    }
    return el.isContentEditable === true;
  }

  // ── Idle Detection ────────────────────────────────────────────
  function onInput(e) {
    if (!isEnabled) return;

    const target = e.target && isEditable(e.target) ? e.target : getActiveEditable();
    if (!target) return;

    const text = getEditableText(target);
    const prevLen = textLengths.get(target);
    textLengths.set(target, text.length);

    // Fresh typing invalidates any pending alert
    hideIndicator();
    alertedField = null;
    clearTimeout(idleTimer);

    // Deletion: words removed → reset alert status so next idle can re-trigger
    if (prevLen !== undefined && text.length < prevLen) {
      lastAlertTime = 0; // clear cooldown so a fresh pause can re-alert
    }

    idleTimer = setTimeout(() => checkAndAlert(target), IDLE_MS);
  }

  function checkAndAlert(target) {
    if (!target || typeof target.getBoundingClientRect !== "function" || !isEditable(target)) return;
    const now = Date.now();
    if (now - lastAlertTime < COOLDOWN_MS) return;

    const text = getEditableText(target);
    const result = analyzeText(text);

    if (result) {
      showIndicatorNearCaret(target, result);
      playChime();
      alertedField = target;
      lastAlertTime = now;
    }
  }

  // ── Settings Sync ─────────────────────────────────────────────
  function loadSettings() {
    chrome.storage.local.get(["kf_realtimeEnabled"], (data) => {
      isEnabled = data.kf_realtimeEnabled !== false; // default true
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.kf_realtimeEnabled) {
      isEnabled = changes.kf_realtimeEnabled.newValue;
    }
  });

  // ── Event Listeners ───────────────────────────────────────────
  document.addEventListener("input", onInput, true); // capture phase for iframes
  document.addEventListener("focusin", (e) => {
    clearTimeout(idleTimer);
    if (alertedField && e.target !== alertedField) {
      hideIndicator();
      alertedField = null;
    }
  }, true);

  // Cleanup on unload
  window.addEventListener("beforeunload", () => {
    clearTimeout(idleTimer);
    hideIndicator();
  });

  // Init
  loadSettings();
})();