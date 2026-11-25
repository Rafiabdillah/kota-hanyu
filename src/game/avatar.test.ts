import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  AVATAR_STYLE_PRESETS,
  sanitizeAvatarAppearance,
  sanitizeAvatarStyleId,
} from "./avatar";

test("each avatar gender has at least four distinct styles", () => {
  assert.equal(AVATAR_STYLE_PRESETS.filter((item) => item.gender === "boy").length, 4);
  assert.equal(AVATAR_STYLE_PRESETS.filter((item) => item.gender === "girl").length, 4);
});

test("avatar styles cannot cross gender categories", () => {
  assert.equal(sanitizeAvatarStyleId("girl_idol", "boy"), "boy_street");
  assert.equal(sanitizeAvatarStyleId("boy_rocker", "girl"), "girl_sakura");
  assert.equal(sanitizeAvatarStyleId("unknown", "girl"), "girl_sakura");
});

test("avatar appearance rejects unsupported colors and malformed values", () => {
  assert.deepEqual(
    sanitizeAvatarAppearance({ styleId: "girl_elegant", hairColor: "#ffffff", skinTone: "red" }, "girl"),
    { styleId: "girl_elegant", hairColor: "#172033", skinTone: "#f6cbb0" },
  );
  assert.deepEqual(sanitizeAvatarAppearance(null, "boy"), {
    styleId: "boy_street",
    hairColor: "#172033",
    skinTone: "#f6cbb0",
  });
});
