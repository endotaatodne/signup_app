const test = require("node:test");
const assert = require("node:assert/strict");

const { loadCodeGs } = require("../test-support/load-codegs");
const {
  createSheet,
  createSpreadsheet,
  createGasMocks,
} = require("../test-support/gas-mocks");

const EVENT_SHEET_ID = "eventsheetid1234567890";
const MASTER_SHEET_ID = "master-sheet-id";

function createEventRows() {
  return [
    [
      "EventID",
      "Activity",
      "Subtitle",
      "Date",
      "StartTime",
      "EndTime",
      "Description",
      "Location",
      "GeneralMax",
      "ClassRepMax",
      "CommitteeMax",
    ],
    [
      1,
      "Hall Monitor",
      "Morning",
      new Date("2026-04-20T00:00:00Z"),
      new Date("1970-01-01T09:30:00Z"),
      new Date("1970-01-01T11:00:00Z"),
      'Guide <parents> & "students"',
      "Gym",
      2,
      1,
      1,
    ],
  ];
}

function createConfigRows() {
  return [
    ["Alias", "SheetId"],
    ["Spring-Fete", EVENT_SHEET_ID],
    ["bad", "short"],
  ];
}

function loadBackend(options = {}) {
  const {
    configRows = createConfigRows(),
    eventRows = createEventRows(),
    signupRows = [["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"]],
    signupDisplayRows = signupRows,
    eventSpreadsheetName = "Spring Fete",
    extraSpreadsheets = {},
    nowValue,
    cacheStore,
  } = options;

  const masterSpreadsheet = createSpreadsheet("Master", {
    Config: createSheet(configRows),
  });
  const eventSpreadsheet = createSpreadsheet(eventSpreadsheetName, {
    Events: createSheet(eventRows),
    Signups: createSheet(signupRows, signupDisplayRows),
  });

  const spreadsheets = {
    [MASTER_SHEET_ID]: masterSpreadsheet,
    [EVENT_SHEET_ID]: eventSpreadsheet,
    ...extraSpreadsheets,
  };

  const mockEnv = createGasMocks({
    masterSheetId: MASTER_SHEET_ID,
    spreadsheets,
    nowValue,
    cacheStore,
  });

  const { exports: app } = loadCodeGs(
    [
      "ROLES",
      "doGet",
      "getGridData",
      "submitSignup",
      "cancelSignup",
      "checkRateLimit",
      "getEventConfig",
      "sanitiseForScript",
      "getCanonicalRole",
      "normaliseWhitespace",
      "normaliseAsciiDigits",
      "normaliseClassValue",
      "normaliseComparable",
      "normaliseClassComparable",
      "normaliseCompact",
      "getDeployedUrl",
    ],
    mockEnv.globals,
  );

  return {
    app,
    spreadsheets,
    lock: mockEnv.lock,
    logs: mockEnv.logs,
  };
}

test("getEventConfig normalises aliases and filters invalid sheet IDs", () => {
  const { app } = loadBackend();
  const config = Object.fromEntries(Object.entries(app.getEventConfig()));

  assert.deepEqual(config, {
    "spring-fete": EVENT_SHEET_ID,
  });
});

test("sanitiseForScript escapes script-sensitive characters", () => {
  const { app } = loadBackend();

  assert.equal(
    app.sanitiseForScript(`<&>"'/\``),
    "\\u003c\\u0026\\u003e\\u0022\\u0027\\u002f\\u0060",
  );
});

test("getGridData uses display values for class text and computes role counts", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", new Date("2026-04-01T00:00:00Z"), "一般保護者", new Date()],
    ["s2", 1, "Bob", "2-1", "学年委員", new Date()],
  ];
  const signupDisplayRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", "1", "Alice", "1-1", "一般保護者", "2026-04-01"],
    ["s2", "1", "Bob", "2-1", "学年委員", "2026-04-01"],
  ];
  const { app, spreadsheets } = loadBackend({ signupRows, signupDisplayRows });

  const gridData = app.getGridData(spreadsheets[EVENT_SHEET_ID]);
  const event = gridData.events[0];

  assert.equal(event.date, "20 Apr 2026");
  assert.equal(event.startTime, "09:30");
  assert.equal(event.signups[0].cls, "1-1");
  assert.equal(event.slots.general.filled, 1);
  assert.equal(event.slots.classRep.filled, 1);
  assert.equal(event.description, "Guide \\u003cparents\\u003e \\u0026 \\u0022students\\u0022");
});

