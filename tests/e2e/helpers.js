import { test as base, chromium } from "@playwright/test";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// The engine is required Node-side: inside pages it only exists in the
// content script's isolated world, never in the main world.
const KeyFixMap = require(path.resolve(here, "../../keymap.js"));

export const EXT_DIR = path.resolve(here, "../..");
export const HOST_URL = "http://127.0.0.1:8899/tests/fixtures/host/page.html";
export const IFRAME_CHILD_URL = "/tests/fixtures/host/iframe-child.html";

export const LATIN_GIBBERISH = "sghl hglwqv fdgh"; // no-vowel latin → en2ar trigger
export const ARABIC_GIBBERISH = "اثممخ صخقمي فثسف"; // "hello world test" typed on EN layout
export const BILINGUAL_MIXED = "مرحبا hello world"; // must offer the chooser

export const IDLE_SETTLE_MS = 2_300; // content.js IDLE_MS (1500) + margin

// Every tier of screen the extension UI may face: small phones, large phones,
// landscape phones, tablets (both orientations), laptops, desktops, ultrawide, 4K.
export const VIEWPORTS = [
  { w: 320, h: 480, tier: "sm-phone" },
  { w: 320, h: 568, tier: "phone" },
  { w: 360, h: 640, tier: "phone" },
  { w: 375, h: 667, tier: "phone" },
  { w: 390, h: 844, tier: "phone" },
  { w: 412, h: 915, tier: "phone" },
  { w: 414, h: 896, tier: "phone" },
  { w: 640, h: 360, tier: "phone-landscape" },
  { w: 844, h: 390, tier: "phone-landscape" },
  { w: 600, h: 962, tier: "tablet" },
  { w: 768, h: 1024, tier: "tablet" },
  { w: 800, h: 1280, tier: "tablet" },
  { w: 820, h: 1180, tier: "tablet" },
  { w: 1024, h: 768, tier: "tablet-landscape" },
  { w: 1180, h: 820, tier: "tablet-landscape" },
  { w: 1280, h: 720, tier: "laptop" },
  { w: 1366, h: 768, tier: "laptop" },
  { w: 1440, h: 900, tier: "laptop" },
  { w: 1536, h: 864, tier: "laptop" },
  { w: 1600, h: 900, tier: "desktop" },
  { w: 1920, h: 1080, tier: "desktop" },
  { w: 2560, h: 1440, tier: "desktop-qhd" },
  { w: 3440, h: 1440, tier: "ultrawide" },
  { w: 3840, h: 2160, tier: "4k" }
];

const QUICK_VIEWPORTS = [
  { w: 320, h: 568, tier: "phone" },
  { w: 390, h: 844, tier: "phone" },
  { w: 640, h: 360, tier: "phone-landscape" },
  { w: 768, h: 1024, tier: "tablet" },
  { w: 1366, h: 768, tier: "laptop" },
  { w: 1920, h: 1080, tier: "desktop" }
];

export function viewportsForTest() {
  return process.env.KEYFIX_QUICK ? QUICK_VIEWPORTS : VIEWPORTS;
}

export function viewportTitle({ w, h }) {
  return `${w}x${h}`;
}

export const test = base.extend({
  extensionContext: [
    async ({}, use) => {
      const context = await chromium.launchPersistentContext("", {
        headless: true,
        channel: process.env.KEYFIX_BROWSER_CHANNEL || "chromium",
        viewport: { width: 1280, height: 800 },
        args: [
          `--disable-extensions-except=${EXT_DIR}`,
          `--load-extension=${EXT_DIR}`
        ]
      });
      await use(context);
      await context.close();
    },
    { scope: "worker" }
  ],

  serviceWorker: [
    async ({ extensionContext }, use) => {
      let [sw] = extensionContext.serviceWorkers();
      if (!sw) sw = await extensionContext.waitForEvent("serviceworker", { timeout: 20_000 });
      await use(sw);
    },
    { scope: "worker" }
  ],

  extensionId: [
    async ({ serviceWorker }, use) => {
      await use(new URL(serviceWorker.url()).host);
    },
    { scope: "worker" }
  ]
});

export async function getServiceWorker(context) {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 20_000 });
  return sw;
}

// The extension profile is persistent and shared by every test in a worker;
// clear its storage so tests never inherit each other's state.
export async function resetExtensionStorage(context) {
  const sw = await getServiceWorker(context);
  await sw.evaluate(() => new Promise((resolve) => chrome.storage.local.clear(resolve)));
}

export async function openPopup({ extensionContext, extensionId }, viewport) {
  await resetExtensionStorage(extensionContext);
  const page = await extensionContext.newPage();
  if (viewport) await page.setViewportSize({ width: viewport.w, height: viewport.h });
  await blockExternalFonts(page);
  const errors = collectPageErrors(page);
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  return { page, errors };
}

export async function openHostPage({ extensionContext }, viewport) {
  await resetExtensionStorage(extensionContext);
  const page = await extensionContext.newPage();
  if (viewport) await page.setViewportSize({ width: viewport.w, height: viewport.h });
  await blockExternalFonts(page);
  const errors = collectPageErrors(page);
  await page.goto(HOST_URL);
  return { page, errors };
}

async function blockExternalFonts(page) {
  await page.route("**fonts.googleapis.com/**", (route) => route.abort());
  await page.route("**fonts.gstatic.com/**", (route) => route.abort());
}

function collectPageErrors(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

export function expectNoPageErrors(errors) {
  if (errors.length) throw new Error("Uncaught page errors:\n" + errors.join("\n"));
}

// Types text into a field, waits past the idle timer, returns once KeyFix's
// single-action indicator shows up.
export async function typeAndWaitForIndicator(page, selector, text) {
  await page.locator(selector).fill(text);
  const indicator = page.locator("#keyfix-indicator[role='button']");
  await indicator.waitFor({ state: "visible", timeout: 7_000 });
  // opacity/transform transition ends ~200ms after insertion
  await page.waitForTimeout(250);
  return indicator;
}

export async function typeAndWaitForChooser(page, selector, text) {
  await page.locator(selector).fill(text);
  const chooser = page.locator("#keyfix-indicator[role='group']");
  await chooser.waitFor({ state: "visible", timeout: 7_000 });
  await page.waitForTimeout(250);
  return chooser;
}

// Expected conversion, computed by the real engine in Node so expectations
// never drift from keymap.js and never depend on page context.
export function convertExpected(text, direction = "en2ar") {
  return KeyFixMap.convert(text, direction);
}

export function assertBoxInsideViewport(box, viewportWidth, viewportHeight, label = "element") {
  const tolerance = 2;
  if (!box) throw new Error(`${label}: no bounding box`);
  const problems = [];
  if (box.x < -tolerance) problems.push(`x=${box.x} < 0`);
  if (box.y < -tolerance) problems.push(`y=${box.y} < 0`);
  if (box.x + box.width > viewportWidth + tolerance)
    problems.push(`right=${box.x + box.width} > viewport ${viewportWidth}`);
  if (box.y + box.height > viewportHeight + tolerance)
    problems.push(`bottom=${box.y + box.height} > viewport ${viewportHeight}`);
  if (problems.length) {
    throw new Error(`${label} outside viewport (${viewportWidth}x${viewportHeight}): ${problems.join("; ")}`);
  }
}
