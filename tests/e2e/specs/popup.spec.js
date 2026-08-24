import { expect, test } from "@playwright/test";
import {
  openPopup,
  test as extensionTest,
  expectNoPageErrors,
  ARABIC_GIBBERISH,
  LATIN_GIBBERISH
} from "../helpers.js";

extensionTest.describe("popup — conversion", () => {
  extensionTest("auto mode detects EN→AR and fills output live", async ({ extensionContext, extensionId }) => {
    const { page, errors } = await openPopup({ extensionContext, extensionId });
    await page.locator("#inputText").fill("hello world");
    await expect(page.locator("#outputText")).toHaveValue("اثممخ صخقمي");
    await expect(page.locator("#inputLabel")).toHaveText("Input (English layout)");
    await expect(page.locator("#outputLabel")).toHaveText("Output (Arabic layout)");
    await expect(page.locator("#labelLeft")).toHaveClass(/active/);
    await expect(page.locator("#autoBadge")).toHaveText("AUTO");
    // input is latin (ltr), output is arabic (rtl)
    await expect(page.locator("#inputText")).not.toHaveClass(/rtl/);
    await expect(page.locator("#outputText")).toHaveClass(/rtl/);
    expectNoPageErrors(errors);
    await page.close();
  });

  extensionTest("auto mode flips to AR→EN for arabic input", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.locator("#inputText").fill(ARABIC_GIBBERISH);
    await expect(page.locator("#outputText")).toHaveValue("hello world test");
    await expect(page.locator("#labelRight")).toHaveClass(/active/);
    await expect(page.locator("#inputLabel")).toHaveText("Input (Arabic layout)");
    await expect(page.locator("#inputText")).toHaveClass(/rtl/);
    await page.close();
  });

  extensionTest("manual direction locks and disables auto", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.locator("#labelRight").click();
    await expect(page.locator("#autoBadge")).toHaveText("MANUAL");
    // Latin input no longer flips the direction back — ar2en passes it through
    await page.locator("#inputText").fill("hello");
    await expect(page.locator("#outputText")).toHaveValue("hello");
    await expect(page.locator("#labelRight")).toHaveClass(/active/);
    await page.close();
  });

  extensionTest("swap feeds output back as input and flips labels", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.locator("#inputText").fill("hello world");
    await expect(page.locator("#outputText")).toHaveValue("اثممخ صخقمي");
    await page.locator("#swapBtn").click();
    await expect(page.locator("#inputText")).toHaveValue("اثممخ صخقمي");
    await expect(page.locator("#outputText")).toHaveValue("hello world");
    await expect(page.locator("#labelRight")).toHaveClass(/active/);
    await expect(page.locator("#autoBadge")).toHaveText("MANUAL");
    await page.close();
  });

  extensionTest("clear empties both fields and refocuses input", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.locator("#inputText").fill(LATIN_GIBBERISH);
    await page.locator("#clearBtn").click();
    await expect(page.locator("#inputText")).toHaveValue("");
    await expect(page.locator("#outputText")).toHaveValue("");
    await expect(page.locator("#inputText")).toBeFocused();
    await page.close();
  });

  extensionTest("copy shows toast for non-empty output", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.locator("#inputText").fill("hello world");
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.locator("#copyBtn").click();
    await expect(page.locator("#toast")).toHaveClass(/show/);
    await expect(page.locator("#toast")).toContainText("Copied");
    await page.close();
  });

  extensionTest("copy is a no-op without output", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.locator("#copyBtn").click();
    await expect(page.locator("#toast")).not.toHaveClass(/show/);
    await page.close();
  });
});

