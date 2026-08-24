import { expect } from "@playwright/test";
import {
  openPopup,
  openHostPage,
  test as extensionTest,
  viewportsForTest,
  viewportTitle,
  typeAndWaitForIndicator,
  typeAndWaitForChooser,
  assertBoxInsideViewport,
  expectNoPageErrors,
  convertExpected,
  ARABIC_GIBBERISH,
  BILINGUAL_MIXED,
  LATIN_GIBBERISH
} from "../helpers.js";

const TAP_TARGET_IDS = ["themeToggle", "swapBtn", "labelLeft", "labelRight", "clearBtn", "copyBtn", "realtimeToggle"];

extensionTest.describe("responsive — every screen size", () => {
  for (const vp of viewportsForTest()) {
    extensionTest(`[${viewportTitle(vp)} ${vp.tier}] popup renders and stays usable`, async ({ extensionContext, extensionId }) => {
      const { page, errors } = await openPopup({ extensionContext, extensionId }, vp);

      await expect(page.locator(".brand")).toContainText("Fix");
      await expect(page.locator("#inputText")).toBeVisible();
      await expect(page.locator("#outputText")).toBeVisible();

      // No horizontal overflow once the viewport can fit the fixed 380px body.
      if (vp.w >= 400) {
        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth
        }));
        expect(metrics.scrollWidth, "document horizontal overflow").toBeLessThanOrEqual(metrics.clientWidth);
        expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(382);
      }

      // Interactive controls keep usable hit areas at every size.
      for (const id of TAP_TARGET_IDS) {
        const box = await page.locator(`#${id}`).boundingBox();
        expect(box, `${id} has a box`).toBeTruthy();
        const minSide = Math.min(box.width, box.height);
        if (id === "realtimeToggle") {
          expect(minSide, `${id} hit area`).toBeGreaterThanOrEqual(24);
        } else {
          expect(minSide, `${id} hit area`).toBeGreaterThanOrEqual(20);
        }
      }

      // Conversion works at this size end-to-end.
      await page.locator("#inputText").fill(LATIN_GIBBERISH);
      const expectedOut = convertExpected(LATIN_GIBBERISH, "en2ar");
      await expect(page.locator("#outputText")).toHaveValue(expectedOut);

      // Copy toast appears inside the viewport.
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.locator("#copyBtn").click();
      const toast = page.locator("#toast");
      await expect(toast).toHaveClass(/show/);
      assertBoxInsideViewport(await toast.boundingBox(), vp.w, vp.h, `toast @${vp.w}x${vp.h}`);

      expectNoPageErrors(errors);
      await page.close();
    });

    extensionTest(`[${viewportTitle(vp)} ${vp.tier}] indicator positions and clamps correctly`, async ({ extensionContext }) => {
      const { page } = await openHostPage({ extensionContext }, vp);

      // Centered field: dot must appear fully inside the viewport.
      const dot = await typeAndWaitForIndicator(page, "#mainInput", LATIN_GIBBERISH);
      assertBoxInsideViewport(
        await dot.boundingBox(),
        vp.w,
        vp.h,
        `indicator @${vp.w}x${vp.h}`
      );

      // The 8s alert cooldown is per-frame, not per-field. A deletion (shorter
      // value than before) resets it, letting the next field alert immediately.
      async function armedFill(selector, text) {
        const longPad = text + " ".repeat(24);
        await page.locator(selector).fill(longPad);
        await page.evaluate(() => document.querySelectorAll("#keyfix-indicator").forEach((el) => el.remove()));
        await page.locator(selector).fill(text);
      }

      // Field pinned to the top-right: latin text puts the dot to the right of
      // the field, which must clamp back inside instead of overflowing.
      await armedFill("#cornerLTR", LATIN_GIBBERISH);
      const cornerDot = page.locator("#keyfix-indicator[role='button']");
      await cornerDot.waitFor({ state: "visible", timeout: 7_000 });
      await page.waitForTimeout(250);
      const cornerBox = await cornerDot.boundingBox();
      assertBoxInsideViewport(cornerBox, vp.w, vp.h, `clamped-right indicator @${vp.w}x${vp.h}`);
      expect(cornerBox.x + cornerBox.width).toBeLessThanOrEqual(vp.w + 2);

      // Field pinned bottom-left with arabic text: dot goes to the left side
      // of the field and must clamp to the left viewport edge.
      await armedFill("#bottomRTL", ARABIC_GIBBERISH);
      const rtlDot = page.locator("#keyfix-indicator[role='button']");
      await rtlDot.waitFor({ state: "visible", timeout: 7_000 });
      await page.waitForTimeout(250);
      const rtlBox = await rtlDot.boundingBox();
      assertBoxInsideViewport(rtlBox, vp.w, vp.h, `clamped-left indicator @${vp.w}x${vp.h}`);
      expect(rtlBox.x).toBeGreaterThanOrEqual(6);

      // Click-through works at this size.
      await rtlDot.click();
      const expectedAr = convertExpected(ARABIC_GIBBERISH, "ar2en");
      await expect(page.locator("#bottomRTL")).toHaveValue(expectedAr);
      await page.close();
    });

    extensionTest(`[${viewportTitle(vp)} ${vp.tier}] bilingual chooser fits and works`, async ({ extensionContext }) => {
      const { page, errors } = await openHostPage({ extensionContext }, vp);
      const chooser = await typeAndWaitForChooser(page, "#mainInput", BILINGUAL_MIXED);
      assertBoxInsideViewport(
        await chooser.boundingBox(),
        vp.w,
        vp.h,
        `chooser @${vp.w}x${vp.h}`
      );
      const btnEn = chooser.getByRole("button", { name: "Fix to English" });
      await btnEn.click();
      const expected = convertExpected(BILINGUAL_MIXED, "ar2en");
      await expect(page.locator("#mainInput")).toHaveValue(expected);
      expectNoPageErrors(errors);
      await page.close();
    });
  }
});

