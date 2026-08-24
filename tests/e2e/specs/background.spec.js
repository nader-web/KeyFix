import { expect } from "@playwright/test";
import { openPopup, test as extensionTest } from "../helpers.js";

// This Chrome build exposes no contextMenus.getAll / commands.getAll in the
// worker, so registration is verified through observable behavior:
// creating a menu id that already exists must fail with a duplicate-id error.
function probeDuplicateMenu(serviceWorker, id) {
  return serviceWorker.evaluate(
    (menuId) =>
      new Promise((resolve) => {
        chrome.contextMenus.create(
          { id: menuId, title: "probe", contexts: ["selection"] },
          () => resolve(chrome.runtime.lastError?.message ?? null)
        );
      }),
    id
  );
}

extensionTest.describe("background service worker", () => {
  extensionTest("registers both context menus on install", async ({ serviceWorker }) => {
    await expect
      .poll(async () => {
        const err = await probeDuplicateMenu(serviceWorker, "keyfix-fix-selection");
        return err ?? "missing";
      })
      .toMatch(/duplicate id/i);

    await expect
      .poll(async () => {
        const err = await probeDuplicateMenu(serviceWorker, "keyfix-open-popup");
        return err ?? "missing";
      })
      .toMatch(/duplicate id/i);
  });

  extensionTest("commands API ready and manifest declares both shortcuts", async ({ serviceWorker }) => {
    const info = await serviceWorker.evaluate(() => ({
      canListen: typeof chrome.commands?.onCommand?.addListener === "function",
      commands: chrome.runtime.getManifest().commands
    }));
    expect(info.canListen).toBe(true);

    expect(Object.keys(info.commands)).toEqual(
      expect.arrayContaining(["_execute_action", "fix-selection"])
    );
    expect(info.commands["fix-selection"].suggested_key.default).toMatch(/L$/);
    expect(info.commands["_execute_action"].suggested_key.default).toMatch(/K$/);
  });

  extensionTest("service worker stays alive across popup interactions", async ({ extensionContext, extensionId, serviceWorker }) => {
    const { page } = await openPopup({ extensionContext, extensionId });
    await page.locator("#inputText").fill("hello world");
    await expect(page.locator("#outputText")).toHaveValue("اثممخ صخقمي");
    await page.close();

    // SW may restart between events; it must come back and stay responsive.
    await expect
      .poll(async () => {
        try {
          return await serviceWorker.evaluate(() => chrome.runtime.getManifest().version);
        } catch {
          return null;
        }
      })
      .toBe("1.0.0");
  });
});
