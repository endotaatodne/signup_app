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

function getRangeColumnCount(rows) {
  return rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
}

function readRange(rows, row, column, numRows, numColumns) {
  const startRow = row - 1;
  const startColumn = column - 1;

  return Array.from({ length: numRows }, (_, rowOffset) => {
    const sourceRow = rows[startRow + rowOffset] || [];
    return Array.from({ length: numColumns }, (_, columnOffset) => {
      const value = sourceRow[startColumn + columnOffset];
      return value === undefined ? "" : value;
    });
  });
}

function createRange(state, row, column, numRows, numColumns) {
  const rangeDetails = { row, column, numRows, numColumns };

  return {
    getNumRows() {
      return numRows;
    },
    getNumColumns() {
      return numColumns;
    },
    getValues() {
      state.calls.getValues += 1;
      state.calls.valueCellsRead += numRows * numColumns;
      state.calls.valueRanges.push({ ...rangeDetails });
      if (typeof state.onGetValues === "function") {
        state.onGetValues({
          callNumber: state.calls.getValues,
          ...rangeDetails,
        });
      }
      return readRange(state.values, row, column, numRows, numColumns);
    },
    getDisplayValues() {
      state.calls.getDisplayValues += 1;
      state.calls.displayCellsRead += numRows * numColumns;
      state.calls.displayRanges.push({ ...rangeDetails });
      if (typeof state.onGetDisplayValues === "function") {
        state.onGetDisplayValues({
          callNumber: state.calls.getDisplayValues,
          ...rangeDetails,
        });
      }
      return readRange(
        state.displayValues,
        row,
        column,
        numRows,
        numColumns,
      );
    },
  };
}

function assertRangeWithinSheet(state, row, column, numRows, numColumns) {
  const maxRows = Math.max(
    state.maxRows,
    state.values.length,
    state.displayValues.length,
  );
  const maxColumns = Math.max(
    state.maxColumns,
    getRangeColumnCount(state.values),
    getRangeColumnCount(state.displayValues),
  );

  if (row < 1 || numRows < 1 || row + numRows - 1 > maxRows) {
    throw new Error("Those rows are out of bounds.");
  }
  if (column < 1 || numColumns < 1 || column + numColumns - 1 > maxColumns) {
    throw new Error("Those columns are out of bounds.");
  }
}

function createSheet(values, displayValues = values) {
  const initialRowCount = Math.max(values.length, displayValues.length);
  const initialColumnCount = Math.max(
    getRangeColumnCount(values),
    getRangeColumnCount(displayValues),
  );
  const state = {
    values: values.map((row) => row.slice()),
    displayValues: displayValues.map((row) => row.slice()),
    maxRows: Math.max(initialRowCount, 1),
    maxColumns: Math.max(initialColumnCount, 1),
    deletedRows: [],
    onGetValues: null,
    onGetDisplayValues: null,
    calls: {
      getDataRange: 0,
      getRange: 0,
      getValues: 0,
      getDisplayValues: 0,
      valueCellsRead: 0,
      displayCellsRead: 0,
      valueRanges: [],
      displayRanges: [],
    },
  };

  return {
    __state: state,
    getDataRange() {
      state.calls.getDataRange += 1;
      const numRows = Math.max(
        state.values.length,
        state.displayValues.length,
      );
      const numColumns = Math.max(
        getRangeColumnCount(state.values),
        getRangeColumnCount(state.displayValues),
      );
      return createRange(state, 1, 1, numRows, numColumns);
    },
    getRange(row, column, numRows, numColumns) {
      state.calls.getRange += 1;
      assertRangeWithinSheet(state, row, column, numRows, numColumns);
      return createRange(state, row, column, numRows, numColumns);
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
  const state = {
    calls: {
      getSheetByName: 0,
      getSheetByNameByName: Object.create(null),
    },
  };

  return {
    __state: state,
    getName() {
      return name;
    },
    getSheetByName(sheetName) {
      state.calls.getSheetByName += 1;
      state.calls.getSheetByNameByName[sheetName] =
        (state.calls.getSheetByNameByName[sheetName] || 0) + 1;
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

  if (format === "yyyy-MM-dd") {
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${date.getUTCFullYear()}-${month}-${day}`;
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
    createHtmlOutputFromFile(fileName) {
      return {
        getContent() {
          return `<!-- included:${fileName} -->`;
        },
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
            eventStatus: this.eventStatus,
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

function createLock(shouldFailWait) {
  return {
    released: false,
    releaseCount: 0,
    waitCount: 0,
    waitLock() {
      this.waitCount += 1;
      if (shouldFailWait) {
        throw new Error("Lock wait failed");
      }
    },
    releaseLock() {
      this.released = true;
      this.releaseCount += 1;
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
    lockWaitFails = false,
    propertyStore = new Map(),
    serviceCalls = {
      spreadsheetOpenById: 0,
      spreadsheetOpenByIdById: Object.create(null),
    },
  } = options;

  let uuidIndex = 0;
  const lock = createLock(lockWaitFails);
  const logs = [];

  return {
    logs,
    lock,
    propertyStore,
    serviceCalls,
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
              return propertyStore.has(key) ? propertyStore.get(key) : null;
            },
            setProperty(key, value) {
              propertyStore.set(key, String(value));
              return this;
            },
          };
        },
      },
      SpreadsheetApp: {
        openById(id) {
          serviceCalls.spreadsheetOpenById += 1;
          serviceCalls.spreadsheetOpenByIdById[id] =
            (serviceCalls.spreadsheetOpenByIdById[id] || 0) + 1;
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
