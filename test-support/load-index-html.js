const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function encodeBase64(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

function extractInlineScript(htmlSource) {
  const matches = [...htmlSource.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!matches.length) {
    throw new Error("Could not find inline script in index.html");
  }

  return matches[matches.length - 1][1];
}

function loadIndexHtml(exportsList, options = {}) {
  const {
    gridData = { events: [], times: [], activities: [] },
    alias = "test-alias",
    roles = {
      general: "一般保護者",
      classRep: "学年委員",
      committee: "運営委員・役員",
    },
    title = "Test Event",
    globals = {},
  } = options;

  const indexPath = path.resolve(__dirname, "..", "index.html");
  const htmlSource = fs.readFileSync(indexPath, "utf8");
  const inlineScript = extractInlineScript(htmlSource)
    .replace(/<\?!= gridData \?>/g, encodeBase64(JSON.stringify(gridData)))
    .replace(/<\?!= alias \?>/g, encodeBase64(alias))
    .replace(/<\?!= roles \?>/g, encodeBase64(JSON.stringify(roles)))
    .replace(/<\?!= title \?>/g, encodeBase64(title));

  const script = `
${inlineScript}

module.exports = {
  ${exportsList.join(",\n  ")}
};
`;

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
  vm.runInContext(script, context, { filename: "index.html<script>" });

  return {
    exports: context.module.exports,
    context,
  };
}

module.exports = {
  loadIndexHtml,
};
