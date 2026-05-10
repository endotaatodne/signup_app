const test = require("node:test");
const assert = require("node:assert/strict");

const { loadCodeGs } = require("../test-support/load-codegs");
const { createGasMocks } = require("../test-support/gas-mocks");

const { globals } = createGasMocks();
const { exports: codeGs } = loadCodeGs(
  [
    "ROLES",
    "getCanonicalRole",
    "validateNameInput",
    "normaliseWhitespace",
    "normaliseAsciiDigits",
    "isClassTokenChar",
    "normaliseClassSeparators",
    "normaliseClassValue",
    "normaliseComparable",
    "normaliseClassComparable",
    "normaliseCompact",
  ],
  globals,
);

const {
  ROLES,
  getCanonicalRole,
  validateNameInput,
  normaliseWhitespace,
  normaliseAsciiDigits,
  isClassTokenChar,
  normaliseClassSeparators,
  normaliseClassValue,
  normaliseComparable,
  normaliseClassComparable,
  normaliseCompact,
} = codeGs;

test("normaliseWhitespace collapses mixed regular and full-width spaces", () => {
  assert.equal(normaliseWhitespace("  1\u3000 \u30002  "), "1 2");
});

test("normaliseAsciiDigits converts full-width digits without changing ASCII digits", () => {
  assert.equal(
    normaliseAsciiDigits("Year ２０２６ Class 3"),
    "Year 2026 Class 3",
  );
});

test("normaliseClassValue standardises full-width, Kanji digits, and dash variants", () => {
  assert.equal(normaliseClassValue(" １－２ "), "1-2");
  assert.equal(normaliseClassValue("１−２"), "1-2");
  assert.equal(normaliseClassValue("１ー２"), "1-2");
  assert.equal(normaliseClassValue("四ー二"), "4-2");
});

test("normaliseClassSeparators converts prolonged sound marks only inside class-like tokens", () => {
  assert.equal(normaliseClassSeparators("Aー1"), "A-1");
  assert.equal(normaliseClassSeparators("クラスーA"), "クラスーA");
});

test("isClassTokenChar stays narrow and does not treat Japanese text as a class token delimiter", () => {
  assert.equal(isClassTokenChar("A"), true);
  assert.equal(isClassTokenChar("1"), true);
  assert.equal(isClassTokenChar("ク"), false);
});

test("normaliseComparable remains a whitespace and case canonicalizer", () => {
  assert.equal(normaliseComparable("  AbC\u3000Def "), "abc def");
});

test("validateNameInput preserves Kanji numerals in names", () => {
  const result = validateNameInput(" 日本三郎 ");

  assert.equal(result.ok, true);
  assert.equal(result.value, "日本三郎");
});

test("normaliseClassComparable treats ASCII, full-width, and Kanji digits as equal", () => {
  assert.equal(normaliseClassComparable("１−2"), normaliseClassComparable("1-2"));
  assert.equal(normaliseClassComparable("１ー2"), normaliseClassComparable("1-2"));
  assert.equal(normaliseClassComparable("四-二"), normaliseClassComparable("4-2"));
  assert.equal(normaliseClassComparable("零ー一"), normaliseClassComparable("0-1"));
});

test("normaliseClassComparable does not broaden equivalence to full-width Latin letters", () => {
  assert.notEqual(normaliseClassComparable("１-ａ"), normaliseClassComparable("1-a"));
});

test("normaliseCompact removes regular and full-width spaces for rate-limit keys", () => {
  assert.equal(normaliseCompact(" A\u3000 B "), "ab");
});

test("getCanonicalRole only accepts canonical role labels", () => {
  assert.equal(getCanonicalRole(ROLES.general), ROLES.general);
  assert.equal(getCanonicalRole(ROLES.classRep), ROLES.classRep);
  assert.equal(getCanonicalRole("general"), undefined);
});
