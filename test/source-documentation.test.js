const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PRODUCTION_FILES = [
  "Code.gs",
  "Config.gs",
  "GridData.gs",
  "Normalisation.gs",
  "RateLimit.gs",
  "SignupService.gs",
  "SpreadsheetData.gs",
  "Validation.gs",
  "index.html",
  "Styles.html",
  "Schedule.html",
  "SignupModal.html",
  "ClientCore.html",
  "ClientFilters.html",
  "ClientInsights.html",
  "ClientSchedule.html",
  "ClientFormatting.html",
  "ClientModal.html",
  "ClientInit.html",
];

function readProductionFile(filename) {
  return fs.readFileSync(path.join(PROJECT_ROOT, filename), "utf8");
}

function getImmediatelyPrecedingJsDoc(source, functionIndex) {
  const sourceBeforeFunction = source.slice(0, functionIndex).trimEnd();
  if (!sourceBeforeFunction.endsWith("*/")) return "";

  const commentStart = sourceBeforeFunction.lastIndexOf("/**");
  if (commentStart === -1) return "";

  return sourceBeforeFunction.slice(commentStart);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("every production source file explains its responsibility", () => {
  PRODUCTION_FILES.forEach((filename) => {
    const source = readProductionFile(filename);
    assert.match(
      source,
      /@fileoverview\s+\S/,
      `${filename} must contain a non-empty @fileoverview comment`,
    );
  });
});

test("every named production function has an adjacent JSDoc description", () => {
  PRODUCTION_FILES.forEach((filename) => {
    const source = readProductionFile(filename);
    const declarations = source.matchAll(
      /^\s*function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)/gm,
    );

    for (const declaration of declarations) {
      const functionName = declaration[1];
      const jsDoc = getImmediatelyPrecedingJsDoc(source, declaration.index);
      const failureContext = `${filename}:${functionName}`;

      assert.ok(jsDoc, `${failureContext} must have an adjacent JSDoc comment`);
      assert.doesNotMatch(
        jsDoc,
        /@fileoverview\b/,
        `${failureContext} needs its own function documentation`,
      );
      assert.match(
        jsDoc,
        /^\/\*\*\s*\r?\n\s*\*\s+[^@\s][^\r\n]*/,
        `${failureContext} must start with a plain-language summary`,
      );
      assert.match(
        jsDoc,
        /@returns?\s+\{[^\r\n]+\}\s+\S/,
        `${failureContext} must document its return contract`,
      );

      const parameterNames = declaration[2]
        .split(",")
        .map((parameter) => parameter.trim())
        .filter(Boolean);

      parameterNames.forEach((parameterName) => {
        const documentedParameter = new RegExp(
          `@param\\s+\\{[^\\r\\n]+\\}\\s+\\[?${escapeRegExp(parameterName)}(?:[=\\]]|\\s)`,
        );
        assert.match(
          jsDoc,
          documentedParameter,
          `${failureContext} must document parameter ${parameterName}`,
        );
      });
    }
  });
});
