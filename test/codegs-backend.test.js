const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAppsScriptFileNames,
  getAppsScriptSource,
  loadCodeGs,
} = require("../test-support/load-codegs");
const {
  createSheet,
  createSpreadsheet,
  createGasMocks,
} = require("../test-support/gas-mocks");

const EVENT_SHEET_ID = "eventsheetid1234567890";
const SECOND_EVENT_SHEET_ID = "secondsheetid1234567890";
const MASTER_SHEET_ID = "master-sheet-id";

function appRoleGeneral() {
  return "\u4E00\u822C\u4FDD\u8B77\u8005";
}

function createAdditionalEventRow({
  id = 2,
  activity = "Canteen",
  date = "2026-04-20T00:00:00Z",
  start = "1970-01-01T10:30:00Z",
  end = "1970-01-01T11:30:00Z",
} = {}) {
  return [
    id,
    activity,
    "Morning",
    new Date(date),
    new Date(start),
    new Date(end),
    "Serve snacks",
    "Hall",
    2,
    1,
    1,
    1,
  ];
}

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
      "GeneralSlots",
      "ClassRepSlots",
      "SteeringCommitteeSlots",
      "OrgCommitteeSlots",
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
      1,
    ],
  ];
}

function createConfigRows() {
  return [
    ["Alias", "SheetId", "Status"],
    ["Spring-Fete", EVENT_SHEET_ID, "OPEN"],
    ["bad", "short", "OPEN"],
  ];
}

function loadBackend(options = {}) {
  const {
    configRows = createConfigRows(),
    eventRows = createEventRows(),
    signupRows = [["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"]],
    signupDisplayRows = signupRows,
    activityLimitRows,
    eventSpreadsheetName = "Spring Fete",
    extraSpreadsheets = {},
    nowValue,
    cacheStore,
    propertyStore,
    lockWaitFails = false,
  } = options;

  const masterSpreadsheet = createSpreadsheet("Master", {
    Config: createSheet(configRows),
  });
  const eventSheets = {
    Events: createSheet(eventRows),
    Signups: createSheet(signupRows, signupDisplayRows),
  };
  if (activityLimitRows !== undefined) {
    eventSheets.ActivityLimits = createSheet(activityLimitRows);
  }
  const eventSpreadsheet = createSpreadsheet(eventSpreadsheetName, eventSheets);

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
    propertyStore,
    lockWaitFails,
  });

  const { exports: app, context } = loadCodeGs(
    [
      "ROLES",
      "doGet",
      "include_",
      "getGridData_",
      "getGridDataForAlias",
      "submitSignup",
      "cancelSignup",
      "checkRateLimit_",
      "getEventConfig_",
      "getEventSettings_",
      "sanitiseForScript_",
      "getCanonicalRole_",
      "normaliseWhitespace_",
      "normaliseAsciiDigits_",
      "normaliseClassValue_",
      "normaliseComparable_",
      "normaliseClassComparable_",
      "normaliseCompact_",
      "getDeployedUrl",
    ],
    mockEnv.globals,
  );

  return {
    app,
    spreadsheets,
    lock: mockEnv.lock,
    logs: mockEnv.logs,
    propertyStore: mockEnv.propertyStore,
    serviceCalls: mockEnv.serviceCalls,
    context,
  };
}

test("only intended backend entry points are browser-callable", () => {
  const source = getAppsScriptSource();
  const publicFunctions = [...source.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)]
    .map((match) => match[1])
    .filter((name) => !name.endsWith("_"))
    .sort();

  assert.deepEqual(publicFunctions, [
    "cancelSignup",
    "doGet",
    "getDeployedUrl",
    "getGridDataForAlias",
    "submitSignup",
  ]);
});

test("backend source loader includes every responsibility-focused script", () => {
  assert.deepEqual(getAppsScriptFileNames(), [
    "Code.gs",
    "Config.gs",
    "GridData.gs",
    "Normalisation.gs",
    "RateLimit.gs",
    "SignupService.gs",
    "SpreadsheetData.gs",
    "Validation.gs",
  ]);
});

test("include_ returns the requested static HTML partial", () => {
  const { app } = loadBackend();

  assert.equal(app.include_("Styles"), "<!-- included:Styles -->");
});

test("getEventConfig_ normalises aliases and filters invalid sheet IDs", () => {
  const { app } = loadBackend();
  const config = Object.fromEntries(Object.entries(app.getEventConfig_()));

  assert.deepEqual(config, {
    "spring-fete": EVENT_SHEET_ID,
  });
});

test("sanitiseForScript_ escapes script-sensitive characters", () => {
  const { app } = loadBackend();

  assert.equal(
    app.sanitiseForScript_(`<&>"'/\``),
    "\\u003c\\u0026\\u003e\\u0022\\u0027\\u002f\\u0060",
  );
});