test("doGet returns rendered template output for a valid alias", () => {
  const { app } = loadBackend();

  const result = app.doGet({ parameter: { event: "Spring-Fete" } });
  const decodedTitle = Buffer.from(result.titleData, "base64").toString("utf8");
  const decodedAlias = Buffer.from(result.alias, "base64").toString("utf8");
  const decodedGridData = JSON.parse(
    Buffer.from(result.gridData, "base64").toString("utf8"),
  );

  assert.equal(result.kind, "template");
  assert.equal(result.title, "Spring Fete");
  assert.equal(decodedTitle, "Spring Fete");
  assert.equal(decodedAlias, "Spring-Fete");
  assert.equal(decodedGridData.events[0].activity, "Hall Monitor");
});

test("doGet returns an error page when the alias is invalid", () => {
  const { app } = loadBackend();

  const result = app.doGet({ parameter: { event: "<bad>" } });

  assert.equal(result.kind, "html");
  assert.match(result.content, /Invalid event link/);
});

test("checkRateLimit limits repeated person submissions and global event flooding", () => {
  const { app } = loadBackend({ cacheStore: new Map() });

  assert.equal(app.checkRateLimit(1, "Alice", "1-1"), true);
  assert.equal(app.checkRateLimit(1, "Alice", "1-1"), true);
  assert.equal(app.checkRateLimit(1, "Alice", "1-1"), true);
  assert.equal(app.checkRateLimit(1, "Alice", "1-1"), false);

  const { app: eventFloodApp } = loadBackend({ cacheStore: new Map() });
  for (let i = 0; i < 20; i += 1) {
    assert.equal(eventFloodApp.checkRateLimit(1, `User${i}`, `${i}`), true);
  }
  assert.equal(eventFloodApp.checkRateLimit(1, "Overflow", "9"), false);
});

test("checkRateLimit keeps signup and cancel buckets isolated", () => {
  const cacheStore = new Map();
  const { app } = loadBackend({ cacheStore });

  assert.equal(app.checkRateLimit(1, "Alice", "1-1", "signup"), true);
  assert.equal(app.checkRateLimit(1, "Alice", "1-1", "signup"), true);
  assert.equal(app.checkRateLimit(1, "Alice", "1-1", "signup"), true);
  assert.equal(app.checkRateLimit(1, "Alice", "1-1", "signup"), false);

  assert.equal(app.checkRateLimit(1, "Alice", "1-1", "cancel"), true);
  assert.equal(app.checkRateLimit(1, "Alice", "1-1", "cancel"), true);
  assert.equal(app.checkRateLimit(1, "Alice", "1-1", "cancel"), true);
  assert.equal(app.checkRateLimit(1, "Alice", "1-1", "cancel"), false);
});

test("checkRateLimit limits global event flooding for cancellation attempts", () => {
  const { app } = loadBackend({ cacheStore: new Map() });

  for (let i = 0; i < 20; i += 1) {
    assert.equal(app.checkRateLimit(1, `User${i}`, `${i}`, "cancel"), true);
  }
  assert.equal(app.checkRateLimit(1, "Overflow", "9", "cancel"), false);
});

test("submitSignup appends a normalised signup row on success", () => {
  const { app, spreadsheets, lock } = loadBackend();
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.submitSignup(
    "1",
    " Alice ",
    "四ー二",
    app.ROLES.general,
    "spring-fete",
  );
  const signupRows = signupsSheet.getDataRange().getValues();
  const appendedRow = signupRows[signupRows.length - 1];

  assert.equal(result.success, true);
  assert.equal(result.name, "Alice");
  assert.equal(result.cls, "4-2");
  assert.equal(appendedRow[2], "Alice");
  assert.equal(appendedRow[3], "4-2");
  assert.equal(appendedRow[4], app.ROLES.general);
  assert.equal(lock.released, true);
});

test("submitSignup preserves Kanji numerals in names while normalising class", () => {
  const { app, spreadsheets } = loadBackend();
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.submitSignup(
    "1",
    " 日本三郎 ",
    "四ー二",
    app.ROLES.general,
    "spring-fete",
  );
  const signupRows = signupsSheet.getDataRange().getValues();
  const appendedRow = signupRows[signupRows.length - 1];

  assert.equal(result.success, true);
  assert.equal(result.name, "日本三郎");
  assert.equal(result.cls, "4-2");
  assert.equal(appendedRow[2], "日本三郎");
  assert.equal(appendedRow[3], "4-2");
});

