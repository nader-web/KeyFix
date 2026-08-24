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

    // Check both directions
    const en2ar = KeyFixMap.convert(text, "en2ar");
    const ar2en = KeyFixMap.convert(text, "ar2en");

    // Confidence: how many chars actually changed?
    function changedRatio(original, converted) {
      let changed = 0;
      let total = 0;
      for (let i = 0; i < original.length; i++) {
        const o = original[i];
        if (/[\s\n\r]/.test(o)) continue; // ignore whitespace
        total++;
        if (o !== converted[i]) changed++;
      }
      return total > 0 ? changed / total : 0;
    }

    const en2arRatio = changedRatio(text, en2ar);
    const ar2enRatio = changedRatio(text, ar2en);

    // Heuristic: which direction looks like "wrong layout"?
    // Arabic text typed on EN keyboard → en2ar converts to readable Arabic
    // English text typed on AR keyboard → ar2en converts to readable English
    const direction = en2arRatio > ar2enRatio ? "en2ar" : "ar2en";
    const confidence = Math.max(en2arRatio, ar2enRatio);

    if (confidence >= CONFIDENCE_THRESHOLD) {
      return { direction, confidence, converted: direction === "en2ar" ? en2ar : ar2en };
    }
    return null;
  }

  // ── UI: Subtle indicator dot near caret ───────────────────────
  let indicator = null;

  function showIndicatorNearCaret(target) {
    if (indicator) indicator.remove();

    indicator = document.createElement("div");
    indicator.id = "keyfix-indicator";
    indicator.style.cssText = `
      position: absolute;
      width: 8px; height: 8px;
      background: #d46b45;
      border-radius: 50%;
      box-shadow: 0 0 0 2px rgba(212,107,69,0.3);
      pointer-events: none;
      z-index: 2147483647;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    // Position at caret (approximation for inputs)
    const rect = target.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    // For inputs, place at end of text (rough approximation)
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      indicator.style.left = `${rect.right + scrollX - 16}px`;
      indicator.style.top = `${rect.top + scrollY + 4}px`;
    } else {
      // contenteditable — try to use selection
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0).getBoundingClientRect();
        indicator.style.left = `${range.right + scrollX - 4}px`;
        indicator.style.top = `${range.bottom + scrollY + 2}px`;
      } else {
        indicator.style.left = `${rect.right + scrollX - 16}px`;
        indicator.style.top = `${rect.top + scrollY + 4}px`;
      }
    }

    document.body.appendChild(indicator);
    requestAnimationFrame(() => { indicator.style.opacity = "1"; });

    // Click indicator → fix
    indicator.addEventListener("click", () => applyFix(target));
  }

  function hideIndicator() {
    if (indicator) {
      indicator.style.opacity = "0";
      setTimeout(() => indicator?.remove(), 200);
      indicator = null;
    }
  }

  // ── Apply Fix ─────────────────────────────────────────────────
  function applyFix(target) {
    const text = getEditableText(target);
    if (!text) return;

    const result = analyzeText(text);
    if (!result) return;

    replaceEditableText(target, result.converted);
    hideIndicator();
    playChime();
    lastAlertTime = Date.now();
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
      // Simple replace for contenteditable
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(newText));
        sel.collapseToEnd();
      } else {
        el.textContent = newText;
      }
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
  function onInput() {
    if (!isEnabled) return;

    const target = getActiveEditable();
    if (!target) return;

    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => checkAndAlert(target), IDLE_MS);
  }

  function checkAndAlert(target) {
    const now = Date.now();
    if (now - lastAlertTime < COOLDOWN_MS) return;

    const text = getEditableText(target);
    const result = analyzeText(text);

    if (result) {
      showIndicatorNearCaret(target);
      playChime();
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
  document.addEventListener("focusin", () => {
    clearTimeout(idleTimer);
  }, true);

  // Cleanup on unload
  window.addEventListener("beforeunload", () => {
    clearTimeout(idleTimer);
    hideIndicator();
  });

  // Init
  loadSettings();
})();