test("getGridData_ uses display values for class text and computes role counts", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", new Date("2026-04-01T00:00:00Z"), "一般保護者", new Date()],
    ["s2", 1, "Bob", "2-1", "学年委員", new Date()],
    ["s3", 1, "Carol", "3-1", "\u5B9F\u884C\u59D4\u54E1", new Date()],
  ];
  const signupDisplayRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", "1", "Alice", "1-1", "一般保護者", "2026-04-01"],
    ["s2", "1", "Bob", "2-1", "学年委員", "2026-04-01"],
    ["s3", "1", "Carol", "3-1", "\u5B9F\u884C\u59D4\u54E1", "2026-04-01"],
  ];
  const { app, spreadsheets } = loadBackend({ signupRows, signupDisplayRows });

  const gridData = app.getGridData_(spreadsheets[EVENT_SHEET_ID]);
  const event = gridData.events[0];

  assert.equal(event.date, "20 Apr 2026");
  assert.equal(event.startTime, "09:30");
  assert.equal(event.signups[0].cls, "1-1");
  assert.equal(event.slots.general.filled, 1);
  assert.equal(event.slots.classRep.filled, 1);
  assert.equal(event.slots.steeringCommittee.max, 1);
  assert.equal(event.slots.steeringCommittee.filled, 0);
  assert.equal(event.slots.orgCommittee.max, 1);
  assert.equal(event.slots.orgCommittee.filled, 1);
  assert.equal(event.description, "Guide \\u003cparents\\u003e \\u0026 \\u0022students\\u0022");
});

test("getGridData_ keeps every role tied to its public slot and sheet column", () => {
  const eventRows = createEventRows();
  eventRows[1][8] = 2;
  eventRows[1][9] = 3;
  eventRows[1][10] = 4;
  eventRows[1][11] = 5;
  const { app, spreadsheets } = loadBackend({ eventRows });

  const event = app.getGridData_(spreadsheets[EVENT_SHEET_ID]).events[0];

  assert.equal(event.slots.general.max, 2);
  assert.equal(event.slots.classRep.max, 3);
  assert.equal(event.slots.steeringCommittee.max, 4);
  assert.equal(event.slots.orgCommittee.max, 5);
});

test("doGet returns rendered template output for a valid alias", () => {
  const { app } = loadBackend();

  const result = app.doGet({ parameter: { event: "Spring-Fete" } });
  const decodedTitle = Buffer.from(result.titleData, "base64").toString("utf8");
  const decodedAlias = Buffer.from(result.alias, "base64").toString("utf8");
  const decodedEventStatus = Buffer.from(result.eventStatus, "base64").toString(
    "utf8",
  );
  const decodedGridData = JSON.parse(
    Buffer.from(result.gridData, "base64").toString("utf8"),
  );

  assert.equal(result.kind, "template");
  assert.equal(result.title, "Spring Fete");
  assert.equal(decodedTitle, "Spring Fete");
  assert.equal(decodedAlias, "Spring-Fete");
  assert.equal(decodedEventStatus, "OPEN");
  assert.equal(decodedGridData.events[0].activity, "Hall Monitor");
});

test("doGet keeps an event viewable when Status fails closed", () => {
  const { app, logs } = loadBackend({
    configRows: [
      ["Alias", "SheetId"],
      ["Spring-Fete", EVENT_SHEET_ID],
    ],
  });

  const result = app.doGet({ parameter: { event: "Spring-Fete" } });
  const decodedEventStatus = Buffer.from(result.eventStatus, "base64").toString(
    "utf8",
  );

  assert.equal(result.kind, "template");
  assert.equal(decodedEventStatus, "READ_ONLY");
  assert.ok(logs.some((entry) => /Status header/.test(entry.message)));
});

test("doGet returns an error page when the alias is invalid", () => {
  const { app } = loadBackend();

  const result = app.doGet({ parameter: { event: "<bad>" } });

  assert.equal(result.kind, "html");
  assert.match(result.content, /Invalid event link/);
});

test("getGridDataForAlias returns fresh public grid data for a valid alias", () => {
  const { app } = loadBackend();

  const result = app.getGridDataForAlias("Spring-Fete");

  assert.equal(result.success, true);
  assert.equal(result.gridData.events[0].activity, "Hall Monitor");
  assert.equal(result.gridData.events[0].slots.general.filled, 0);
  assert.equal(result.eventStatus, "OPEN");
  assert.equal(result.title, "Spring Fete");
});

test("getGridDataForAlias rejects invalid aliases safely", () => {
  const { app } = loadBackend();

  const result = app.getGridDataForAlias("<bad>");

  assert.equal(result.success, false);
  assert.ok(!("gridData" in result));
});

test("checkRateLimit_ limits repeated person submissions and global event flooding", () => {
  const { app } = loadBackend({ cacheStore: new Map() });

  assert.equal(app.checkRateLimit_(1, "Alice", "1-1"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1"), false);

  const { app: eventFloodApp } = loadBackend({ cacheStore: new Map() });
  for (let i = 0; i < 20; i += 1) {
    assert.equal(eventFloodApp.checkRateLimit_(1, `User${i}`, `${i}`), true);
  }
  assert.equal(eventFloodApp.checkRateLimit_(1, "Overflow", "9"), false);
});

test("checkRateLimit_ keeps signup and cancel buckets isolated", () => {
  const cacheStore = new Map();
  const { app } = loadBackend({ cacheStore });

  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "signup"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "signup"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "signup"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "signup"), false);

  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "cancel"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "cancel"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "cancel"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "cancel"), false);
});

