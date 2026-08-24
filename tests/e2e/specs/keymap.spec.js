import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const KeyFixMap = require(path.resolve(here, "../../../keymap.js"));
const { convert, detectDirection } = KeyFixMap;

// Shifted keys whose output is plain ASCII now intentionally pass through in
// reverse (protecting real punctuation in mixed text), so these lose their
// exact reverse mapping. Forward conversion still works for every one of them.
const KNOWN_LOSSY_REVERSE = ["(", ")", "{", "}", "<", ">", "D", "F", "L", "Z", "C", "V", "M"];

const UNSHIFTED_KEYS = "`1234567890-=qwertyuiop[]\\asdfghjkl;'zxcvbnm,./ ";
const SHIFTED_KEYS = "~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:\"ZXCVBNM<>?";

test.describe("KeyFixMap.convert — basic", () => {
  test("en2ar words", () => {
    expect(convert("hello", "en2ar")).toBe("اثممخ");
    expect(convert("hello world", "en2ar")).toBe("اثممخ صخقمي");
    expect(convert("hlb hys", "en2ar")).toBe("املا اغس");
  });

  test("ar2en words", () => {
    expect(convert("اثممخ", "ar2en")).toBe("hello");
    expect(convert("اثممخ صخقمي", "ar2en")).toBe("hello world");
  });

  test("empty strings", () => {
    expect(convert("", "en2ar")).toBe("");
    expect(convert("", "ar2en")).toBe("");
  });

  test("digits are identity both ways", () => {
    expect(convert("1234567890", "en2ar")).toBe("1234567890");
    expect(convert("1234567890", "ar2en")).toBe("1234567890");
  });

  test("unmapped unicode passes through", () => {
    expect(convert("héllo 🌍 你好", "en2ar")).toBe("اéممخ 🌍 你好");
    expect(convert("🌍", "ar2en")).toBe("🌍");
  });

  test("whitespace preserved", () => {
    expect(convert("a b\tc\nd", "en2ar")).toBe(
      convert("a", "en2ar") + " " + convert("b", "en2ar") + "\t" + convert("c", "en2ar") + "\n" + convert("d", "en2ar")
    );
  });
});

test.describe("KeyFixMap.convert — shifted & ligatures", () => {
  test("shifted letters map to harakat and hamza forms", () => {
    expect(convert("H", "en2ar")).toBe("أ");
    expect(convert("T", "en2ar")).toBe("لإ");
    expect(convert("G", "en2ar")).toBe("لأ");
    expect(convert("B", "en2ar")).toBe("لآ");
    expect(convert("Q", "en2ar")).toBe("َ");
    expect(convert("W", "en2ar")).toBe("ً");
  });

  test("multi-char ligatures reverse as a unit", () => {
    expect(convert("لا", "ar2en")).toBe("b");
    expect(convert("لإ", "ar2en")).toBe("T");
    expect(convert("لأ", "ar2en")).toBe("G");
    expect(convert("لآ", "ar2en")).toBe("B");
  });

  test("ligature inside longer word", () => {
    // "بلا" typed back: b=لا so "blb" → لا+م+لا
    expect(convert("blb", "en2ar")).toBe("لاملا");
    expect(convert("لاملا", "ar2en")).toBe("blb");
  });

  test("adjacent ligature sequences do not merge wrongly", () => {
    expect(convert("bb", "en2ar")).toBe("لالا");
    expect(convert("لالا", "ar2en")).toBe("bb");
  });

  test("shifted punctuation (Arabic 101)", () => {
    expect(convert("?", "en2ar")).toBe("؟"); // Arabic question mark
    expect(convert("P", "en2ar")).toBe("؛"); // Arabic semicolon
    expect(convert("K", "en2ar")).toBe("،"); // Arabic comma
    expect(convert("N", "en2ar")).toBe("آ");
    expect(convert("Y", "en2ar")).toBe("إ");
    expect(convert("I", "en2ar")).toBe("÷");
    expect(convert("O", "en2ar")).toBe("×");
  });
});

