import { expect, test } from "@playwright/test";
import {
  openHostPage,
  test as extensionTest,
  typeAndWaitForIndicator,
  typeAndWaitForChooser,
  convertExpected,
  expectNoPageErrors,
  IDLE_SETTLE_MS,
  ARABIC_GIBBERISH,
  BILINGUAL_MIXED,
  LATIN_GIBBERISH
} from "../helpers.js";

extensionTest.describe("content script — full-sentence detection & one-click fix", () => {
  extensionTest("latin gibberish → en2ar dot appears and fixes the field", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const indicator = await typeAndWaitForIndicator(page, "#mainInput", LATIN_GIBBERISH);
    await indicator.click();
    const expected = convertExpected(LATIN_GIBBERISH, "en2ar");
    await expect(page.locator("#mainInput")).toHaveValue(expected);
    // indicator disappears after fix
    await expect(page.locator("#keyfix-indicator")).toHaveCount(0);
    await page.close();
  });

  extensionTest("arabic gibberish → ar2en dot appears and fixes the field", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const indicator = await typeAndWaitForIndicator(page, "#mainInput", ARABIC_GIBBERISH);
    await indicator.click();
    await expect(page.locator("#mainInput")).toHaveValue("hello world test");
    await page.close();
  });

  extensionTest("plausible English never triggers", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    await page.locator("#mainInput").fill("hello world testing");
    await page.waitForTimeout(IDLE_SETTLE_MS + 500);
    await expect(page.locator("#keyfix-indicator")).toHaveCount(0);
    await page.close();
  });

  extensionTest("short text below word threshold never triggers", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    await page.locator("#mainInput").fill("sghl hi");
    await page.waitForTimeout(IDLE_SETTLE_MS + 500);
    await expect(page.locator("#keyfix-indicator")).toHaveCount(0);
    await page.close();
  });

  extensionTest("typing again hides a pending indicator", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const indicator = await typeAndWaitForIndicator(page, "#mainInput", LATIN_GIBBERISH);
    await page.locator("#mainInput").fill(LATIN_GIBBERISH + " more");
    await expect(indicator).toBeHidden({ timeout: 3_000 });
    await page.close();
  });

  extensionTest("deletion resets the cooldown so a new alert can fire", async ({ extensionContext }) => {
    test.setTimeout(30_000);
    const { page } = await openHostPage({ extensionContext });
    const first = await typeAndWaitForIndicator(page, "#mainInput", LATIN_GIBBERISH);
    await first.waitFor({ state: "visible" });

    // Shorter text = deletion → cooldown cleared; retype triggers again well
    // inside the normal 8s cooldown window, proving the reset happened.
    await page.locator("#mainInput").fill("sghl hglwqv");
    await page.locator("#mainInput").fill(LATIN_GIBBERISH + " x4");
    const second = page.locator("#keyfix-indicator[role='button']");
    await second.waitFor({ state: "visible", timeout: 7_000 });
    await page.close();
  });
});

extensionTest.describe("content script — bilingual chooser", () => {
  extensionTest("bilingual text offers ع / EN buttons instead of auto-fixing", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const chooser = await typeAndWaitForChooser(page, "#mainInput", BILINGUAL_MIXED);
    await expect(chooser).toHaveAttribute("role", "group");
    await expect(page.locator("#mainInput")).toHaveValue(BILINGUAL_MIXED); // untouched

    const btnAr = chooser.getByRole("button", { name: "Fix to Arabic" });
    const btnEn = chooser.getByRole("button", { name: "Fix to English" });
    await expect(btnAr).toContainText("ع");
    await expect(btnEn).toContainText("EN");

    await btnEn.click();
    const expected = convertExpected(BILINGUAL_MIXED, "ar2en");
    await expect(page.locator("#mainInput")).toHaveValue(expected);
    await page.close();
  });

  extensionTest("chooser Arabic button converts en2ar", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const chooser = await typeAndWaitForChooser(page, "#mainInput", BILINGUAL_MIXED);
    await chooser.getByRole("button", { name: "Fix to Arabic" }).click();
    const expected = convertExpected(BILINGUAL_MIXED, "en2ar");
    await expect(page.locator("#mainInput")).toHaveValue(expected);
    await page.close();
  });

  extensionTest("bilingual with arabic majority still gets a chooser (regression)", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const text = "صباح الخير على الجميع sghl";
    const chooser = await typeAndWaitForChooser(page, "#mainInput", text);
    await expect(chooser).toHaveAttribute("role", "group");
    await expect(page.locator("#mainInput")).toHaveValue(text); // not destroyed by a full fix
    await page.close();
  });

  extensionTest("chooser buttons are keyboard-operable (Enter)", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const chooser = await typeAndWaitForChooser(page, "#mainInput", BILINGUAL_MIXED);
    const btnEn = chooser.getByRole("button", { name: "Fix to English" });
    await btnEn.focus();
    await page.keyboard.press("Enter");
    const expected = convertExpected(BILINGUAL_MIXED, "ar2en");
    await expect(page.locator("#mainInput")).toHaveValue(expected);
    await page.close();
  });
});