test("checkRateLimit_ keeps event sheet scopes isolated", () => {
  const cacheStore = new Map();
  const { app } = loadBackend({ cacheStore });

  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "signup", "sheet-a"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "signup", "sheet-a"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "signup", "sheet-a"), true);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "signup", "sheet-a"), false);
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1", "signup", "sheet-b"), true);

  const { app: eventFloodApp } = loadBackend({ cacheStore: new Map() });
  for (let i = 0; i < 20; i += 1) {
    assert.equal(
      eventFloodApp.checkRateLimit_(1, `User${i}`, `${i}`, "signup", "sheet-a"),
      true,
    );
  }
  assert.equal(
    eventFloodApp.checkRateLimit_(1, "Overflow", "9", "signup", "sheet-a"),
    false,
  );
  assert.equal(
    eventFloodApp.checkRateLimit_(1, "Overflow", "9", "signup", "sheet-b"),
    true,
  );
});

test("checkRateLimit_ limits global event flooding for cancellation attempts", () => {
  const { app } = loadBackend({ cacheStore: new Map() });

  for (let i = 0; i < 20; i += 1) {
    assert.equal(app.checkRateLimit_(1, `User${i}`, `${i}`, "cancel"), true);
  }
  assert.equal(app.checkRateLimit_(1, "Overflow", "9", "cancel"), false);
});

test("checkRateLimit_ durable event cap survives transient cache eviction", () => {
  const propertyStore = new Map();
  const { app } = loadBackend({ cacheStore: new Map(), propertyStore });

  for (let i = 0; i < 20; i += 1) {
    assert.equal(app.checkRateLimit_(1, `User${i}`, `${i}`), true);
  }

  const { app: freshApp } = loadBackend({
    cacheStore: new Map(),
    propertyStore,
  });
  assert.equal(freshApp.checkRateLimit_(1, "Overflow", "9"), false);
});

test("checkRateLimit_ resets durable event counters after the window", () => {
  const propertyStore = new Map();
  const { app } = loadBackend({
    cacheStore: new Map(),
    propertyStore,
    nowValue: "2026-04-19T00:00:00Z",
  });

  for (let i = 0; i < 20; i += 1) {
    assert.equal(app.checkRateLimit_(1, `User${i}`, `${i}`), true);
  }

  const { app: laterApp } = loadBackend({
    cacheStore: new Map(),
    propertyStore,
    nowValue: "2026-04-19T00:01:01Z",
  });
  assert.equal(laterApp.checkRateLimit_(1, "AfterWindow", "9"), true);
});

test("checkRateLimit_ uses complete normalised identity keys", () => {
  const { app } = loadBackend({ cacheStore: new Map() });

  for (let i = 0; i < 3; i += 1) {
    assert.equal(app.checkRateLimit_(1, "Alice", "1-1"), true);
    assert.equal(app.checkRateLimit_(1, "Alina", "1-1"), true);
  }
  assert.equal(app.checkRateLimit_(1, "Alice", "1-1"), false);
  assert.equal(app.checkRateLimit_(1, "Alina", "1-1"), false);
});

test("checkRateLimit_ fails closed when durable state cannot be written", () => {
  const propertyStore = {
    has() {
      return false;
    },
    get() {
      return undefined;
    },
    set() {
      throw new Error("Property write failed");
    },
  };
  const { app, logs } = loadBackend({ propertyStore });

  assert.equal(app.checkRateLimit_(1, "Alice", "1-1"), false);
  assert.ok(logs.some((entry) => /Persistent rate limiter error/.test(entry.message)));
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

test("submitSignup returns authoritative post-append role occupancy", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Bob", "1-2", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({ signupRows });

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, true);
  assert.equal(result.role, app.ROLES.general);
  assert.equal(result.filled, 2);
  assert.equal(result.max, 2);
});

