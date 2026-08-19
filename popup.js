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

  let direction = "en2ar";
  let autoMode = true;

  function applyDirectionUI() {
    const isEn2Ar = direction === "en2ar";
    labelLeft.classList.toggle("active", isEn2Ar);
    labelRight.classList.toggle("active", !isEn2Ar);
    inputLabel.textContent = isEn2Ar ? "Input (English layout)" : "Input (Arabic layout)";
    outputLabel.textContent = isEn2Ar ? "Output (Arabic layout)" : "Output (English layout)";
    inputText.classList.toggle("rtl", !isEn2Ar);
    outputText.classList.toggle("rtl", isEn2Ar);
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
  });

  inputText.addEventListener("input", () => runConversion());

  clearBtn.addEventListener("click", () => {
    inputText.value = "";
    outputText.value = "";
    inputText.focus();
    chrome.storage.local.set({ kf_lastInput: "" });
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
  });

  // Restore persisted state on open.
  chrome.storage.local.get(
    ["kf_theme", "kf_lastInput", "kf_direction", "kf_autoMode", "kf_pendingSelection"],
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
      if (inputText.value) runConversion({ persist: false });
      inputText.focus();
      inputText.setSelectionRange(inputText.value.length, inputText.value.length);
    }
  );
})();
