const test = require("node:test");
const assert = require("node:assert/strict");

const { loadCodeGs } = require("../test-support/load-codegs");
const { createGasMocks } = require("../test-support/gas-mocks");

const { globals } = createGasMocks();
const { exports: codeGs } = loadCodeGs(
  [
    "ROLES",
    "getCanonicalRole_",
    "validateNameInput_",
    "normaliseWhitespace_",
    "normaliseAsciiDigits_",
    "isClassTokenChar_",
    "normaliseClassSeparators_",
    "normaliseClassValue_",
    "normaliseComparable_",
    "normaliseClassComparable_",
    "normaliseCompact_",
  ],
  globals,
);

const {
  ROLES,
  getCanonicalRole_,
  validateNameInput_,
  normaliseWhitespace_,
  normaliseAsciiDigits_,
  isClassTokenChar_,
  normaliseClassSeparators_,
  normaliseClassValue_,
  normaliseComparable_,
  normaliseClassComparable_,
  normaliseCompact_,
} = codeGs;

test("normaliseWhitespace_ collapses mixed regular and full-width spaces", () => {
  assert.equal(normaliseWhitespace_("  1\u3000 \u30002  "), "1 2");
});

test("normaliseAsciiDigits_ converts full-width digits without changing ASCII digits", () => {
  assert.equal(
    normaliseAsciiDigits_("Year ２０２６ Class 3"),
    "Year 2026 Class 3",
  );
});

test("normaliseClassValue_ standardises full-width, Kanji digits, and dash variants", () => {
  assert.equal(normaliseClassValue_(" １－２ "), "1-2");
  assert.equal(normaliseClassValue_("１−２"), "1-2");
  assert.equal(normaliseClassValue_("１ー２"), "1-2");
  assert.equal(normaliseClassValue_("四ー二"), "4-2");
});

test("normaliseClassSeparators_ converts prolonged sound marks only inside class-like tokens", () => {
  assert.equal(normaliseClassSeparators_("Aー1"), "A-1");
  assert.equal(normaliseClassSeparators_("クラスーA"), "クラスーA");
});

test("isClassTokenChar_ stays narrow and does not treat Japanese text as a class token delimiter", () => {
  assert.equal(isClassTokenChar_("A"), true);
  assert.equal(isClassTokenChar_("1"), true);
  assert.equal(isClassTokenChar_("ク"), false);
});

test("normaliseComparable_ remains a whitespace and case canonicalizer", () => {
  assert.equal(normaliseComparable_("  AbC\u3000Def "), "abc def");
});

test("validateNameInput_ preserves Kanji numerals in names", () => {
  const result = validateNameInput_(" 日本三郎 ");

  assert.equal(result.ok, true);
  assert.equal(result.value, "日本三郎");
});

test("normaliseClassComparable_ treats ASCII, full-width, and Kanji digits as equal", () => {
  assert.equal(normaliseClassComparable_("１−2"), normaliseClassComparable_("1-2"));
  assert.equal(normaliseClassComparable_("１ー2"), normaliseClassComparable_("1-2"));
  assert.equal(normaliseClassComparable_("四-二"), normaliseClassComparable_("4-2"));
  assert.equal(normaliseClassComparable_("零ー一"), normaliseClassComparable_("0-1"));
});

test("normaliseClassComparable_ does not broaden equivalence to full-width Latin letters", () => {
  assert.notEqual(normaliseClassComparable_("１-ａ"), normaliseClassComparable_("1-a"));
});

test("normaliseCompact_ removes regular and full-width spaces for rate-limit keys", () => {
  assert.equal(normaliseCompact_(" A\u3000 B "), "ab");
});

test("getCanonicalRole_ only accepts canonical role labels", () => {
  assert.equal(getCanonicalRole_(ROLES.general), ROLES.general);
  assert.equal(getCanonicalRole_(ROLES.classRep), ROLES.classRep);
  assert.equal(getCanonicalRole_("general"), undefined);
});