test("submitSignup reads only schema columns and reuses one master spreadsheet handle", () => {
  const configRows = createConfigRows().map((row, index) =>
    row.concat([`config-extra-${index}`, "unused"]),
  );
  const eventRows = [
    ...createEventRows(),
    createAdditionalEventRow(),
  ].map((row, index) => row.concat([`event-extra-${index}`, "unused"]));
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Existing", "2-1", appRoleGeneral(), new Date()],
  ].map((row, index) => row.concat([`signup-extra-${index}`, "unused"]));
  const signupDisplayRows = signupRows.map((row) => row.map(String));
  const activityLimitRows = [
    ["Activity", "MaxPerPerson", "Unused", "UnusedToo"],
    ["Hall Monitor", 2, "ignored", "ignored"],
  ];
  const { app, spreadsheets, serviceCalls } = loadBackend({
    configRows,
    eventRows,
    signupRows,
    signupDisplayRows,
    activityLimitRows,
  });

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  const configCalls = spreadsheets[MASTER_SHEET_ID].getSheetByName("Config")
    .__state.calls;
  const eventCalls = spreadsheets[EVENT_SHEET_ID].getSheetByName("Events")
    .__state.calls;
  const signupCalls = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups")
    .__state.calls;
  const activityCalls = spreadsheets[EVENT_SHEET_ID].getSheetByName(
    "ActivityLimits",
  ).__state.calls;

  assert.equal(result.success, true);
  assert.equal(serviceCalls.spreadsheetOpenByIdById[MASTER_SHEET_ID], 1);
  assert.equal(serviceCalls.spreadsheetOpenByIdById[EVENT_SHEET_ID], 1);
  assert.deepEqual(
    configCalls.valueRanges.map(({ column, numRows, numColumns }) => ({
      column,
      numRows,
      numColumns,
    })),
    [
      { column: 1, numRows: configRows.length, numColumns: 3 },
      { column: 1, numRows: configRows.length, numColumns: 3 },
    ],
  );
  assert.deepEqual(
    eventCalls.valueRanges.map(({ column, numRows, numColumns }) => ({
      column,
      numRows,
      numColumns,
    })),
    [
      { column: 1, numRows: eventRows.length, numColumns: 12 },
      { column: 1, numRows: eventRows.length, numColumns: 12 },
    ],
  );
  assert.deepEqual(signupCalls.valueRanges, [
    {
      row: 1,
      column: 1,
      numRows: signupRows.length,
      numColumns: 6,
    },
  ]);
  assert.deepEqual(signupCalls.displayRanges, [
    {
      row: 1,
      column: 4,
      numRows: signupRows.length,
      numColumns: 1,
    },
  ]);
  assert.deepEqual(activityCalls.valueRanges, [
    {
      row: 1,
      column: 1,
      numRows: activityLimitRows.length,
      numColumns: 2,
    },
  ]);
  assert.equal(signupCalls.valueCellsRead, signupRows.length * 6);
  assert.equal(signupCalls.displayCellsRead, signupRows.length);
});

test("submitSignup rereads Config through the reused master handle before append", () => {
  const { app, spreadsheets, serviceCalls } = loadBackend();
  const configSheet = spreadsheets[MASTER_SHEET_ID].getSheetByName("Config");
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");
  configSheet.__state.onGetValues = ({ callNumber }) => {
    if (callNumber === 2) {
      configSheet.__state.values[1][2] = "READ_ONLY";
    }
  };

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(result.code, "event_read_only");
  assert.equal(signupsSheet.__state.values.length, 1);
  assert.equal(configSheet.__state.calls.getValues, 2);
  assert.equal(serviceCalls.spreadsheetOpenByIdById[MASTER_SHEET_ID], 1);
});

test("submitSignup rejects READ_ONLY events without appending a row", () => {
  const { app, spreadsheets, lock } = loadBackend({
    configRows: [
      ["Alias", "SheetId", "Status"],
      ["Spring-Fete", EVENT_SHEET_ID, "READ_ONLY"],
    ],
  });
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(result.code, "event_read_only");
  assert.equal(signupsSheet.getDataRange().getValues().length, 1);
  assert.equal(lock.waitCount, 0);
  assert.equal(lock.released, false);
});

test("submitSignup rejects malformed requests before waiting for the lock", () => {
  const invalidRequests = [
    ["1", "Alice", "1-1", appRoleGeneral(), "<bad>"],
    ["not-an-id", "Alice", "1-1", appRoleGeneral(), "spring-fete"],
    ["1", "Alice<", "1-1", appRoleGeneral(), "spring-fete"],
    ["1", "Alice", "1-1", "toString", "spring-fete"],
  ];

  invalidRequests.forEach((request) => {
    const { app, lock } = loadBackend({ lockWaitFails: true });
    const result = app.submitSignup(...request);

    assert.equal(result.success, false);
    assert.equal(lock.waitCount, 0);
    assert.equal(lock.released, false);
  });
});

