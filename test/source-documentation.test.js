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

function getMarkdownSection(source, heading) {
  const headingPattern = new RegExp(
    `^### ${escapeRegExp(heading)}[\\t ]*(?=\\r?$)`,
    "m",
  );
  const headingMatch = headingPattern.exec(source);
  assert.ok(headingMatch, `README must contain the ${heading} section`);

  const contentStart = headingMatch.index + headingMatch[0].length;
  const nextHeadingPattern = /^#{1,3}(?:[\t ]+|$)/gm;
  nextHeadingPattern.lastIndex = contentStart;
  const nextHeading = nextHeadingPattern.exec(source);
  return source.slice(contentStart, nextHeading ? nextHeading.index : undefined);
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

test("Markdown section extraction ends at a following higher-level heading", () => {
  const source = "### Target\r\ninside\r\n## Following\r\nAPP_TIME_ZONE\r\n";
  const section = getMarkdownSection(source, "Target");

  assert.match(section, /inside/);
  assert.doesNotMatch(section, /APP_TIME_ZONE/);
});

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
    const declarations = [
      ...source.matchAll(
        /^\s*function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)/gm,
      ),
      ...source.matchAll(
        /^\s*(?:var|let|const)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*function\s*\(([^)]*)\)/gm,
      ),
    ].sort((left, right) => left.index - right.index);

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

test("README role-colour guidance uses current selector families", () => {
  const roleColourSections = {
    "README.en.md": "Changing Role Colours",
    "README.ja.md": "役割カラーの変更",
  };
  const selectorFamilies = [
    ".name-role-*",
    ".role-btn-*",
    ".modal-submit-*",
    ".names-role-label-*",
    ".name-chip.name-role-*",
    ".mobile-slot-summary-item.role-*",
    ".mobile-role-filter-pill.role-*",
    ".mobile-overview-role-chip.role-*",
    ".desktop-insight-chip.role-*",
  ];

  Object.entries(roleColourSections).forEach(([filename, heading]) => {
    const source = readProductionFile(filename);
    assert.doesNotMatch(source, /\.count-(?:general|classrep|steeringcommittee|orgcommittee)\b/);
    const section = getMarkdownSection(source, heading);

    selectorFamilies.forEach((selectorFamily) => {
      assert.ok(
        section.includes(selectorFamily),
        `${filename}'s ${heading} section must name ${selectorFamily}`,
      );
    });
  });
});

test("README timezone guidance documents both timezone configuration locations", () => {
  const timezoneSections = {
    "README.en.md": "Changing the Timezone",
    "README.ja.md": "タイムゾーンの変更",
  };

  Object.entries(timezoneSections).forEach(([filename, heading]) => {
    const source = readProductionFile(filename);
    const section = getMarkdownSection(source, heading);

    ["appsscript.json", "Config.gs", "APP_TIME_ZONE"].forEach((identifier) => {
      assert.ok(
        section.includes(identifier),
        `${filename}'s ${heading} section must mention ${identifier}`,
      );
    });
  });
});
