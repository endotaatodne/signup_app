const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function getAppsScriptFileNames() {
  return fs
    .readdirSync(PROJECT_ROOT)
    .filter((fileName) => fileName.endsWith(".gs"))
    .sort((left, right) => {
      if (left === "Code.gs") return -1;
      if (right === "Code.gs") return 1;
      return left.localeCompare(right);
    });
}

function getAppsScriptSource() {
  return getAppsScriptFileNames()
    .map((fileName) => {
      const filePath = path.resolve(PROJECT_ROOT, fileName);
      return `// Source: ${fileName}\n${fs.readFileSync(filePath, "utf8")}`;
    })
    .join("\n\n");
}

function loadCodeGs(exportNames, globals = {}) {
  const source = getAppsScriptSource();

  const script = `
${source}

module.exports = { ${exportNames.join(", ")} };
`;

  const context = {
    module: { exports: {} },
    exports: {},
    ...globals,
  };

  vm.createContext(context);
  vm.runInContext(script, context, { filename: "AppsScriptProject.gs" });

  return {
    exports: context.module.exports,
    context,
  };
}

module.exports = {
  getAppsScriptFileNames,
  getAppsScriptSource,
  loadCodeGs,
};