test("submitSignup does not persist rate-limit keys for unknown EventIDs", () => {
  const propertyStore = new Map();
  const { app, lock } = loadBackend({ propertyStore });

  const result = app.submitSignup(
    "999",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.match(result.message, /イベントが見つかりません/);
  assert.equal(propertyStore.size, 0);
  assert.equal(lock.waitCount, 0);
  assert.equal(lock.released, false);
});

test("submitSignup isolates every role capacity to its matching Events column", () => {
  [
    ["general", 8],
    ["classRep", 9],
    ["steeringCommittee", 10],
    ["orgCommittee", 11],
  ].forEach(([roleKey, columnIndex]) => {
    const eventRows = createEventRows();
    eventRows[1].fill(0, 8, 12);
    eventRows[1][columnIndex] = 1;
    const { app, spreadsheets } = loadBackend({ eventRows });

    const result = app.submitSignup(
      "1",
      `Role ${roleKey}`,
      "1-1",
      app.ROLES[roleKey],
      "spring-fete",
    );

    assert.equal(result.success, true, roleKey);
    assert.equal(result.role, app.ROLES[roleKey]);
    const signupRows = spreadsheets[EVENT_SHEET_ID]
      .getSheetByName("Signups")
      .getDataRange()
      .getValues();
    assert.equal(signupRows[signupRows.length - 1][4], app.ROLES[roleKey]);

    const decoyRows = createEventRows();
    decoyRows[1].fill(0, 8, 12);
    decoyRows[1][columnIndex === 8 ? 9 : 8] = 1;
    const { app: decoyApp } = loadBackend({ eventRows: decoyRows });

    const decoyResult = decoyApp.submitSignup(
      "1",
      `Decoy ${roleKey}`,
      "1-1",
      decoyApp.ROLES[roleKey],
      "spring-fete",
    );

    assert.equal(decoyResult.success, false, roleKey);
  });
});

test("submitSignup does not release a lock that was not acquired", () => {
  const { app, lock } = loadBackend({ lockWaitFails: true });

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(lock.released, false);
  assert.equal(lock.releaseCount, 0);
});

test("submitSignup rate limits are isolated for aliases backed by different sheets", () => {
  const cacheStore = new Map();
  const secondSpreadsheet = createSpreadsheet("Summer Fete", {
    Events: createSheet(createEventRows()),
    Signups: createSheet([
      ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ]),
  });
  const { app } = loadBackend({
    cacheStore,
    configRows: [
      ["Alias", "SheetId", "Status"],
      ["Spring-Fete", EVENT_SHEET_ID, "OPEN"],
      ["Summer-Fete", SECOND_EVENT_SHEET_ID, "OPEN"],
    ],
    extraSpreadsheets: {
      [SECOND_EVENT_SHEET_ID]: secondSpreadsheet,
    },
  });

  assert.equal(
    app.submitSignup("1", "Alice", "1-1", app.ROLES.general, "spring-fete")
      .success,
    true,
  );
  const duplicateAttempt = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );
  const finalDuplicateAttempt = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );
  const rateLimitedAttempt = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(duplicateAttempt.success, false);
  assert.equal(finalDuplicateAttempt.message, duplicateAttempt.message);
  assert.equal(rateLimitedAttempt.success, false);
  assert.notEqual(rateLimitedAttempt.message, duplicateAttempt.message);

  assert.equal(
    app.submitSignup("1", "Alice", "1-1", app.ROLES.general, "summer-fete")
      .success,
    true,
  );
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

test("submitSignup removes spaces from Japanese names before storing", () => {
  const { app, spreadsheets } = loadBackend();
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.submitSignup(
    "1",
    "\u5C71\u7530\u3000\u592A\u90CE",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );
  const signupRows = signupsSheet.getDataRange().getValues();
  const appendedRow = signupRows[signupRows.length - 1];

  assert.equal(result.success, true);
  assert.equal(result.name, "\u5C71\u7530\u592A\u90CE");
  assert.equal(appendedRow[2], "\u5C71\u7530\u592A\u90CE");
});

test("submitSignup normalises full-width brackets in names before storing", () => {
  const { app, spreadsheets } = loadBackend();
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.submitSignup(
    "1",
    "\u5C71\u7530\uFF08\u592A\u90CE\uFF09",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );
  const signupRows = signupsSheet.getDataRange().getValues();
  const appendedRow = signupRows[signupRows.length - 1];

  assert.equal(result.success, true);
  assert.equal(result.name, "\u5C71\u7530(\u592A\u90CE)");
  assert.equal(appendedRow[2], "\u5C71\u7530(\u592A\u90CE)");
});

test("submitSignup treats full-width and half-width brackets as duplicate names", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "\u5C71\u7530(\u592A\u90CE)", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({ signupRows });

  const result = app.submitSignup(
    "1",
    "\u5C71\u7530\uFF08\u592A\u90CE\uFF09",
    "1-1",
    app.ROLES.classRep,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.match(result.message, /同じ名前/);
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

  const result = app.submitSignup(
    "1",
    " alice ",
    "1-2",
    app.ROLES.steeringCommittee,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.match(result.message, /同じ名前/);
});

test("submitSignup rejects the same person in an overlapping time slot", () => {
  const eventRows = createEventRows();
  eventRows.push(createAdditionalEventRow());
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({ eventRows, signupRows });

  const result = app.submitSignup("1", " alice ", "1-1", app.ROLES.general, "spring-fete");

  assert.equal(result.success, false);
  assert.equal(result.code, "time_conflict");
});

test("submitSignup rejects the same name in another class at the same time", () => {
  const eventRows = createEventRows();
  eventRows.push(createAdditionalEventRow());
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({ eventRows, signupRows });

  const result = app.submitSignup("1", "Alice", "1-2", app.ROLES.general, "spring-fete");

  assert.equal(result.success, false);
  assert.equal(result.code, "time_conflict");
});

test("submitSignup allows the same person in a back-to-back time slot", () => {
  const eventRows = createEventRows();
  eventRows.push(
    createAdditionalEventRow({
      start: "1970-01-01T11:00:00Z",
      end: "1970-01-01T11:30:00Z",
    }),
  );
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({ eventRows, signupRows });

  const result = app.submitSignup("1", "Alice", "1-1", app.ROLES.general, "spring-fete");

  assert.equal(result.success, true);
});

test("submitSignup allows the same person at the same time on a different date", () => {
  const eventRows = createEventRows();
  eventRows.push(
    createAdditionalEventRow({
      date: "2026-04-21T00:00:00Z",
      start: "1970-01-01T09:30:00Z",
      end: "1970-01-01T11:00:00Z",
    }),
  );
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({ eventRows, signupRows });

  const result = app.submitSignup("1", "Alice", "1-1", app.ROLES.general, "spring-fete");

  assert.equal(result.success, true);
});

test("submitSignup rejects overlapping same-person signup across roles", () => {
  const eventRows = createEventRows();
  eventRows.push(createAdditionalEventRow());
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({ eventRows, signupRows });

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.steeringCommittee,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(result.code, "time_conflict");
});

test("submitSignup treats a header-only ActivityLimits sheet as unrestricted", () => {
  const eventRows = createEventRows();
  eventRows.push(
    createAdditionalEventRow({
      activity: "Hall Monitor",
      start: "1970-01-01T11:00:00Z",
      end: "1970-01-01T12:00:00Z",
    }),
  );
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Bob", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({
    eventRows,
    signupRows,
    activityLimitRows: [["Activity", "MaxPerPerson"]],
  });

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, true);
});

