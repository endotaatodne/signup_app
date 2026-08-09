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
    "normaliseBrackets_",
    "normaliseNameValue_",
    "isValidNameValue_",
    "isClassTokenChar_",
    "normaliseClassSeparators_",
    "normaliseClassValue_",
    "normaliseComparable_",
    "normaliseClassComparable_",
    "normaliseNameIdentityKey_",
    "normaliseClassIdentityKey_",
    "buildIdentityTupleHash_",
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
  normaliseBrackets_,
  normaliseNameValue_,
  isValidNameValue_,
  isClassTokenChar_,
  normaliseClassSeparators_,
  normaliseClassValue_,
  normaliseComparable_,
  normaliseClassComparable_,
  normaliseNameIdentityKey_,
  normaliseClassIdentityKey_,
  buildIdentityTupleHash_,
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

test("normaliseBrackets_ converts full-width brackets without changing half-width brackets", () => {
  assert.equal(
    normaliseBrackets_("Alice（parent） (helper)"),
    "Alice(parent) (helper)",
  );
});

test("normaliseNameValue_ trims whitespace and converts full-width brackets", () => {
  assert.equal(normaliseNameValue_(" 山田（太郎） "), "山田(太郎)");
});

test("normaliseNameValue_ removes spaces from Japanese names only", () => {
  assert.equal(normaliseNameValue_(" 山田 太郎 "), "山田太郎");
  assert.equal(normaliseNameValue_("山田\u3000太郎"), "山田太郎");
  assert.equal(normaliseNameValue_("山田\u2002太郎"), "山田太郎");
  assert.equal(normaliseNameValue_(" John  Smith "), "John Smith");
});

test("isValidNameValue_ accepts only canonical brackets after normalisation", () => {
  assert.equal(isValidNameValue_("Alice(parent)"), true);
  assert.equal(isValidNameValue_("Alice（parent）"), false);
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

test("normaliseComparable_ canonicalizes whitespace, case, and brackets", () => {
  assert.equal(normaliseComparable_("  AbC\u3000Def "), "abc def");
  assert.equal(normaliseComparable_("山田（太郎）"), "山田(太郎)");
  assert.equal(normaliseComparable_("山田 太郎"), "山田太郎");
});

test("validateNameInput_ preserves Kanji numerals in names", () => {
  const result = validateNameInput_(" 日本三郎 ");

  assert.equal(result.ok, true);
  assert.equal(result.value, "日本三郎");
});

test("validateNameInput_ allows half-width and full-width parentheses", () => {
  assert.equal(validateNameInput_("Alice (parent)").ok, true);
  assert.equal(validateNameInput_("山田（太郎）").value, "山田(太郎)");
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

test("server identity keys apply NFKC without changing legacy display comparators", () => {
  assert.equal(
    normaliseNameIdentityKey_("\uFF21\uFF4C\uFF49\uFF43\uFF45"),
    normaliseNameIdentityKey_("Alice"),
  );
  assert.equal(
    normaliseClassIdentityKey_("\uFF11-\uFF21"),
    normaliseClassIdentityKey_("1-A"),
  );
  assert.notEqual(
    normaliseComparable_("\uFF21\uFF4C\uFF49\uFF43\uFF45"),
    normaliseComparable_("Alice"),
  );
  assert.notEqual(
    normaliseClassComparable_("\uFF11-\uFF21"),
    normaliseClassComparable_("1-A"),
  );
});

test("server identity keys canonicalize half-width Kana and compatibility forms", () => {
  assert.equal(
    normaliseNameIdentityKey_("\uFF94\uFF8F\uFF80\uFF9E"),
    normaliseNameIdentityKey_("\u30E4\u30DE\u30C0"),
  );
  assert.equal(normaliseNameIdentityKey_("\uFB03"), normaliseNameIdentityKey_("ffi"));
  assert.equal(normaliseNameIdentityKey_("\u2163"), normaliseNameIdentityKey_("IV"));
});

test("server identity keys canonicalize composed and decomposed accents", () => {
  assert.equal(
    normaliseNameIdentityKey_("Jos\u00E9"),
    normaliseNameIdentityKey_("Jose\u0301"),
  );
  assert.equal(validateNameInput_("Jos\u00E9").ok, true);
  assert.equal(validateNameInput_("Jose\u0301").ok, false);
});

test("server identity keys do not collapse unrelated scripts or language distinctions", () => {
  assert.notEqual(normaliseNameIdentityKey_("a"), normaliseNameIdentityKey_("\u0430"));
  assert.notEqual(normaliseNameIdentityKey_("Jose"), normaliseNameIdentityKey_("Jos\u00E9"));
  assert.notEqual(normaliseNameIdentityKey_("\u00DF"), normaliseNameIdentityKey_("ss"));
  assert.notEqual(normaliseNameIdentityKey_("I"), normaliseNameIdentityKey_("\u0131"));
  assert.notEqual(normaliseNameIdentityKey_("I"), normaliseNameIdentityKey_("\u0130"));
});

test("identity tuple hashes are fixed-width and preserve tuple boundaries", () => {
  const first = buildIdentityTupleHash_("\uFB03".repeat(50), "1-A");
  const second = buildIdentityTupleHash_("\uFB03".repeat(49), "\uFB031-A");

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first.length, 64);
  assert.notEqual(first, second);
});

test("normaliseCompact_ removes regular and full-width spaces for rate-limit keys", () => {
  assert.equal(normaliseCompact_(" A\u3000 B "), "ab");
});

test("getCanonicalRole_ only accepts canonical role labels", () => {
  assert.equal(getCanonicalRole_(ROLES.general), ROLES.general);
  assert.equal(getCanonicalRole_(ROLES.classRep), ROLES.classRep);
  assert.equal(
    getCanonicalRole_(ROLES.steeringCommittee),
    ROLES.steeringCommittee,
  );
  assert.equal(getCanonicalRole_(ROLES.orgCommittee), ROLES.orgCommittee);
  assert.equal(getCanonicalRole_("general"), undefined);
  assert.equal(getCanonicalRole_("toString"), undefined);
  assert.equal(getCanonicalRole_("constructor"), undefined);
  assert.equal(getCanonicalRole_("valueOf"), undefined);
  assert.equal(getCanonicalRole_("__proto__"), undefined);
  assert.equal(getCanonicalRole_(null), undefined);
});