test("submitSignup accepts names up to 50 characters", () => {
  const { app, spreadsheets } = loadBackend();
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");
  const longName = "A".repeat(50);

  const result = app.submitSignup(
    "1",
    longName,
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );
  const signupRows = signupsSheet.getDataRange().getValues();
  const appendedRow = signupRows[signupRows.length - 1];

  assert.equal(result.success, true);
  assert.equal(result.name, longName);
  assert.equal(appendedRow[2], longName);
});

test("submitSignup rejects duplicate names after normalisation", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-1", "一般保護者", new Date()],
  ];
  const { app } = loadBackend({ signupRows });

  const result = app.submitSignup("1", " alice ", "1-2", app.ROLES.committee, "spring-fete");

  assert.equal(result.success, false);
  assert.match(result.message, /同じ名前/);
});

test("submitSignup rejects a full role slot", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-1", "一般保護者", new Date()],
    ["s2", 1, "Bob", "1-2", "一般保護者", new Date()],
  ];
  const { app } = loadBackend({ signupRows });

  const result = app.submitSignup("1", "Carol", "1-3", app.ROLES.general, "spring-fete");

  assert.equal(result.success, false);
  assert.match(result.message, /募集は終了しました/);
});

test("cancelSignup matches normalised class values and deletes the correct row", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-1", "一般保護者", new Date()],
  ];
  const signupDisplayRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", "1", "Alice", "四ー一", "一般保護者", "2026-04-01"],
  ];
  const { app, spreadsheets, lock } = loadBackend({ signupRows, signupDisplayRows });
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.cancelSignup("1", " Alice ", "4-1", app.ROLES.general, "spring-fete");

  assert.equal(result.success, true);
  assert.deepEqual(signupsSheet.__state.deletedRows, [2]);
  assert.equal(lock.released, true);
});

test("cancelSignup uses the same invalid-character validation as submitSignup", () => {
  const { app } = loadBackend();

  const submitResult = app.submitSignup(
    "1",
    "Alice<",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );
  const cancelResult = app.cancelSignup(
    "1",
    "Alice<",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(submitResult.success, false);
  assert.equal(cancelResult.success, false);
  assert.equal(cancelResult.message, submitResult.message);
});

test("cancelSignup matches submitSignup class-length validation", () => {
  const { app } = loadBackend();

  const submitResult = app.submitSignup(
    "1",
    "Alice",
    "12345678901",
    app.ROLES.general,
    "spring-fete",
  );
  const cancelResult = app.cancelSignup(
    "1",
    "Alice",
    "12345678901",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(submitResult.success, false);
  assert.equal(cancelResult.success, false);
  assert.equal(cancelResult.message, submitResult.message);
});

test("cancelSignup matches submitSignup name-length validation", () => {
  const { app } = loadBackend();
  const longName = "A".repeat(51);

  const submitResult = app.submitSignup(
    "1",
    longName,
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );
  const cancelResult = app.cancelSignup(
    "1",
    longName,
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(submitResult.success, false);
  assert.equal(cancelResult.success, false);
  assert.equal(cancelResult.message, submitResult.message);
  assert.match(submitResult.message, /５０文字以下/);
});

test("cancelSignup rejects non-canonical role labels", () => {
  const { app } = loadBackend();

  const result = app.cancelSignup("1", "Alice", "1-1", "general", "spring-fete");

  assert.equal(result.success, false);
  assert.match(result.message, /ポジション/);
});

test("cancelSignup rate limits repeated lookup attempts", () => {
  const { app } = loadBackend({ cacheStore: new Map() });

  const attempts = [];
  for (let i = 0; i < 4; i += 1) {
    attempts.push(
      app.cancelSignup("1", "Alice", "1-1", app.ROLES.general, "spring-fete"),
    );
  }

  assert.equal(attempts[0].success, false);
  assert.equal(attempts[1].message, attempts[0].message);
  assert.equal(attempts[2].message, attempts[0].message);
  assert.notEqual(attempts[3].message, attempts[0].message);
});

test("getGridData exposes only public signup fields and sanitised values", () => {
  const { app, spreadsheets } = loadBackend();
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    [
      "signup-1",
      1,
      "<Alice>",
      "1-1",
      app.ROLES.general,
      new Date("2026-04-01T00:00:00Z"),
    ],
  ];
  const signupDisplayRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    [
      "signup-1",
      "1",
      "<Alice>",
      "<1-1>",
      app.ROLES.general,
      "2026-04-01",
    ],
  ];
  spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups").__state.values = signupRows;
  spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups").__state.displayValues =
    signupDisplayRows;

  const event = app.getGridData(spreadsheets[EVENT_SHEET_ID]).events[0];
  const signup = event.signups[0];

  assert.deepEqual(Object.keys(signup).sort(), ["cls", "name", "role"]);
  assert.equal(signup.name, "\\u003cAlice\\u003e");
  assert.equal(signup.cls, "\\u003c1-1\\u003e");
  assert.ok(!("signupId" in signup));
  assert.ok(!("createdAt" in signup));
});

test("doGet payload does not include signup ids or timestamps", () => {
  const { app, spreadsheets } = loadBackend();
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    [
      "signup-1",
      1,
      "Alice",
      "1-1",
      app.ROLES.general,
      new Date("2026-04-01T00:00:00Z"),
    ],
  ];
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");
  signupsSheet.__state.values = signupRows;
  signupsSheet.__state.displayValues = signupRows.map((row) =>
    row.map((value) => String(value ?? "")),
  );

  const result = app.doGet({ parameter: { event: "Spring-Fete" } });
  const decodedGridData = JSON.parse(
    Buffer.from(result.gridData, "base64").toString("utf8"),
  );
  const signup = decodedGridData.events[0].signups[0];

  assert.equal(result.kind, "template");
  assert.deepEqual(Object.keys(signup).sort(), ["cls", "name", "role"]);
  assert.ok(!("signupId" in signup));
  assert.ok(!("createdAt" in signup));
});