test("submitSignup enforces an activity limit across separate time slots", () => {
  const eventRows = createEventRows();
  eventRows.push(
    createAdditionalEventRow({
      activity: "Hall\u3000Monitor",
      start: "1970-01-01T11:00:00Z",
      end: "1970-01-01T12:00:00Z",
    }),
  );
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "\uFF11\u2212\uFF11", appRoleGeneral(), new Date()],
  ];
  const { app, spreadsheets } = loadBackend({
    eventRows,
    signupRows,
    activityLimitRows: [["Activity", "MaxPerPerson"], [" Hall Monitor ", 1]],
  });
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.submitSignup(
    "1",
    " alice ",
    "1-1",
    app.ROLES.classRep,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(result.code, "activity_limit");
  assert.match(result.message, /1/);
  assert.equal(signupsSheet.getDataRange().getValues().length, 2);
});

test("submitSignup prioritises a reached activity limit over a time conflict", () => {
  const eventRows = createEventRows();
  eventRows.push(
    createAdditionalEventRow({
      activity: "Hall Monitor",
    }),
  );
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({
    eventRows,
    signupRows,
    activityLimitRows: [["Activity", "MaxPerPerson"], ["Hall Monitor", 1]],
  });

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-2",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(result.code, "activity_limit");
  assert.match(result.message, /Hall Monitor/);
  assert.doesNotMatch(result.message, /同じ時間帯/);
});

test("submitSignup keeps the time-conflict message below an unreached activity limit", () => {
  const eventRows = createEventRows();
  eventRows.push(
    createAdditionalEventRow({
      activity: "Hall Monitor",
    }),
  );
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({
    eventRows,
    signupRows,
    activityLimitRows: [["Activity", "MaxPerPerson"], ["Hall Monitor", 2]],
  });

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-2",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(result.code, "time_conflict");
  assert.match(result.message, /同じ時間帯/);
});

test("submitSignup honours numeric activity-limit boundaries", () => {
  const eventRows = createEventRows();
  eventRows.push(
    createAdditionalEventRow({
      activity: "Hall Monitor",
      start: "1970-01-01T11:00:00Z",
      end: "1970-01-01T12:00:00Z",
    }),
  );
  eventRows.push(
    createAdditionalEventRow({
      id: 3,
      activity: "Hall Monitor",
      start: "1970-01-01T12:00:00Z",
      end: "1970-01-01T13:00:00Z",
    }),
  );
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({
    eventRows,
    signupRows,
    activityLimitRows: [["Activity", "MaxPerPerson"], ["Hall Monitor", 2]],
  });

  const secondSignup = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );
  const thirdSignup = app.submitSignup(
    "3",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(secondSignup.success, true);
  assert.equal(thirdSignup.success, false);
  assert.equal(thirdSignup.code, "activity_limit");
});

test("submitSignup activity limits match the same name across different classes", () => {
  const eventRows = createEventRows();
  eventRows.push(
    createAdditionalEventRow({
      activity: "Hall Monitor",
      start: "1970-01-01T11:00:00Z",
      end: "1970-01-01T12:00:00Z",
    }),
  );
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({
    eventRows,
    signupRows,
    activityLimitRows: [["Activity", "MaxPerPerson"], ["Hall Monitor", 1]],
  });

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-2",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(result.code, "activity_limit");
});

test("submitSignup leaves unlisted activities unrestricted", () => {
  const eventRows = createEventRows();
  eventRows.push(
    createAdditionalEventRow({
      activity: "Canteen",
      start: "1970-01-01T11:00:00Z",
      end: "1970-01-01T12:00:00Z",
    }),
  );
  eventRows.push(
    createAdditionalEventRow({
      id: 3,
      activity: "Canteen",
      start: "1970-01-01T12:00:00Z",
      end: "1970-01-01T13:00:00Z",
    }),
  );
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({
    eventRows,
    signupRows,
    activityLimitRows: [["Activity", "MaxPerPerson"], ["Hall Monitor", 1]],
  });

  const result = app.submitSignup(
    "3",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, true);
});

test("cancelling a signup restores its activity-limit allowance", () => {
  const eventRows = createEventRows();
  eventRows.push(
    createAdditionalEventRow({
      activity: "Hall Monitor",
      start: "1970-01-01T11:00:00Z",
      end: "1970-01-01T12:00:00Z",
    }),
  );
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({
    eventRows,
    signupRows,
    activityLimitRows: [["Activity", "MaxPerPerson"], ["Hall Monitor", 1]],
  });

  const cancelResult = app.cancelSignup(
    "2",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );
  const signupResult = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(cancelResult.success, true);
  assert.equal(signupResult.success, true);
});

