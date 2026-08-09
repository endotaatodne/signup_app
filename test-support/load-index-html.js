const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const HTML_INCLUDE_PATTERN =
  /<\?!=\s*include_\(\s*["']([A-Za-z0-9_-]+)["']\s*\)\s*;?\s*\?>/g;

function encodeBase64(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

function getRawIndexHtmlSource() {
  return fs.readFileSync(path.resolve(PROJECT_ROOT, "index.html"), "utf8");
}

function getHtmlPartialFileNames() {
  return [...getRawIndexHtmlSource().matchAll(HTML_INCLUDE_PATTERN)].map(
    (match) => match[1],
  );
}

function validateHtmlPartial(fileName, source) {
  const trimmedSource = source.trim();
  const wrapperName =
    fileName === "Styles"
      ? "style"
      : fileName.startsWith("Client")
        ? "script"
        : "";

  if (wrapperName) {
    const wrapperPattern = new RegExp(
      `^<${wrapperName}>[\\s\\S]*<\\/${wrapperName}>$`,
    );
    if (!wrapperPattern.test(trimmedSource)) {
      throw new Error(
        `${fileName}.html must contain exactly one complete ` +
          `<${wrapperName}> partial`,
      );
    }
    return;
  }

  if (/<(?:script|style)(?:\s|>)/i.test(trimmedSource)) {
    throw new Error(`${fileName}.html must contain markup only`);
  }
}

function getIndexHtmlSource() {
  return getRawIndexHtmlSource().replace(
    HTML_INCLUDE_PATTERN,
    (_match, includedFileName) => {
      const filePath = path.resolve(PROJECT_ROOT, `${includedFileName}.html`);
      const partialSource = fs.readFileSync(filePath, "utf8");
      if (/<\?/.test(partialSource)) {
        throw new Error(
          `${includedFileName}.html contains a template scriptlet; ` +
            "Apps Script does not recursively evaluate included partials",
        );
      }
      validateHtmlPartial(includedFileName, partialSource);
      return partialSource;
    },
  );
}

function extractInlineScripts(htmlSource) {
  const matches = [...htmlSource.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!matches.length) {
    throw new Error("Could not find inline scripts in the composed HTML");
  }

  return matches.map((match) => match[1]);
}

function loadIndexHtml(exportsList, options = {}) {
  const {
    gridData = { events: [], times: [], activities: [] },
    alias = "test-alias",
    eventStatus = "OPEN",
    roles = {
      general: "一般保護者",
      classRep: "学年委員",
      steeringCommittee: "役員、運営・実行委員",
      orgCommittee: "実行委員",
    },
    title = "Test Event",
    globals = {},
  } = options;

  const htmlSource = getIndexHtmlSource();
  const inlineScripts = extractInlineScripts(htmlSource).map((source) =>
    source
      .replace(/<\?!= gridData \?>/g, encodeBase64(JSON.stringify(gridData)))
      .replace(/<\?!= alias \?>/g, encodeBase64(alias))
      .replace(/<\?!= eventStatus \?>/g, encodeBase64(eventStatus))
      .replace(/<\?!= roles \?>/g, encodeBase64(JSON.stringify(roles)))
      .replace(/<\?!= title \?>/g, encodeBase64(title)),
  );

  const context = {
    module: { exports: {} },
    exports: {},
    Buffer,
    atob(value) {
      return Buffer.from(value, "base64").toString("binary");
    },
    decodeURIComponent,
    encodeURIComponent,
    JSON,
    setTimeout,
    clearTimeout,
    ...globals,
  };

  vm.createContext(context);
  inlineScripts.forEach((source, index) => {
    vm.runInContext(source, context, {
      filename: `index.html<script:${index + 1}>`,
    });
  });
  vm.runInContext(
    `module.exports = {\n  ${exportsList.join(",\n  ")}\n};`,
    context,
    { filename: "index.html<exports>" },
  );

  return {
    exports: context.module.exports,
    context,
  };
}

module.exports = {
  getHtmlPartialFileNames,
  getIndexHtmlSource,
  getRawIndexHtmlSource,
  loadIndexHtml,
};