extensionTest.describe("content script — editable surface coverage", () => {
  extensionTest("input element", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const indicator = await typeAndWaitForIndicator(page, "#cornerLTR", LATIN_GIBBERISH);
    await indicator.click();
    const expected = convertExpected(LATIN_GIBBERISH, "en2ar");
    await expect(page.locator("#cornerLTR")).toHaveValue(expected);
    await page.close();
  });

  extensionTest("contenteditable div", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const indicator = await typeAndWaitForIndicator(page, "#ce", LATIN_GIBBERISH);
    await indicator.click();
    const expected = convertExpected(LATIN_GIBBERISH, "en2ar");
    await expect(page.locator("#ce")).toHaveText(expected);
    await page.close();
  });

  extensionTest("shadow DOM input", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const shadowInput = page.locator("#shadowInput");
    await shadowInput.fill(LATIN_GIBBERISH);
    const indicator = page.locator("#keyfix-indicator[role='button']");
    await indicator.waitFor({ state: "visible", timeout: 7_000 });
    await indicator.click();
    const expected = convertExpected(LATIN_GIBBERISH, "en2ar");
    await expect(shadowInput).toHaveValue(expected);
    await page.close();
  });

  extensionTest("iframe field (all_frames injection)", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const frame = page.frameLocator("iframe");
    await frame.locator("#frameInput").fill(LATIN_GIBBERISH);
    const indicator = frame.locator("#keyfix-indicator[role='button']");
    await indicator.waitFor({ state: "visible", timeout: 7_000 });
    await indicator.click();
    const expected = convertExpected(LATIN_GIBBERISH, "en2ar");
    await expect(frame.locator("#frameInput")).toHaveValue(expected);
    await page.close();
  });

  extensionTest("indicator sits above high z-index overlays and is clickable", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    const indicator = await typeAndWaitForIndicator(page, "#mainInput", LATIN_GIBBERISH);
    const zIndex = await indicator.evaluate((el) => getComputedStyle(el).zIndex);
    expect(Number(zIndex)).toBe(2147483647);

    const box = await indicator.boundingBox();
    const topElement = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.id || document.elementFromPoint(x, y)?.tagName,
      [box.x + box.width / 2, box.y + box.height / 2]
    );
    expect(topElement).toBe("keyfix-indicator");

    await indicator.click();
    const expected = convertExpected(LATIN_GIBBERISH, "en2ar");
    await expect(page.locator("#mainInput")).toHaveValue(expected);
    await page.close();
  });

  extensionTest("fixed input fires an input event frameworks can observe", async ({ extensionContext }) => {
    const { page } = await openHostPage({ extensionContext });
    await page.evaluate(() => {
      window.__keyfixInputEvents = 0;
      document.querySelector("#mainInput").addEventListener("input", () => window.__keyfixInputEvents++);
    });
    const indicator = await typeAndWaitForIndicator(page, "#mainInput", LATIN_GIBBERISH);
    await indicator.click();
    await expect.poll(() => page.evaluate(() => window.__keyfixInputEvents)).toBeGreaterThanOrEqual(1);
    await page.close();
  });

  extensionTest("no uncaught errors while typing on the host page", async ({ extensionContext }) => {
    const { page, errors } = await openHostPage({ extensionContext });
    await typeAndWaitForIndicator(page, "#mainInput", LATIN_GIBBERISH);
    expectNoPageErrors(errors);
    await page.close();
  });
});
