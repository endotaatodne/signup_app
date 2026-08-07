/**
 * @fileoverview Pure text, name, class, and comparison-key normalisation helpers.
 * These functions and constants live in Apps Script's shared global scope and
 * are consumed by validation, spreadsheet, signup, and rate-limit code. They
 * depend only on ECMAScript built-ins and do not read or mutate external state.
 */

/**
 * Collapses JavaScript whitespace, including full-width spaces, to one space.
 * @param {*} value - Value to coerce to text.
 * @returns {string} Trimmed text with canonical spacing.
 */
function normaliseWhitespace_(value) {
  return String(value)
    .replace(/[\s\u3000]+/g, " ")
    .trim();
}

// Class matching canonicalises a narrow Kanji digit set. Names must preserve
// these characters verbatim.
const CLASS_KANJI_DIGITS = {
  "\u3007": "0",
  "\u96F6": "0",
  "\u4E00": "1",
  "\u4E8C": "2",
  "\u4E09": "3",
  "\u56DB": "4",
  "\u4E94": "5",
  "\u516D": "6",
  "\u4E03": "7",
  "\u516B": "8",
  "\u4E5D": "9",
};

/**
 * Converts full-width decimal digits to ASCII without changing other text.
 * @param {*} value - Value to coerce to text.
 * @returns {string} Text containing ASCII decimal digits where applicable.
 */
function normaliseAsciiDigits_(value) {
  return String(value).replace(/[\uFF10-\uFF19]/g, function (char) {
    return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
  });
}

/**
 * Converts full-width round brackets to their ASCII equivalents.
 * @param {*} value - Value to coerce to text.
 * @returns {string} Text with canonical round brackets.
 */
function normaliseBrackets_(value) {
  return String(value)
    .replace(/\uFF08/g, "(")
    .replace(/\uFF09/g, ")");
}

/**
 * Detects characters that cause a name to use Japanese spacing rules.
 * @param {*} value - Value to inspect as text.
 * @returns {boolean} Whether the text contains a supported Japanese character.
 */
function hasJapaneseNameCharacters_(value) {
  return /[\u3005\u3006\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F]/.test(
    String(value),
  );
}

/**
 * Canonicalises name spacing, removing all spaces when Japanese text is found.
 * Non-Japanese names retain one space between separated tokens.
 * @param {*} value - Name-like value to coerce to text.
 * @returns {string} Name with canonical spacing.
 */
function normaliseNameSpacing_(value) {
  const normalisedValue = normaliseWhitespace_(value);
  if (hasJapaneseNameCharacters_(normalisedValue)) {
    return normalisedValue.replace(/[\s\u3000]+/g, "");
  }
  return normalisedValue;
}

/**
 * Canonicalises the brackets and spacing used in a participant name.
 * @param {*} value - Name-like value to coerce to text.
 * @returns {string} Normalised participant name.
 */
function normaliseNameValue_(value) {
  return normaliseNameSpacing_(normaliseBrackets_(value));
}

/**
 * Checks a normalised name against the permitted character set.
 * @param {*} value - Name value to test.
 * @returns {boolean} Whether only letters, numbers, spaces, and allowed
 *   punctuation are present.
 */
function isValidNameValue_(value) {
  return /^[\p{L}\p{N}\s\-'.()]+$/u.test(value);
}

/**
 * Converts the deliberately narrow Kanji digit set used in class labels.
 * This helper must not be applied to participant names.
 * @param {*} value - Class-like value to coerce to text.
 * @returns {string} Text with supported Kanji digits converted to ASCII.
 */
function normaliseKanjiDigits_(value) {
  return String(value).replace(
    /[\u3007\u96F6\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D]/g,
    function (char) {
      return CLASS_KANJI_DIGITS[char];
    },
  );
}

/**
 * Checks whether a character can border a class-label separator.
 * @param {string} char - Single character, or an empty boundary value.
 * @returns {boolean} Whether the character is an ASCII/full-width Latin
 *   letter or decimal digit.
 */
function isClassTokenChar_(char) {
  return /^[0-9A-Za-z\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]$/.test(char);
}

/**
 * Converts Unicode dash variants in class labels to ASCII hyphens.
 * A Japanese prolonged-sound mark is converted only when surrounded by
 * class-token characters, so ordinary Japanese words remain unchanged.
 * @param {*} value - Class-like value to coerce to text.
 * @returns {string} Text with canonical class separators.
 */
function normaliseClassSeparators_(value) {
  const source = String(value);
  let result = "";

  for (let i = 0; i < source.length; i += 1) {
    const char = source.charAt(i);
    if (/[\u2010-\u2015\u2212\uFF0D]/.test(char)) {
      result += "-";
      continue;
    }

    if (
      char === "\u30FC" &&
      isClassTokenChar_(source.charAt(i - 1)) &&
      isClassTokenChar_(source.charAt(i + 1))
    ) {
      result += "-";
      continue;
    }

    result += char;
  }

  return result;
}

/**
 * Canonicalises digits, whitespace, and separators in a class value.
 * @param {*} value - Class-like value to coerce to text.
 * @returns {string} Normalised class label.
 */
function normaliseClassValue_(value) {
  return normaliseClassSeparators_(
    normaliseWhitespace_(normaliseKanjiDigits_(normaliseAsciiDigits_(value))),
  );
}

/**
 * Produces the case-insensitive comparison key used for participant names.
 * @param {*} value - Name-like value to coerce to text.
 * @returns {string} Lower-case canonical name key.
 */
function normaliseComparable_(value) {
  return normaliseNameValue_(value).toLowerCase();
}

/**
 * Produces the case-insensitive comparison key used for class labels.
 * @param {*} value - Class-like value to coerce to text.
 * @returns {string} Lower-case canonical class key.
 */
function normaliseClassComparable_(value) {
  return normaliseClassValue_(value).toLowerCase();
}

/**
 * Produces a lower-case, whitespace-free component for rate-limit keys.
 * @param {*} value - Key component to coerce to text.
 * @returns {string} Compact comparison key.
 */
function normaliseCompact_(value) {
  return String(value)
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "");
}