test("doGet returns a safe error page when the signups sheet is missing", () => {
  const { app, logs } = loadBackend({
    extraSpreadsheets: {
      [EVENT_SHEET_ID]: createSpreadsheet("Spring Fete", {
        Events: createSheet(createEventRows()),
      }),
    },
  });

  const result = app.doGet({ parameter: { event: "Spring-Fete" } });

  assert.equal(result.kind, "html");
  assert.match(result.content, /Something went wrong/);
  assert.ok(logs.some((entry) => /Signups/.test(entry.message)));
});

test("doGet returns a safe error page when the event headers are invalid", () => {
  const eventRows = createEventRows();
  eventRows[0][0] = "WrongEventId";
  const { app, logs } = loadBackend({ eventRows });

  const result = app.doGet({ parameter: { event: "Spring-Fete" } });

  assert.equal(result.kind, "html");
  assert.match(result.content, /Something went wrong/);
  assert.ok(logs.some((entry) => /headers are invalid/.test(entry.message)));
});

test("submitSignup fails safely when existing signup rows are malformed", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", "", "Alice", "1-1", "not-a-role", new Date()],
  ];
  const { app, logs } = loadBackend({ signupRows });

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.ok(logs.some((entry) => /Signups/.test(entry.message)));
});

test("doGet returns a safe error page when an event row is malformed", () => {
  const eventRows = createEventRows();
  eventRows[1][8] = -1;
  const { app, logs } = loadBackend({ eventRows });

  const result = app.doGet({ parameter: { event: "Spring-Fete" } });

  assert.equal(result.kind, "html");
  assert.match(result.content, /Something went wrong/);
  assert.ok(logs.some((entry) => /general slot limit/.test(entry.message)));
});

test("doGet returns a safe error page when the config headers are invalid", () => {
  const configRows = [
    ["WrongAlias", "SheetId"],
    ["Spring-Fete", EVENT_SHEET_ID],
  ];
  const { app, logs } = loadBackend({ configRows });

  const result = app.doGet({ parameter: { event: "Spring-Fete" } });

  assert.equal(result.kind, "html");
  assert.match(result.content, /Something went wrong/);
  assert.ok(logs.some((entry) => /Config/.test(entry.message)));
});

test("submitSignup fails safely when the events sheet is missing", () => {
  const { app, logs, lock } = loadBackend({
    extraSpreadsheets: {
      [EVENT_SHEET_ID]: createSpreadsheet("Spring Fete", {
        Signups: createSheet([
          ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
        ]),
      }),
    },
  });

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(lock.released, true);
  assert.ok(logs.some((entry) => /Events/.test(entry.message)));
});

test("cancelSignup fails safely when the signups headers are invalid", () => {
  const signupRows = [
    ["WrongSignupId", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-1", "ä¸€èˆ¬ä¿è­·è€…", new Date()],
  ];
  const { app, logs, lock } = loadBackend({ signupRows });

  const result = app.cancelSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(lock.released, true);
  assert.ok(logs.some((entry) => /headers are invalid/.test(entry.message)));
});

test("getDeployedUrl returns the configured script URL", () => {
  const { app } = loadBackend();

  assert.equal(app.getDeployedUrl(), "https://example.com/app");
});
