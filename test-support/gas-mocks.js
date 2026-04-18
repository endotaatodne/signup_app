const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function createSheet(values, displayValues = values) {
  const state = {
    values: values.map((row) => row.slice()),
    displayValues: displayValues.map((row) => row.slice()),
    deletedRows: [],
  };

  return {
    __state: state,
    getDataRange() {
      return {
        getValues() {
          return state.values.map((row) => row.slice());
        },
        getDisplayValues() {
          return state.displayValues.map((row) => row.slice());
        },
      };
    },
    appendRow(row) {
      state.values.push(row.slice());
      state.displayValues.push(row.map((value) => String(value ?? "")));
    },
    deleteRow(index) {
      state.deletedRows.push(index);
      state.values.splice(index - 1, 1);
      state.displayValues.splice(index - 1, 1);
    },
  };
}

function createSpreadsheet(name, sheets) {
  return {
    getName() {
      return name;
    },
    getSheetByName(sheetName) {
      return sheets[sheetName] || null;
    },
  };
}

function formatDate(date, format) {
  if (format === "HH:mm") {
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  if (format === "dd MMM yyyy") {
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = MONTHS[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    return `${day} ${month} ${year}`;
  }

  throw new Error(`Unsupported format: ${format}`);
}

function createHtmlService() {
  return {
    createHtmlOutput(content) {
      return {
        kind: "html",
        content,
      };
    },
    createTemplateFromFile(fileName) {
      return {
        fileName,
        evaluate() {
          return {
            kind: "template",
            fileName,
            gridData: this.gridData,
            alias: this.alias,
            roles: this.roles,
            titleData: this.title,
            setTitle(title) {
              this.title = title;
              return this;
            },
          };
        },
      };
    },
  };
}

function createMockDate(nowValue = "2026-04-19T00:00:00Z") {
  const RealDate = Date;

  return class MockDate extends RealDate {
    constructor(...args) {
      super(...(args.length > 0 ? args : [nowValue]));
    }

    static now() {
      return new RealDate(nowValue).getTime();
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  };
}

function createLock() {
  return {
    released: false,
    waitLock() {},
    releaseLock() {
      this.released = true;
    },
  };
}

function createGasMocks(options = {}) {
  const {
    masterSheetId = "master-sheet-id",
    spreadsheets = {},
    cacheStore = new Map(),
    uuidValues = ["uuid-1"],
    deployedUrl = "https://example.com/app",
    nowValue = "2026-04-19T00:00:00Z",
  } = options;

  let uuidIndex = 0;
  const lock = createLock();
  const logs = [];

  return {
    logs,
    lock,
    globals: {
      console: {
        error(message) {
          logs.push({ level: "error", message });
        },
      },
      PropertiesService: {
        getScriptProperties() {
          return {
            getProperty(key) {
              if (key === "MASTER_SHEET_ID") {
                return masterSheetId;
              }
              return null;
            },
          };
        },
      },
      SpreadsheetApp: {
        openById(id) {
          const spreadsheet = spreadsheets[id];
          if (!spreadsheet) {
            throw new Error(`Unknown spreadsheet: ${id}`);
          }
          return spreadsheet;
        },
      },
      Utilities: {
        Charset: {
          UTF_8: "utf8",
        },
        base64Encode(value) {
          return Buffer.from(String(value), "utf8").toString("base64");
        },
        formatDate(date, _timezone, format) {
          return formatDate(date, format);
        },
        getUuid() {
          const nextValue = uuidValues[Math.min(uuidIndex, uuidValues.length - 1)];
          uuidIndex += 1;
          return nextValue;
        },
      },
      HtmlService: createHtmlService(),
      LockService: {
        getScriptLock() {
          return lock;
        },
      },
      CacheService: {
        getScriptCache() {
          return {
            get(key) {
              return cacheStore.has(key) ? cacheStore.get(key) : null;
            },
            put(key, value) {
              cacheStore.set(key, String(value));
            },
          };
        },
      },
      ScriptApp: {
        getService() {
          return {
            getUrl() {
              return deployedUrl;
            },
          };
        },
      },
      Date: createMockDate(nowValue),
    },
  };
}

module.exports = {
  createSheet,
  createSpreadsheet,
  createGasMocks,
};
