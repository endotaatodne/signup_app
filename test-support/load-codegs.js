const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadCodeGs(exportNames, globals = {}) {
  const codeGsPath = path.resolve(__dirname, "..", "Code.gs");
  const source = fs.readFileSync(codeGsPath, "utf8");

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
  vm.runInContext(script, context, { filename: "Code.gs" });

  return {
    exports: context.module.exports,
    context,
  };
}

module.exports = {
  loadCodeGs,
};
