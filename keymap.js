// Shared EN <-> AR (Windows "Arabic 101") keyboard layout mapping engine.
// Loaded as a classic script by popup.html and content.js (no ES module
// export, so it works identically in a content-script context).

const KeyFixMap = (function () {
  "use strict";

  const UNSHIFTED = {
    "`": "ذ", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9", "0": "0", "-": "-", "=": "=",
    "q": "ض", "w": "ص", "e": "ث", "r": "ق", "t": "ف", "y": "غ", "u": "ع", "i": "ه", "o": "خ", "p": "ح", "[": "ج", "]": "د", "\\": "\\",
    "a": "ش", "s": "س", "d": "ي", "f": "ب", "g": "ل", "h": "ا", "j": "ت", "k": "ن", "l": "م", ";": "ك", "'": "ط",
    "z": "ئ", "x": "ء", "c": "ؤ", "v": "ر", "b": "لا", "n": "ى", "m": "ة", ",": "و", ".": "ز", "/": "ظ", " ": " "
  };

  const SHIFTED = {
    "~": "ّ", "!": "!", "@": "@", "#": "#", "$": "$", "%": "%", "^": "^", "&": "&", "*": "*", "(": ")", ")": "(", "_": "_", "+": "+",
    "Q": "َ", "W": "ً", "E": "ُ", "R": "ٌ", "T": "لإ", "Y": "إ", "U": "‘", "I": "÷", "O": "×", "P": "؛", "{": "<", "}": ">", "|": "|",
    "A": "ِ", "S": "ٍ", "D": "]", "F": "[", "G": "لأ", "H": "أ", "J": "ـ", "K": "،", "L": "/", ":": ":", "\"": "\"",
    "Z": "~", "X": "ْ", "C": "}", "V": "{", "B": "لآ", "N": "آ", "M": "'", "<": ",", ">": ".", "?": "؟"
  };

  function buildReverse(map) {
    const rev = {};
    for (const k in map) {
      if (!(map[k] in rev)) rev[map[k]] = k;
    }
    return rev;
  }

  const UNSHIFTED_REV = buildReverse(UNSHIFTED);
  // Shifted keys whose output is plain ASCII (e.g. '<'→',', 'M'→"'") must not
  // claim those codes in the reverse map, or ar2en mangles real ASCII
  // punctuation in mixed text. Those characters pass through unchanged.
  const SHIFTED_REV = {};
  for (const k in SHIFTED) {
    const v = SHIFTED[k];
    if (/[\x20-\x7E]/.test(v)) continue;
    if (!(v in SHIFTED_REV)) SHIFTED_REV[v] = k;
  }

  // Multi-char AR sequences ("لا", "لإ", "لأ", "لآ") need lookahead so a
  // reverse conversion consumes both characters, not one at a time.
  const REV_MULTI_KEYS = Object.keys(UNSHIFTED_REV).concat(Object.keys(SHIFTED_REV))
    .filter((k) => k.length > 1)
    .sort((a, b) => b.length - a.length);

  function convert(text, direction) {
    let out = "";
    if (direction === "en2ar") {
      for (const ch of text) {
        out += UNSHIFTED[ch] || SHIFTED[ch] || ch;
      }
      return out;
    }
    // ar2en: check multi-char sequences first
    let i = 0;
    const chars = Array.from(text);
    while (i < chars.length) {
      let matched = false;
      for (const seq of REV_MULTI_KEYS) {
        const seqChars = Array.from(seq);
        if (chars.slice(i, i + seqChars.length).join("") === seq) {
          out += UNSHIFTED_REV[seq] || SHIFTED_REV[seq];
          i += seqChars.length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        const ch = chars[i];
        out += UNSHIFTED_REV[ch] || SHIFTED_REV[ch] || ch;
        i += 1;
      }
    }
    return out;
  }

  // Heuristic auto-detect: does this text look like EN-layout gibberish
  // (i.e. it's plain Latin characters, likely meant to be Arabic), or does
  // it look like AR-layout gibberish (Arabic characters, meant to be English)?
  function detectDirection(text) {
    let arabicCount = 0;
    let latinCount = 0;
    for (const ch of text) {
      if (/[\u0600-\u06FF]/.test(ch)) arabicCount++;
      else if (/[a-zA-Z]/.test(ch)) latinCount++;
    }
    if (arabicCount === 0 && latinCount === 0) return null; // can't tell
    return arabicCount >= latinCount ? "ar2en" : "en2ar";
  }

  return { convert, detectDirection };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = KeyFixMap;
}