test.describe("KeyFixMap.convert — full-keyboard round-trips", () => {
  test("every unshifted key individually", () => {
    for (const ch of UNSHIFTED_KEYS) {
      expect(convert(convert(ch, "en2ar"), "ar2en"), `round-trip of "${ch}"`).toBe(ch);
    }
  });

  // "gh" produces لا exactly like "b", so reverse must pick one — the engine
  // prefers the ligature. Inherent to Arabic-101, documented here on purpose.
  test("known ambiguity: gh → لا reverses to the ligature b", () => {
    expect(convert("gh", "en2ar")).toBe("لا");
    expect(convert(convert("gh", "en2ar"), "ar2en")).toBe("b");
  });

  test("shifted keys round-trip except documented lossy set", () => {
    for (const ch of SHIFTED_KEYS) {
      if (KNOWN_LOSSY_REVERSE.includes(ch)) continue;
      expect(convert(convert(ch, "en2ar"), "ar2en"), `round-trip of "${ch}"`).toBe(ch);
    }
  });

  test("lossy set still converts forward deterministically", () => {
    const expected = {
      "(": ")", ")": "(", "{": "<", "}": ">", "<": ",", ">": ".",
      D: "]", F: "[", L: "/", Z: "~", C: "}", V: "{", M: "'"
    };
    for (const [k, v] of Object.entries(expected)) {
      expect(convert(k, "en2ar"), `forward of "${k}"`).toBe(v);
    }
  });

  test("long ASCII text survives round-trip", () => {
    const sample = `The quick brown fox jumps over 123 lazy dogs!,./?'"@#%^&;[]-=_+ \t ~`;
    const rt = convert(convert(sample, "en2ar"), "ar2en");
    expect(rt).toBe(sample);
  });
});

test.describe("KeyFixMap.convert — ASCII passthrough in ar2en (regression)", () => {
  // Before the SHIFTED_REV guard, ar2en turned real punctuation in mixed
  // text into Latin letters: ',' → '<', '.' → '>', "'" → 'M', '/' → 'L',
  // ']' → 'D', '[' → 'F', '{' → 'V', '}' → 'C', '~' → 'Z'.
  test("printable ASCII passes through ar2en untouched", () => {
    const printable = "!\"#$%&()*+,-./0123456789:;<=>?@[]^_`{|}~";
    expect(convert(printable, "ar2en")).toBe(printable);
  });

  test("mixed sentence keeps its commas and periods", () => {
    const mixed = "مرحبا, كيف حالك. ok!";
    expect(convert(mixed, "ar2en")).toContain(",");
    expect(convert(mixed, "ar2en")).toContain(".");
    expect(convert(mixed, "ar2en")).not.toMatch(/[<>{}/]/);
  });

  test("hamza-form capitals round-trip", () => {
    expect(convert(convert("HTGB", "en2ar"), "ar2en")).toBe("HTGB");
  });
});

test.describe("KeyFixMap.detectDirection", () => {
  test("latin → en2ar", () => {
    expect(detectDirection("hello world test")).toBe("en2ar");
  });

  test("arabic → ar2en", () => {
    expect(detectDirection("مرحبا كيف حالك")).toBe("ar2en");
  });

  test("symbols/numbers only → null", () => {
    expect(detectDirection("123 !!! ???")).toBeNull();
    expect(detectDirection("")).toBeNull();
    expect(detectDirection("   ")).toBeNull();
  });

  test("mixed leans to script majority", () => {
    expect(detectDirection("مرحبا hello")).toBe("ar2en");
    expect(detectDirection("hellos مرحبا")).toBe("en2ar"); // 6 latin vs 5 arabic
  });

  test("equal counts prefer ar2en (>= rule)", () => {
    expect(detectDirection("hi لا")).toBe("ar2en");
  });

  test("diacritics count as arabic", () => {
    expect(detectDirection("ًٌَُّ")).toBe("ar2en");
  });
});

test.describe("manifest.json sanity", () => {
  const root = path.resolve(here, "../../..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

  test("is MV3 with expected permissions", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(["contextMenus", "storage", "activeTab", "scripting"])
    );
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.permissions).not.toContain("<all_urls>");
  });

  test("host permissions come from content scripts matching all urls", () => {
    expect(manifest.content_scripts[0].matches).toEqual(["<all_urls>"]);
    expect(manifest.content_scripts[0].all_frames).toBe(true);
  });

  test("referenced assets exist on disk", () => {
    const refs = [
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
      manifest.action.default_popup,
      manifest.background.service_worker,
      ...manifest.content_scripts[0].js
    ];
    for (const ref of refs) {
      expect(fs.existsSync(path.join(root, ref)), `${ref} exists`).toBe(true);
    }
  });

  test("popup page references its scripts", () => {
    const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
    expect(html).toContain('src="keymap.js"');
    expect(html).toContain('src="popup.js"');
  });

  test("keyboard commands declared", () => {
    expect(Object.keys(manifest.commands)).toEqual(
      expect.arrayContaining(["_execute_action", "fix-selection"])
    );
  });
});
