importScripts("keymap.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "keyfix-fix-selection",
    title: 'Fix "%s" with KeyFix',
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "keyfix-open-popup",
    title: "Open KeyFix",
    contexts: ["page", "selection"]
  });
});

async function fixSelectionInTab(tab, selectionText) {
  const direction = KeyFixMap.detectDirection(selectionText) || "en2ar";
  const fixed = KeyFixMap.convert(selectionText, direction);

  try {
    // Try to replace the selection directly in an editable field.
    const [{ result: replaced }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (fixedText) => {
        const active = document.activeElement;
        const isEditable =
          active &&
          (active.tagName === "TEXTAREA" ||
            (active.tagName === "INPUT" && /^(text|search|email|url)$/i.test(active.type || "text")) ||
            active.isContentEditable);

        if (!isEditable) return false;

        if (active.isContentEditable) {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return false;
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(fixedText));
          sel.collapseToEnd();
          return true;
        }

        const start = active.selectionStart;
        const end = active.selectionEnd;
        if (start === null || end === null || start === end) return false;
        const before = active.value.slice(0, start);
        const after = active.value.slice(end);
        active.value = before + fixedText + after;
        const caret = start + fixedText.length;
        active.setSelectionRange(caret, caret);
        active.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      args: [fixed]
    });

    if (replaced) return;
  } catch (e) {
    // Fall through to clipboard fallback below (e.g. restricted page).
  }

  // Fallback: not an editable field (or replacement failed) — copy the
  // fixed text to the clipboard instead so the user can paste it.
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (fixedText) => navigator.clipboard.writeText(fixedText),
      args: [fixed]
    });
  } catch (e) {
    // As a last resort, stash it for the popup to show.
    chrome.storage.local.set({ kf_pendingSelection: selectionText });
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === "keyfix-fix-selection" && info.selectionText) {
    fixSelectionInTab(tab, info.selectionText);
    return;
  }

  if (info.menuItemId === "keyfix-open-popup") {
    if (info.selectionText) {
      chrome.storage.local.set({ kf_pendingSelection: info.selectionText }, () => {
        chrome.action.openPopup();
      });
    } else {
      chrome.action.openPopup();
    }
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "fix-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  try {
    const [{ result: selectionText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const active = document.activeElement;
        if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) {
          return active.value.slice(active.selectionStart, active.selectionEnd);
        }
        return window.getSelection() ? window.getSelection().toString() : "";
      }
    });
    if (selectionText) fixSelectionInTab(tab, selectionText);
  } catch (e) {
    // Restricted page (e.g. chrome:// URL) — nothing we can do here.
  }
});