[
  {
    name: "unknown activities",
    rows: [["Activity", "MaxPerPerson"], ["Missing Activity", 1]],
    logPattern: /Unknown Activity/,
  },
  {
    name: "duplicate activities",
    rows: [
      ["Activity", "MaxPerPerson"],
      ["Hall Monitor", 1],
      [" Hall\u3000Monitor ", 1],
    ],
    logPattern: /Duplicate Activity/,
  },
  {
    name: "invalid limits",
    rows: [["Activity", "MaxPerPerson"], ["Hall Monitor", 1.5]],
    logPattern: /Invalid MaxPerPerson/,
  },
  {
    name: "invalid headers",
    rows: [["WrongActivity", "MaxPerPerson"], ["Hall Monitor", 1]],
    logPattern: /headers are invalid/,
  },
].forEach(({ name, rows, logPattern }) => {
  test(`submitSignup rejects ActivityLimits with ${name} without exposing details`, () => {
    const { app, logs, lock } = loadBackend({ activityLimitRows: rows });

    const result = app.submitSignup(
      "1",
      "Alice",
      "1-1",
      app.ROLES.general,
      "spring-fete",
    );

    assert.equal(result.success, false);
    assert.equal(result.code, "configuration_error");
    assert.doesNotMatch(result.message, /ActivityLimits|Missing Activity|MaxPerPerson/);
    assert.ok(logs.some((entry) => logPattern.test(entry.message)));
    assert.equal(lock.released, true);
  });
});

test("getEventSettings_ normalises supported status values", () => {
  const { app } = loadBackend({
    configRows: [
      ["Alias", "SheetId", "Status"],
      ["Spring-Fete", EVENT_SHEET_ID, " read_only "],
    ],
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(app.getEventSettings_()["spring-fete"])),
    {
      sheetId: EVENT_SHEET_ID,
      status: "READ_ONLY",
    },
  );
});

test("getEventSettings_ fails closed when Status is missing or invalid", () => {
  const missingStatusRows = [
    ["Alias", "SheetId"],
    ["Spring-Fete", EVENT_SHEET_ID],
  ];
  const {
    app: missingHeaderApp,
    logs: missingHeaderLogs,
    spreadsheets: missingHeaderSpreadsheets,
  } = loadBackend({ configRows: missingStatusRows });
  const { app: invalidStatusApp, logs: invalidStatusLogs } = loadBackend({
    configRows: [
      ["Alias", "SheetId", "Status"],
      ["Spring-Fete", EVENT_SHEET_ID, "UNKNOWN"],
    ],
  });

  assert.equal(
    missingHeaderApp.getEventSettings_()["spring-fete"].status,
    "READ_ONLY",
  );
  const missingStatusConfigSheet = missingHeaderSpreadsheets[
    MASTER_SHEET_ID
  ].getSheetByName("Config");
  assert.equal(missingStatusConfigSheet.__state.maxColumns, 2);
  assert.throws(
    () =>
      missingStatusConfigSheet.getRange(
        1,
        1,
        missingStatusRows.length,
        3,
      ),
    /columns are out of bounds/,
  );
  assert.deepEqual(missingStatusConfigSheet.__state.calls.valueRanges, [
    {
      row: 1,
      column: 1,
      numRows: missingStatusRows.length,
      numColumns: 2,
    },
  ]);
  assert.ok(missingHeaderLogs.some((entry) => /Status header/.test(entry.message)));
  assert.equal(
    invalidStatusApp.getEventSettings_()["spring-fete"].status,
    "READ_ONLY",
  );
  assert.ok(
    invalidStatusLogs.some((entry) => /Invalid or missing Status/.test(entry.message)),
  );
});

test("malformed ActivityLimits do not affect page rendering or cancellation", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app, spreadsheets } = loadBackend({
    signupRows,
    activityLimitRows: [
      ["Activity", "MaxPerPerson"],
      ["Hall Monitor", 1],
      ["Hall Monitor", 2],
    ],
  });
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const pageResult = app.doGet({ parameter: { event: "Spring-Fete" } });
  const cancelResult = app.cancelSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(pageResult.kind, "template");
  assert.equal(cancelResult.success, true);
  assert.deepEqual(signupsSheet.__state.deletedRows, [2]);
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
  assert.equal(result.code, "slot_full");
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

test("cancelSignup returns authoritative post-delete role occupancy", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-1", appRoleGeneral(), new Date()],
    ["s2", 1, "Bob", "1-2", appRoleGeneral(), new Date()],
    ["s3", 1, "Carol", "1-3", "学年委員", new Date()],
    ["s4", 2, "Dan", "1-4", appRoleGeneral(), new Date()],
  ];
  const { app, spreadsheets } = loadBackend({ signupRows });
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.cancelSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, true);
  assert.equal(result.message, "キャンセルされました。");
  assert.equal(result.role, app.ROLES.general);
  assert.equal(result.filled, 1);
  assert.deepEqual(signupsSheet.__state.deletedRows, [2]);
  assert.equal(signupsSheet.__state.calls.getValues, 1);
  assert.equal(signupsSheet.__state.calls.getDisplayValues, 1);
});

