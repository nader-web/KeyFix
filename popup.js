(function () {
  "use strict";

  const inputText = document.getElementById("inputText");
  const outputText = document.getElementById("outputText");
  const swapBtn = document.getElementById("swapBtn");
  const copyBtn = document.getElementById("copyBtn");
  const clearBtn = document.getElementById("clearBtn");
  const labelLeft = document.getElementById("labelLeft");
  const labelRight = document.getElementById("labelRight");
  const inputLabel = document.getElementById("inputLabel");
  const outputLabel = document.getElementById("outputLabel");
  const themeToggle = document.getElementById("themeToggle");
  const autoBadge = document.getElementById("autoBadge");
  const toast = document.getElementById("toast");
  const shortcutHints = document.getElementById("shortcutHints");

  let direction = "en2ar";
  let autoMode = true;
  let isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;

  function applyDirectionUI() {
    const isEn2Ar = direction === "en2ar";
    labelLeft.classList.toggle("active", isEn2Ar);
    labelRight.classList.toggle("active", !isEn2Ar);
    inputLabel.textContent = isEn2Ar ? "Input (English layout)" : "Input (Arabic layout)";
    outputLabel.textContent = isEn2Ar ? "Output (Arabic layout)" : "Output (English layout)";
    inputText.classList.toggle("rtl", !isEn2Ar);
    outputText.classList.toggle("rtl", isEn2Ar);
  }

  function updateShortcutHints() {
    if (!shortcutHints) return;
    const modKey = isMac ? "Cmd" : "Ctrl";
    const hints = shortcutHints.querySelectorAll(".shortcut-hint");
    // First hint: Open (Ctrl/Cmd+Shift+K)
    const openKbds = hints[0]?.querySelectorAll("kbd");
    if (openKbds.length >= 3) {
      openKbds[0].textContent = modKey;
      openKbds[1].textContent = "Shift";
      openKbds[2].textContent = "K";
    }
    // Second hint: Fix (Ctrl/Cmd+Shift+L)
    const fixKbds = hints[1]?.querySelectorAll("kbd");
    if (fixKbds.length >= 3) {
      fixKbds[0].textContent = modKey;
      fixKbds[1].textContent = "Shift";
      fixKbds[2].textContent = "L";
    }
  }

  function checkShortcutHintsVisibility() {
    if (!shortcutHints) return;
    chrome.storage.local.get(["kf_shortcutHintsSeen", "kf_shortcutHintsInteractions"], (data) => {
      const seenCount = data.kf_shortcutHintsSeen || 0;
      const interactions = data.kf_shortcutHintsInteractions || 0;
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // Hide after 2 opens OR 1 interaction OR reduced motion preference
      if (seenCount >= 2 || interactions >= 1 || prefersReducedMotion) {
        shortcutHints.style.display = "none";
        return;
      }

      // Increment seen count
      chrome.storage.local.set({ kf_shortcutHintsSeen: seenCount + 1 });
    });
  }

  function recordShortcutInteraction() {
    chrome.storage.local.get(["kf_shortcutHintsInteractions"], (data) => {
      const interactions = (data.kf_shortcutHintsInteractions || 0) + 1;
      chrome.storage.local.set({ kf_shortcutHintsInteractions: interactions });
      if (interactions >= 1 && shortcutHints) {
        shortcutHints.classList.add("hiding");
        setTimeout(() => { shortcutHints.style.display = "none"; }, 300);
      }
    });
  }

  function runConversion({ persist = true } = {}) {
    if (autoMode) {
      const detected = KeyFixMap.detectDirection(inputText.value);
      if (detected) direction = detected;
      applyDirectionUI();
    }
    outputText.value = KeyFixMap.convert(inputText.value, direction);
    if (persist) {
      chrome.storage.local.set({ kf_lastInput: inputText.value, kf_direction: direction });
    }
  }

  function setAutoMode(on) {
    autoMode = on;
    autoBadge.classList.toggle("on", on);
    autoBadge.textContent = on ? "AUTO" : "MANUAL";
    chrome.storage.local.set({ kf_autoMode: on });
  }

  // Manual direction selection disables auto mode so the user's explicit
  // choice sticks, matching how a "wrong" auto-guess should be correctable.
  function manualSetDirection(dir) {
    setAutoMode(false);
    direction = dir;
    applyDirectionUI();
    runConversion();
    recordShortcutInteraction();
  }

  labelLeft.addEventListener("click", () => manualSetDirection("en2ar"));
  labelRight.addEventListener("click", () => manualSetDirection("ar2en"));

  swapBtn.addEventListener("click", () => {
    setAutoMode(false);
    direction = direction === "en2ar" ? "ar2en" : "en2ar";
    const currentOut = outputText.value;
    inputText.value = currentOut;
    applyDirectionUI();
    runConversion();
    recordShortcutInteraction();
  });

  inputText.addEventListener("input", () => runConversion());

  clearBtn.addEventListener("click", () => {
    inputText.value = "";
    outputText.value = "";
    inputText.focus();
    chrome.storage.local.set({ kf_lastInput: "" });
    recordShortcutInteraction();
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1400);
  }

  copyBtn.addEventListener("click", async () => {
    if (!outputText.value) return;
    try {
      await navigator.clipboard.writeText(outputText.value);
      showToast("Copied ✓");
    } catch (err) {
      outputText.select();
      document.execCommand("copy");
      showToast("Copied ✓");
    }
    recordShortcutInteraction();
  });

  themeToggle.addEventListener("click", () => {
    const body = document.body;
    const isDark = body.getAttribute("data-theme") === "dark";
    if (isDark) {
      body.removeAttribute("data-theme");
    } else {
      body.setAttribute("data-theme", "dark");
    }
    chrome.storage.local.set({ kf_theme: isDark ? "light" : "dark" });
    recordShortcutInteraction();
  });

  const realtimeToggle = document.getElementById("realtimeToggle");
  realtimeToggle?.addEventListener("change", () => {
    chrome.storage.local.set({ kf_realtimeEnabled: realtimeToggle.checked });
  });

  // Restore persisted state on open.
  chrome.storage.local.get(
    ["kf_theme", "kf_lastInput", "kf_direction", "kf_autoMode", "kf_pendingSelection", "kf_realtimeEnabled"],
    (data) => {
      if (data.kf_theme === "dark") document.body.setAttribute("data-theme", "dark");

      autoMode = data.kf_autoMode !== undefined ? data.kf_autoMode : true;
      autoBadge.classList.toggle("on", autoMode);
      autoBadge.textContent = autoMode ? "AUTO" : "MANUAL";

      direction = data.kf_direction || "en2ar";

      // If a right-click "Fix in KeyFix" action stashed a selection, load
      // that instead of the last popup session — it's the more relevant intent.
      if (data.kf_pendingSelection) {
        inputText.value = data.kf_pendingSelection;
        chrome.storage.local.remove("kf_pendingSelection");
      } else if (data.kf_lastInput) {
        inputText.value = data.kf_lastInput;
      }

      applyDirectionUI();
      updateShortcutHints();
      checkShortcutHintsVisibility();
      setupShortcutHintsKeyboardDismiss();
      if (realtimeToggle) realtimeToggle.checked = data.kf_realtimeEnabled !== false;
      if (inputText.value) runConversion({ persist: false });
      inputText.focus();
      inputText.setSelectionRange(inputText.value.length, inputText.value.length);
    }
  );

  function setupShortcutHintsKeyboardDismiss() {
    if (!shortcutHints) return;
    shortcutHints.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        recordShortcutInteraction();
      }
    });
  }
})();