extensionTest.describe("popup — persistence", () => {
  extensionTest("theme toggle persists across reload", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.evaluate(() => chrome.storage.local.clear());
    await page.reload();
    await page.locator("#themeToggle").click();
    await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
    const theme = await page.evaluate(() => new Promise((r) => chrome.storage.local.get(["kf_theme"], r)));
    expect(theme.kf_theme).toBe("dark");
    await page.close();
  });

  extensionTest("last input and direction persist across reload", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.evaluate(() => chrome.storage.local.clear());
    await page.reload();
    await page.locator("#inputText").fill(ARABIC_GIBBERISH);
    await expect(page.locator("#outputText")).toHaveValue("hello world test");
    await page.reload();
    await expect(page.locator("#inputText")).toHaveValue(ARABIC_GIBBERISH);
    await expect(page.locator("#outputText")).toHaveValue("hello world test");
    await expect(page.locator("#labelRight")).toHaveClass(/active/);
    await page.close();
  });

  extensionTest("pending selection from context menu wins over last input", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.evaluate(() =>
      chrome.storage.local.set({
        kf_pendingSelection: "sghl hglwqv fdgh",
        kf_lastInput: "stale previous text"
      })
    );
    await page.reload();
    await expect(page.locator("#inputText")).toHaveValue("sghl hglwqv fdgh");
    const leftover = await page.evaluate(() =>
      new Promise((r) => chrome.storage.local.get(["kf_pendingSelection"], (d) => r(d.kf_pendingSelection)))
    );
    expect(leftover).toBeUndefined();
    await page.close();
  });

  extensionTest("real-time toggle persists", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.evaluate(() => chrome.storage.local.clear());
    await page.reload();
    const toggle = page.locator("#realtimeToggle");
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    const stored = await page.evaluate(
      () => new Promise((r) => chrome.storage.local.get(["kf_realtimeEnabled"], r))
    );
    expect(stored.kf_realtimeEnabled).toBe(false);
    await page.reload();
    await expect(toggle).not.toBeChecked();
    await page.close();
  });
});

extensionTest.describe("popup — shortcut hints lifecycle", () => {
  extensionTest("hints visible on fresh profile, hidden after two opens", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.evaluate(() => chrome.storage.local.clear());
    await page.reload();
    const hints = page.locator("#shortcutHints");
    await expect(hints).toBeVisible();

    await page.evaluate(() => chrome.storage.local.set({ kf_shortcutHintsSeen: 2 }));
    await page.reload();
    await expect(hints).toBeHidden();
    await page.close();
  });

  extensionTest("interacting hides hints after the exit animation", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.evaluate(() => chrome.storage.local.clear());
    await page.reload();
    await page.locator("#clearBtn").click();
    await expect(page.locator("#shortcutHints")).toBeHidden({ timeout: 5_000 });
    await page.close();
  });

  extensionTest("Escape on hints records interaction and dismisses", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.evaluate(() => chrome.storage.local.clear());
    await page.reload();
    await page.locator("#shortcutHints").focus();
    await page.keyboard.press("Escape");
    const interactions = await page.evaluate(
      () => new Promise((r) => chrome.storage.local.get(["kf_shortcutHintsInteractions"], r))
    );
    expect(interactions.kf_shortcutHintsInteractions).toBeGreaterThanOrEqual(1);
    await expect(page.locator("#shortcutHints")).toBeHidden({ timeout: 5_000 });
    await page.close();
  });

  extensionTest("prefers-reduced-motion keeps hints hidden", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => chrome.storage.local.clear());
    await page.reload();
    await expect(page.locator("#shortcutHints")).toBeHidden();
    await page.close();
  });
});

extensionTest.describe("popup — accessibility", () => {
  extensionTest("icon controls expose accessible names", async ({ extensionContext, extensionId }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    for (const id of ["themeToggle", "swapBtn"]) {
      const label = await page.locator(`#${id}`).getAttribute("aria-label");
      expect(label, `${id} aria-label`).toBeTruthy();
    }
    await expect(page.locator("#shortcutHints")).toHaveAttribute("aria-label", "Keyboard shortcuts");
    await expect(page.locator('textarea#outputText')).toHaveAttribute("readonly", "");
    await page.close();
  });

  extensionTest("no uncaught errors on load", async ({ extensionContext, extensionId }) => {
    const { page, errors } = await openPopup({ extensionContext, extensionId });
    await expect(page.locator(".brand")).toHaveText(/KeyFix/);
    expectNoPageErrors(errors);
    await page.close();
  });
});