test("cancelSignup reuses one master handle but freshly rechecks Config before delete", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app, spreadsheets, serviceCalls } = loadBackend({ signupRows });
  const configSheet = spreadsheets[MASTER_SHEET_ID].getSheetByName("Config");
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");
  configSheet.__state.onGetValues = ({ callNumber }) => {
    if (callNumber === 2) {
      configSheet.__state.values[1][2] = "READ_ONLY";
    }
  };

  const result = app.cancelSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(result.code, "event_read_only");
  assert.deepEqual(signupsSheet.__state.deletedRows, []);
  assert.equal(configSheet.__state.calls.getValues, 2);
  assert.equal(serviceCalls.spreadsheetOpenByIdById[MASTER_SHEET_ID], 1);
});

test("cancelSignup normalises only rows matching the requested event and role", () => {
  const eventRows = [...createEventRows(), createAdditionalEventRow()];
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Other Event", "2-1", appRoleGeneral(), new Date()],
    ["s2", 1, "Other Role", "2-2", "学年委員", new Date()],
    ["s3", 1, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app, context, spreadsheets } = loadBackend({ eventRows, signupRows });
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");
  const originalNormaliseName = context.normaliseComparable_;
  const originalNormaliseClass = context.normaliseClassComparable_;
  let nameNormalisations = 0;
  let classNormalisations = 0;
  context.normaliseComparable_ = function (value) {
    nameNormalisations += 1;
    return originalNormaliseName(value);
  };
  context.normaliseClassComparable_ = function (value) {
    classNormalisations += 1;
    return originalNormaliseClass(value);
  };

  const result = app.cancelSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, true);
  assert.deepEqual(signupsSheet.__state.deletedRows, [4]);
  assert.equal(nameNormalisations, 2);
  assert.equal(classNormalisations, 2);
});

test("cancelSignup rejects READ_ONLY events without deleting a row", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app, spreadsheets, lock } = loadBackend({
    configRows: [
      ["Alias", "SheetId", "Status"],
      ["Spring-Fete", EVENT_SHEET_ID, "READ_ONLY"],
    ],
    signupRows,
  });
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.cancelSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(result.code, "event_read_only");
  assert.deepEqual(signupsSheet.__state.deletedRows, []);
  assert.equal(signupsSheet.getDataRange().getValues().length, 2);
  assert.equal(lock.waitCount, 0);
  assert.equal(lock.released, false);
});

test("cancelSignup rejects malformed requests before waiting for the lock", () => {
  const invalidRequests = [
    ["1", "Alice", "1-1", appRoleGeneral(), "<bad>"],
    ["not-an-id", "Alice", "1-1", appRoleGeneral(), "spring-fete"],
    ["1", "Alice<", "1-1", appRoleGeneral(), "spring-fete"],
    ["1", "Alice", "1-1", "constructor", "spring-fete"],
  ];

  invalidRequests.forEach((request) => {
    const { app, lock } = loadBackend({ lockWaitFails: true });
    const result = app.cancelSignup(...request);

    assert.equal(result.success, false);
    assert.equal(lock.waitCount, 0);
    assert.equal(lock.released, false);
  });
});

test("cancelSignup rejects unknown EventIDs before waiting for the lock", () => {
  const propertyStore = new Map();
  const { app, lock } = loadBackend({ propertyStore });

  const result = app.cancelSignup(
    "999",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.match(result.message, /イベントが見つかりません/);
  assert.equal(propertyStore.size, 0);
  assert.equal(lock.waitCount, 0);
  assert.equal(lock.released, false);
});

test("cancelSignup matches Japanese names with or without spaces", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "\u5C71\u7530\u592A\u90CE", "1-1", appRoleGeneral(), new Date()],
  ];
  const { app, spreadsheets } = loadBackend({ signupRows });
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.cancelSignup(
    "1",
    "\u5C71\u7530 \u592A\u90CE",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, true);
  assert.deepEqual(signupsSheet.__state.deletedRows, [2]);
});

test("cancelSignup does not release a lock that was not acquired", () => {
  const { app, lock } = loadBackend({ lockWaitFails: true });

  const result = app.cancelSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(lock.released, false);
  assert.equal(lock.releaseCount, 0);
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

test("getGridData_ exposes only public signup fields and sanitised values", () => {
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

  const event = app.getGridData_(spreadsheets[EVENT_SHEET_ID]).events[0];
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

test("schema-bounded signup reads still validate rows extended by trailing data", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["", "", "", "", "", "", "unexpected trailing value"],
  ];
  const { app, logs, spreadsheets } = loadBackend({ signupRows });
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, false);
  assert.equal(signupsSheet.__state.values.length, signupRows.length);
  assert.deepEqual(signupsSheet.__state.calls.valueRanges, [
    { row: 1, column: 1, numRows: signupRows.length, numColumns: 6 },
  ]);
  assert.deepEqual(signupsSheet.__state.calls.displayRanges, [
    { row: 1, column: 4, numRows: signupRows.length, numColumns: 1 },
  ]);
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
  assert.equal(lock.waitCount, 0);
  assert.equal(lock.released, false);
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
