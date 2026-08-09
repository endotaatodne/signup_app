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
    signupRows = [
      ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ],
    signupDisplayRows = signupRows,
    activityLimitRows,
    eventSpreadsheetName = "Spring Fete",
    extraSpreadsheets = {},
    nowValue,
    cacheStore,
    propertyStore,
    lockWaitFails = false,
    lockTryThrows = false,
    flushFails = false,
  } = options;

  const configSheet = createSheet(configRows);
  const masterSpreadsheet = createSpreadsheet("Master", {
    Config: configSheet,
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
    lockTryThrows,
    flushFails,
  });
  configSheet.__state.operationLabel = "Config";
  configSheet.__state.operationLog = mockEnv.serviceCalls.operations;
  Object.keys(eventSheets).forEach((sheetName) => {
    eventSheets[sheetName].__state.operationLabel = sheetName;
    eventSheets[sheetName].__state.operationLog = mockEnv.serviceCalls.operations;
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
      "RATE_LIMIT_PERSON_MAX_HITS",
      "RATE_LIMIT_PERSON_WINDOW_SECONDS",
      "RATE_LIMIT_EMERGENCY_ATTEMPT_MAX_HITS",
      "RATE_LIMIT_EMERGENCY_ATTEMPT_WINDOW_SECONDS",
      "RATE_LIMIT_EVENT_SUCCESS_MAX_HITS",
      "RATE_LIMIT_EVENT_SUCCESS_WINDOW_SECONDS",
      "checkEmergencyAttemptFuse_",
      "isPersonAttemptBlocked_",
      "checkPersonAttemptLimit_",
      "isEventSuccessLimitBlocked_",
      "consumeEventSuccessLimit_",
      "buildIdentityTupleHash_",
      "getEventConfig_",
      "getEventSettings_",
      "getCanonicalRole_",
      "normaliseWhitespace_",
      "normaliseAsciiDigits_",
      "normaliseClassValue_",
      "normaliseComparable_",
      "normaliseClassComparable_",
      "normaliseNameIdentityKey_",
      "normaliseClassIdentityKey_",
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
    cacheStore,
    serviceCalls: mockEnv.serviceCalls,
    context,
  };
}

function getDurableWriteBudgetEntries(propertyStore) {
  return [...propertyStore.entries()].filter(([key]) =>
    key.startsWith("signup_app_rate_limit_v3_success_"),
  );
}

test("only intended backend entry points are browser-callable", () => {
  const source = getAppsScriptSource();
  const publicFunctions = [
    ...source.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm),
  ]
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

test("getGridData_ uses display values for class text and computes role counts", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    [
      "s1",
      1,
      "Alice",
      new Date("2026-04-01T00:00:00Z"),
      "一般保護者",
      new Date(),
    ],
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
  assert.equal(event.description, 'Guide <parents> & "students"');
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

test("personal attempts allow the first three, block the fourth, and reset at 60 seconds", () => {
  const cacheStore = new Map();
  const { app } = loadBackend({ cacheStore });
  assert.equal(app.RATE_LIMIT_PERSON_MAX_HITS, 3);
  assert.equal(app.RATE_LIMIT_PERSON_WINDOW_SECONDS, 60);

  for (let i = 0; i < 3; i += 1) {
    assert.equal(
      app.checkPersonAttemptLimit_(1, "Alice", "1-A", "signup", "sheet-a"),
      true,
    );
  }

  assert.equal(
    app.isPersonAttemptBlocked_(1, "\uFF21lice", "1-\uFF21", "signup", "sheet-a"),
    true,
  );
  assert.equal(
    app.checkPersonAttemptLimit_(1, "\uFF21lice", "1-\uFF21", "signup", "sheet-a"),
    false,
  );
  assert.ok(
    [...cacheStore.keys()].every((key) => !key.includes("Alice") && !key.includes("1-A")),
  );

  const { app: almostResetApp } = loadBackend({
    cacheStore,
    nowValue: "2026-04-19T00:00:59.999Z",
  });
  assert.equal(
    almostResetApp.isPersonAttemptBlocked_(
      1,
      "Alice",
      "1-A",
      "signup",
      "sheet-a",
    ),
    true,
  );

  const { app: resetApp } = loadBackend({
    cacheStore,
    nowValue: "2026-04-19T00:01:00Z",
  });
  assert.equal(
    resetApp.isPersonAttemptBlocked_(1, "Alice", "1-A", "signup", "sheet-a"),
    false,
  );
  assert.equal(
    resetApp.checkPersonAttemptLimit_(1, "Alice", "1-A", "signup", "sheet-a"),
    true,
  );
});

test("personal attempt limits isolate action, event, sheet, and complete identity tuples", () => {
  const { app } = loadBackend({ cacheStore: new Map() });

  for (let i = 0; i < app.RATE_LIMIT_PERSON_MAX_HITS; i += 1) {
    assert.equal(app.checkPersonAttemptLimit_(1, "Alice", "1-A", "signup", "sheet-a"), true);
    assert.equal(app.checkPersonAttemptLimit_(1, "Alina", "1-A", "signup", "sheet-a"), true);
  }

  assert.equal(app.checkPersonAttemptLimit_(1, "Alice", "1-A", "signup", "sheet-a"), false);
  assert.equal(app.checkPersonAttemptLimit_(1, "Alina", "1-A", "signup", "sheet-a"), false);
  assert.equal(app.checkPersonAttemptLimit_(1, "Alice", "1-A", "cancel", "sheet-a"), true);
  assert.equal(app.checkPersonAttemptLimit_(2, "Alice", "1-A", "signup", "sheet-a"), true);
  assert.equal(app.checkPersonAttemptLimit_(1, "Alice", "1-A", "signup", "sheet-b"), true);
});

test("the emergency mutation-attempt fuse is high-threshold, short-window, and scoped", () => {
  const cacheStore = new Map();
  const { app } = loadBackend({ cacheStore });
  assert.equal(app.RATE_LIMIT_EMERGENCY_ATTEMPT_MAX_HITS, 100);
  assert.equal(app.RATE_LIMIT_EMERGENCY_ATTEMPT_WINDOW_SECONDS, 10);

  for (let i = 0; i < 100; i += 1) {
    assert.equal(app.checkEmergencyAttemptFuse_(1, "signup", "sheet-a"), true);
  }

  assert.equal(app.checkEmergencyAttemptFuse_(1, "signup", "sheet-a"), false);
  assert.equal(app.checkEmergencyAttemptFuse_(1, "cancel", "sheet-a"), true);
  assert.equal(app.checkEmergencyAttemptFuse_(2, "signup", "sheet-a"), true);
  assert.equal(app.checkEmergencyAttemptFuse_(1, "signup", "sheet-b"), true);

  const { app: almostResetApp } = loadBackend({
    cacheStore,
    nowValue: "2026-04-19T00:00:09.999Z",
  });
  assert.equal(
    almostResetApp.checkEmergencyAttemptFuse_(1, "signup", "sheet-a"),
    false,
  );

  const { app: resetApp } = loadBackend({
    cacheStore,
    nowValue: "2026-04-19T00:00:10Z",
  });
  assert.equal(resetApp.checkEmergencyAttemptFuse_(1, "signup", "sheet-a"), true);
});

test("malformed and future advisory counters restart instead of blocking", () => {
  const cacheStore = new Map();
  const initial = loadBackend({ cacheStore });
  assert.equal(
    initial.app.checkPersonAttemptLimit_(1, "Alice", "1-A", "signup", "sheet-a"),
    true,
  );
  const personKey = [...cacheStore.keys()].find((key) => key.includes("person_"));

  cacheStore.set(personKey, "not-json");
  const malformed = loadBackend({ cacheStore });
  assert.equal(
    malformed.app.checkPersonAttemptLimit_(1, "Alice", "1-A", "signup", "sheet-a"),
    true,
  );
  assert.equal(JSON.parse(cacheStore.get(personKey)).hits, 1);

  cacheStore.set(
    personKey,
    JSON.stringify({
      windowStart: new Date("2026-04-19T00:01:00Z").getTime(),
      hits: 999,
    }),
  );
  const future = loadBackend({ cacheStore });
  assert.equal(
    future.app.isPersonAttemptBlocked_(1, "Alice", "1-A", "signup", "sheet-a"),
    false,
  );
  assert.equal(
    future.app.checkPersonAttemptLimit_(1, "Alice", "1-A", "signup", "sheet-a"),
    true,
  );
  assert.equal(JSON.parse(cacheStore.get(personKey)).hits, 1);
});

test("advisory cache limiter failures fail open without exposing identity data", () => {
  const failingCacheStore = {
    has() {
      throw new Error("Cache unavailable");
    },
    get() {
      throw new Error("Cache unavailable");
    },
    set() {
      throw new Error("Cache unavailable");
    },
    delete() {
      throw new Error("Cache unavailable");
    },
  };
  const { app, logs } = loadBackend({ cacheStore: failingCacheStore });

  assert.equal(app.checkEmergencyAttemptFuse_(1, "signup", "sheet-a"), true);
  assert.equal(app.isPersonAttemptBlocked_(1, "Alice", "1-A", "signup", "sheet-a"), false);
  assert.equal(app.checkPersonAttemptLimit_(1, "Alice", "1-A", "signup", "sheet-a"), true);
  assert.ok(logs.some((entry) => /cache rate limiter/i.test(entry.message)));
});

test("durable validated-write budgets allow 20 admissions then publish denial", () => {
  const propertyStore = new Map();
  const { app } = loadBackend({ cacheStore: new Map(), propertyStore });
  assert.equal(app.RATE_LIMIT_EVENT_SUCCESS_MAX_HITS, 20);
  assert.equal(app.RATE_LIMIT_EVENT_SUCCESS_WINDOW_SECONDS, 60);

  for (let i = 0; i < 20; i += 1) {
    assert.equal(app.consumeEventSuccessLimit_(1, "signup", "sheet-a"), true);
  }

  assert.equal(app.isEventSuccessLimitBlocked_(1, "signup", "sheet-a"), true);
  assert.equal(app.consumeEventSuccessLimit_(1, "signup", "sheet-a"), false);
});

test("cached durable denial expires exactly with the original persistent window", () => {
  const cacheStore = new Map();
  const propertyStore = new Map();
  const initial = loadBackend({
    cacheStore,
    propertyStore,
    nowValue: "2026-04-19T00:00:00Z",
  });
  for (
    let i = 0;
    i < initial.app.RATE_LIMIT_EVENT_SUCCESS_MAX_HITS - 1;
    i += 1
  ) {
    initial.app.consumeEventSuccessLimit_(1, "signup", "sheet-a");
  }

  const boundary = loadBackend({
    cacheStore,
    propertyStore,
    nowValue: "2026-04-19T00:00:59.999Z",
  });
  assert.equal(boundary.app.consumeEventSuccessLimit_(1, "signup", "sheet-a"), true);
  const denialPut = boundary.serviceCalls.cachePutExpirations.find(({ key }) =>
    key.includes("success_blocked_"),
  );
  assert.equal(denialPut.expirationInSeconds, 1);
  assert.equal(boundary.app.isEventSuccessLimitBlocked_(1, "signup", "sheet-a"), true);

  const expired = loadBackend({
    cacheStore,
    propertyStore,
    nowValue: "2026-04-19T00:01:00Z",
  });
  assert.equal(expired.app.isEventSuccessLimitBlocked_(1, "signup", "sheet-a"), false);
  assert.equal(expired.serviceCalls.cacheRemove, 1);
});

test("durable validated-write denial survives cache eviction and remains scoped", () => {
  const propertyStore = new Map();
  const { app } = loadBackend({ cacheStore: new Map(), propertyStore });
  for (let i = 0; i < app.RATE_LIMIT_EVENT_SUCCESS_MAX_HITS; i += 1) {
    assert.equal(app.consumeEventSuccessLimit_(1, "signup", "sheet-a"), true);
  }

  const { app: freshApp } = loadBackend({ cacheStore: new Map(), propertyStore });
  assert.equal(freshApp.isEventSuccessLimitBlocked_(1, "signup", "sheet-a"), false);
  assert.equal(freshApp.consumeEventSuccessLimit_(1, "signup", "sheet-a"), false);
  assert.equal(freshApp.consumeEventSuccessLimit_(1, "cancel", "sheet-a"), true);
  assert.equal(freshApp.consumeEventSuccessLimit_(2, "signup", "sheet-a"), true);
  assert.equal(freshApp.consumeEventSuccessLimit_(1, "signup", "sheet-b"), true);
});

test("durable validated-write budgets reset after their window", () => {
  const propertyStore = new Map();
  const { app } = loadBackend({
    cacheStore: new Map(),
    propertyStore,
    nowValue: "2026-04-19T00:00:00Z",
  });
  for (let i = 0; i < app.RATE_LIMIT_EVENT_SUCCESS_MAX_HITS; i += 1) {
    assert.equal(app.consumeEventSuccessLimit_(1, "signup", "sheet-a"), true);
  }

  const { app: almostResetApp } = loadBackend({
    cacheStore: new Map(),
    propertyStore,
    nowValue: "2026-04-19T00:00:59.999Z",
  });
  assert.equal(
    almostResetApp.consumeEventSuccessLimit_(1, "signup", "sheet-a"),
    false,
  );

  const { app: resetApp } = loadBackend({
    cacheStore: new Map(),
    propertyStore,
    nowValue: "2026-04-19T00:01:00Z",
  });
  assert.equal(resetApp.consumeEventSuccessLimit_(1, "signup", "sheet-a"), true);
});

test("durable validated-write budgets fail closed when state cannot be written", () => {
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

  assert.equal(app.consumeEventSuccessLimit_(1, "signup", "sheet-a"), false);
  assert.ok(
    logs.some((entry) => /Persistent rate limiter error/.test(entry.message)),
  );
});

test("legacy v2 properties are ignored by the v3 validated-write budget", () => {
  const legacyKey = "signup_app_rate_limit_v2_signup_sheet-a_1";
  const legacyValue = JSON.stringify({
    windowStart: new Date("2026-04-19T00:00:00Z").getTime(),
    hits: 999,
  });
  const propertyStore = new Map([[legacyKey, legacyValue]]);
  const { app, serviceCalls } = loadBackend({ propertyStore });

  assert.equal(app.consumeEventSuccessLimit_(1, "signup", "sheet-a"), true);
  assert.equal(serviceCalls.propertyGetPropertyByKey[legacyKey] || 0, 0);
  assert.equal(propertyStore.get(legacyKey), legacyValue);
  assert.equal(getDurableWriteBudgetEntries(propertyStore).length, 1);
  assert.equal(
    JSON.parse(getDurableWriteBudgetEntries(propertyStore)[0][1]).hits,
    1,
  );
});

test("malformed and future persistent v3 state starts a fresh budget window", () => {
  const propertyStore = new Map();
  const initial = loadBackend({ propertyStore });
  assert.equal(initial.app.consumeEventSuccessLimit_(1, "signup", "sheet-a"), true);
  const propertyKey = getDurableWriteBudgetEntries(propertyStore)[0][0];

  propertyStore.set(propertyKey, "not-json");
  const malformed = loadBackend({ propertyStore });
  assert.equal(malformed.app.consumeEventSuccessLimit_(1, "signup", "sheet-a"), true);
  assert.equal(JSON.parse(propertyStore.get(propertyKey)).hits, 1);
  assert.ok(
    malformed.logs.some((entry) => /Invalid persistent rate-limit state/.test(entry.message)),
  );

  propertyStore.set(
    propertyKey,
    JSON.stringify({
      windowStart: new Date("2026-04-19T00:01:00Z").getTime(),
      hits: 999,
    }),
  );
  const future = loadBackend({ propertyStore });
  assert.equal(future.app.consumeEventSuccessLimit_(1, "signup", "sheet-a"), true);
  assert.equal(JSON.parse(propertyStore.get(propertyKey)).hits, 1);
});

test("malformed cached durable denials are removed and fail open to durable state", () => {
  const cacheStore = new Map();
  const propertyStore = new Map();
  const seeded = loadBackend({ cacheStore, propertyStore });
  for (let i = 0; i < seeded.app.RATE_LIMIT_EVENT_SUCCESS_MAX_HITS; i += 1) {
    seeded.app.consumeEventSuccessLimit_(1, "signup", "sheet-a");
  }
  const denialKey = [...cacheStore.keys()].find((key) =>
    key.includes("success_blocked_"),
  );
  cacheStore.set(denialKey, "not-json");

  const malformed = loadBackend({ cacheStore, propertyStore });
  assert.equal(malformed.app.isEventSuccessLimitBlocked_(1, "signup", "sheet-a"), false);
  assert.equal(cacheStore.has(denialKey), false);
  assert.equal(malformed.app.consumeEventSuccessLimit_(1, "signup", "sheet-a"), false);
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
  const eventRows = [...createEventRows(), createAdditionalEventRow()].map(
    (row, index) => row.concat([`event-extra-${index}`, "unused"]),
  );
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

  const configCalls =
    spreadsheets[MASTER_SHEET_ID].getSheetByName("Config").__state.calls;
  const eventCalls =
    spreadsheets[EVENT_SHEET_ID].getSheetByName("Events").__state.calls;
  const signupCalls =
    spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups").__state.calls;
  const activityCalls =
    spreadsheets[EVENT_SHEET_ID].getSheetByName("ActivityLimits").__state.calls;

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
  assert.equal(lock.tryCount, 0);
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
    assert.equal(lock.tryCount, 0);
    assert.equal(lock.released, false);
  });
});

test("submitSignup does not persist rate-limit keys for unknown EventIDs", () => {
  const propertyStore = new Map();
  const cacheStore = new Map();
  const { app, lock } = loadBackend({ propertyStore, cacheStore });

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
  assert.equal(cacheStore.size, 0);
  assert.equal(lock.tryCount, 0);
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
    const signupRows = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups")
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
    [
      "s1",
      1,
      "\u5C71\u7530(\u592A\u90CE)",
      "1-1",
      appRoleGeneral(),
      new Date(),
    ],
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

  const result = app.submitSignup(
    "1",
    " alice ",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

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

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-2",
    app.ROLES.general,
    "spring-fete",
  );

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

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

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

  const result = app.submitSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

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
    activityLimitRows: [
      ["Activity", "MaxPerPerson"],
      [" Hall Monitor ", 1],
    ],
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
    activityLimitRows: [
      ["Activity", "MaxPerPerson"],
      ["Hall Monitor", 1],
    ],
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
    activityLimitRows: [
      ["Activity", "MaxPerPerson"],
      ["Hall Monitor", 2],
    ],
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
    activityLimitRows: [
      ["Activity", "MaxPerPerson"],
      ["Hall Monitor", 2],
    ],
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
    activityLimitRows: [
      ["Activity", "MaxPerPerson"],
      ["Hall Monitor", 1],
    ],
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
    activityLimitRows: [
      ["Activity", "MaxPerPerson"],
      ["Hall Monitor", 1],
    ],
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
    activityLimitRows: [
      ["Activity", "MaxPerPerson"],
      ["Hall Monitor", 1],
    ],
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
    rows: [
      ["Activity", "MaxPerPerson"],
      ["Missing Activity", 1],
    ],
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
    rows: [
      ["Activity", "MaxPerPerson"],
      ["Hall Monitor", 1.5],
    ],
    logPattern: /Invalid MaxPerPerson/,
  },
  {
    name: "invalid headers",
    rows: [
      ["WrongActivity", "MaxPerPerson"],
      ["Hall Monitor", 1],
    ],
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
    assert.doesNotMatch(
      result.message,
      /ActivityLimits|Missing Activity|MaxPerPerson/,
    );
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
  const missingStatusConfigSheet =
    missingHeaderSpreadsheets[MASTER_SHEET_ID].getSheetByName("Config");
  assert.equal(missingStatusConfigSheet.__state.maxColumns, 2);
  assert.throws(
    () => missingStatusConfigSheet.getRange(1, 1, missingStatusRows.length, 3),
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
  assert.ok(
    missingHeaderLogs.some((entry) => /Status header/.test(entry.message)),
  );
  assert.equal(
    invalidStatusApp.getEventSettings_()["spring-fete"].status,
    "READ_ONLY",
  );
  assert.ok(
    invalidStatusLogs.some((entry) =>
      /Invalid or missing Status/.test(entry.message),
    ),
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

  const result = app.submitSignup(
    "1",
    "Carol",
    "1-3",
    app.ROLES.general,
    "spring-fete",
  );

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
  const { app, spreadsheets, lock } = loadBackend({
    signupRows,
    signupDisplayRows,
  });
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  const result = app.cancelSignup(
    "1",
    " Alice ",
    "4-1",
    app.ROLES.general,
    "spring-fete",
  );

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
  assert.equal(result.message, "登録がキャンセルされました。");
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
  [
    "normaliseNameValue_",
    "normaliseComparable_",
    "normaliseNameIdentityKey_",
  ].forEach((functionName) => {
    const original = context[functionName];
    context[functionName] = function (value) {
      assert.notEqual(value, "Other Event");
      assert.notEqual(value, "Other Role");
      return original(value);
    };
  });

  const result = app.cancelSignup(
    "1",
    "Alice",
    "1-1",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, true);
  assert.deepEqual(signupsSheet.__state.deletedRows, [4]);
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
  assert.equal(lock.tryCount, 0);
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
    assert.equal(lock.tryCount, 0);
    assert.equal(lock.released, false);
  });
});

test("cancelSignup rejects unknown EventIDs before waiting for the lock", () => {
  const propertyStore = new Map();
  const cacheStore = new Map();
  const { app, lock } = loadBackend({ propertyStore, cacheStore });

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
  assert.equal(cacheStore.size, 0);
  assert.equal(lock.tryCount, 0);
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

  const result = app.cancelSignup(
    "1",
    "Alice",
    "1-1",
    "general",
    "spring-fete",
  );

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

test("getGridData_ exposes only public signup fields and exact sheet text", () => {
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
    ["signup-1", "1", "<Alice>", "<1-1>", app.ROLES.general, "2026-04-01"],
  ];
  spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups").__state.values =
    signupRows;
  spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups").__state.displayValues =
    signupDisplayRows;

  const event = app.getGridData_(spreadsheets[EVENT_SHEET_ID]).events[0];
  const signup = event.signups[0];

  assert.deepEqual(Object.keys(signup).sort(), ["cls", "name", "role"]);
  assert.equal(signup.name, "<Alice>");
  assert.equal(signup.cls, "<1-1>");
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
  assert.equal(lock.tryCount, 0);
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

test("MASTER_SHEET_ID is lazy and memoised within a valid execution", () => {
  const invalid = loadBackend();

  assert.equal(
    invalid.app.submitSignup(
      "1",
      "Alice",
      "1-A",
      invalid.app.ROLES.general,
      "<bad>",
    ).success,
    false,
  );
  assert.equal(
    invalid.serviceCalls.propertyGetPropertyByKey.MASTER_SHEET_ID || 0,
    0,
  );

  const valid = loadBackend();
  assert.equal(
    valid.app.submitSignup(
      "1",
      "Alice",
      "1-A",
      valid.app.ROLES.general,
      "spring-fete",
    ).success,
    true,
  );
  assert.equal(valid.serviceCalls.propertyGetPropertyByKey.MASTER_SHEET_ID, 1);
});

test("busy mutation attempts consume only the pre-lock emergency fuse", () => {
  ["signup", "cancel"].forEach((action) => {
    const cacheStore = new Map();
    const propertyStore = new Map();
    const { app, spreadsheets, lock, serviceCalls } = loadBackend({
      cacheStore,
      propertyStore,
      lockWaitFails: true,
    });
    const result =
      action === "signup"
        ? app.submitSignup(
            "1",
            "Alice",
            "1-A",
            app.ROLES.general,
            "spring-fete",
          )
        : app.cancelSignup(
            "1",
            "Alice",
            "1-A",
            app.ROLES.general,
            "spring-fete",
          );
    const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

    assert.deepEqual(
      { success: result.success, code: result.code },
      { success: false, code: "busy_retryable" },
      action,
    );
    assert.equal(lock.tryCount, 1, action);
    assert.deepEqual(lock.tryTimeouts, [250], action);
    assert.equal(lock.releaseCount, 0, action);
    assert.equal(signupsSheet.__state.calls.getValues, 0, action);
    assert.equal(signupsSheet.__state.calls.getDisplayValues, 0, action);
    assert.equal(signupsSheet.__state.values.length, 1, action);
    assert.equal(serviceCalls.propertySetProperty, 0, action);
    assert.equal(serviceCalls.spreadsheetFlush, 0, action);
    assert.deepEqual(getDurableWriteBudgetEntries(propertyStore), [], action);
    assert.equal(
      [...cacheStore.keys()].filter((key) => key.includes("person_")).length,
      0,
      action,
    );
    assert.equal(
      [...cacheStore.keys()].filter((key) => key.includes("emergency_")).length,
      1,
      action,
    );
  });
});

test("lock service exceptions are generic and never client-retryable", () => {
  ["signup", "cancel"].forEach((action) => {
    const cacheStore = new Map();
    const propertyStore = new Map();
    const { app, spreadsheets, lock, logs, serviceCalls } = loadBackend({
      cacheStore,
      propertyStore,
      lockTryThrows: true,
    });
    const result =
      action === "signup"
        ? app.submitSignup(
            "1",
            "Alice",
            "1-A",
            app.ROLES.general,
            "spring-fete",
          )
        : app.cancelSignup(
            "1",
            "Alice",
            "1-A",
            app.ROLES.general,
            "spring-fete",
          );
    const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

    assert.equal(result.success, false, action);
    assert.equal(result.code, undefined, action);
    assert.equal(lock.tryCount, 1, action);
    assert.equal(lock.releaseCount, 0, action);
    assert.equal(signupsSheet.__state.calls.getValues, 0, action);
    assert.equal(signupsSheet.__state.calls.getDisplayValues, 0, action);
    assert.equal(signupsSheet.__state.values.length, 1, action);
    assert.equal(serviceCalls.propertySetProperty, 0, action);
    assert.equal(serviceCalls.spreadsheetFlush, 0, action);
    assert.deepEqual(getDurableWriteBudgetEntries(propertyStore), [], action);
    assert.equal(
      [...cacheStore.keys()].filter((key) => key.includes("person_")).length,
      0,
      action,
    );
    assert.equal(
      [...cacheStore.keys()].filter((key) => key.includes("emergency_")).length,
      1,
      action,
    );
    assert.ok(
      logs.some((entry) => /Lock service failed/.test(entry.message)),
      action,
    );
  });
});

test("successful mutations keep policy, admission, write, flush, and release ordered", () => {
  ["signup", "cancel"].forEach((action) => {
    const signupRows =
      action === "cancel"
        ? [
            ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
            ["s1", 1, "Alice", "1-A", appRoleGeneral(), new Date()],
          ]
        : undefined;
    const { app, serviceCalls } = loadBackend({ signupRows });
    const result =
      action === "signup"
        ? app.submitSignup(
            "1",
            "Alice",
            "1-A",
            app.ROLES.general,
            "spring-fete",
          )
        : app.cancelSignup(
            "1",
            "Alice",
            "1-A",
            app.ROLES.general,
            "spring-fete",
          );
    const operations = serviceCalls.operations;
    const configIndex = operations.lastIndexOf("Config.getValues");
    const persistentGetIndex = operations.findIndex((operation) =>
      operation.startsWith("properties.get:signup_app_rate_limit_v3_success_"),
    );
    const persistentSetIndex = operations.findIndex((operation) =>
      operation.startsWith("properties.set:signup_app_rate_limit_v3_success_"),
    );
    const mutationIndex = operations.indexOf(
      action === "signup" ? "Signups.appendRow" : "Signups.deleteRow",
    );
    const flushIndex = operations.indexOf("spreadsheet.flush");
    const releaseIndex = operations.indexOf("lock.releaseLock");

    assert.equal(result.success, true, action);
    assert.ok(configIndex < persistentGetIndex, action);
    assert.ok(persistentGetIndex < persistentSetIndex, action);
    assert.ok(persistentSetIndex < mutationIndex, action);
    assert.equal(mutationIndex, persistentSetIndex + 1, action);
    assert.ok(mutationIndex < flushIndex, action);
    assert.ok(flushIndex < releaseIndex, action);
  });
});

test("flush failures are generic and never marked retryable after mutation", () => {
  ["signup", "cancel"].forEach((action) => {
    const signupRows =
      action === "cancel"
        ? [
            ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
            ["s1", 1, "Alice", "1-A", appRoleGeneral(), new Date()],
          ]
        : undefined;
    const { app, spreadsheets, lock, propertyStore, serviceCalls } = loadBackend({
      signupRows,
      flushFails: true,
    });
    const result =
      action === "signup"
        ? app.submitSignup(
            "1",
            "Alice",
            "1-A",
            app.ROLES.general,
            "spring-fete",
          )
        : app.cancelSignup(
            "1",
            "Alice",
            "1-A",
            app.ROLES.general,
            "spring-fete",
          );
    const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

    assert.equal(result.success, false, action);
    assert.notEqual(result.code, "busy_retryable", action);
    assert.equal(lock.releaseCount, 1, action);
    assert.equal(serviceCalls.spreadsheetFlush, 1, action);
    assert.equal(getDurableWriteBudgetEntries(propertyStore).length, 1, action);
    assert.equal(
      signupsSheet.__state.values.length,
      action === "signup" ? 2 : 1,
      action,
    );
  });
});

test("cached durable denial avoids lock and the expensive signup snapshot", () => {
  const cacheStore = new Map();
  const propertyStore = new Map();
  const seeded = loadBackend({ cacheStore, propertyStore });
  for (let i = 0; i < seeded.app.RATE_LIMIT_EVENT_SUCCESS_MAX_HITS; i += 1) {
    assert.equal(
      seeded.app.consumeEventSuccessLimit_(1, "signup", EVENT_SHEET_ID),
      true,
    );
  }

  const { app, spreadsheets, lock, serviceCalls } = loadBackend({
    cacheStore,
    propertyStore,
  });
  const result = app.submitSignup(
    "1",
    "Alice",
    "1-A",
    app.ROLES.general,
    "spring-fete",
  );
  const eventsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Events");
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  assert.equal(result.success, false);
  assert.equal(lock.tryCount, 0);
  assert.equal(eventsSheet.__state.calls.getValues, 1);
  assert.equal(signupsSheet.__state.calls.getValues, 0);
  assert.equal(serviceCalls.spreadsheetFlush, 0);
  assert.equal(
    [...cacheStore.keys()].filter((key) => key.includes("emergency_")).length,
    0,
  );
});

test("past events keep their rejection precedence over cached limiter denials", () => {
  const eventRows = createEventRows();
  eventRows[1][3] = new Date("2026-04-18T00:00:00Z");
  const baseline = loadBackend({ eventRows });
  const endedResult = baseline.app.submitSignup(
    "1",
    "Alice",
    "1-A",
    baseline.app.ROLES.general,
    "spring-fete",
  );

  ["personal", "durable"].forEach((blockedLayer) => {
    const cacheStore = new Map();
    const propertyStore = new Map();
    const seeded = loadBackend({ cacheStore, propertyStore, eventRows });
    if (blockedLayer === "personal") {
      for (let i = 0; i < seeded.app.RATE_LIMIT_PERSON_MAX_HITS; i += 1) {
        seeded.app.checkPersonAttemptLimit_(
          1,
          "Alice",
          "1-A",
          "signup",
          EVENT_SHEET_ID,
        );
      }
    } else {
      for (
        let i = 0;
        i < seeded.app.RATE_LIMIT_EVENT_SUCCESS_MAX_HITS;
        i += 1
      ) {
        seeded.app.consumeEventSuccessLimit_(1, "signup", EVENT_SHEET_ID);
      }
    }

    const blocked = loadBackend({ cacheStore, propertyStore, eventRows });
    const result = blocked.app.submitSignup(
      "1",
      "Alice",
      "1-A",
      blocked.app.ROLES.general,
      "spring-fete",
    );

    assert.equal(result.message, endedResult.message, blockedLayer);
    assert.equal(blocked.serviceCalls.cacheGet, 0, blockedLayer);
    assert.equal(blocked.lock.tryCount, 0, blockedLayer);
    assert.equal(
      [...cacheStore.keys()].filter((key) => key.includes("emergency_")).length,
      0,
      blockedLayer,
    );
  });
});

test("durable denial survives cache eviction and is enforced at write admission", () => {
  const propertyStore = new Map();
  const seeded = loadBackend({ cacheStore: new Map(), propertyStore });
  for (let i = 0; i < seeded.app.RATE_LIMIT_EVENT_SUCCESS_MAX_HITS; i += 1) {
    seeded.app.consumeEventSuccessLimit_(1, "signup", EVENT_SHEET_ID);
  }

  const { app, spreadsheets, lock } = loadBackend({
    cacheStore: new Map(),
    propertyStore,
  });
  const result = app.submitSignup(
    "1",
    "Alice",
    "1-A",
    app.ROLES.general,
    "spring-fete",
  );
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  assert.equal(result.success, false);
  assert.equal(lock.tryCount, 1);
  assert.equal(lock.releaseCount, 1);
  assert.equal(signupsSheet.__state.calls.getValues, 1);
  assert.equal(signupsSheet.__state.values.length, 1);
  assert.equal(
    JSON.parse(getDurableWriteBudgetEntries(propertyStore)[0][1]).hits,
    seeded.app.RATE_LIMIT_EVENT_SUCCESS_MAX_HITS,
  );
});

test("stale cached durable denials are removed and do not extend the fixed window", () => {
  const cacheStore = new Map();
  const propertyStore = new Map();
  const seeded = loadBackend({
    cacheStore,
    propertyStore,
    nowValue: "2026-04-18T00:00:00Z",
  });
  for (let i = 0; i < seeded.app.RATE_LIMIT_EVENT_SUCCESS_MAX_HITS; i += 1) {
    seeded.app.consumeEventSuccessLimit_(1, "signup", EVENT_SHEET_ID);
  }

  const later = loadBackend({
    cacheStore,
    propertyStore,
    nowValue: "2026-04-19T00:00:00Z",
  });
  const result = later.app.submitSignup(
    "1",
    "Alice",
    "1-A",
    later.app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, true);
  assert.ok(later.serviceCalls.cacheRemove >= 1);
  assert.equal(later.lock.tryCount, 1);
});

test("business and policy rejections never consume durable write budget", () => {
  const duplicateRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-A", appRoleGeneral(), new Date()],
  ];
  const slotRows = createEventRows();
  slotRows[1][8] = 1;
  const activityRows = [
    ...createEventRows(),
    createAdditionalEventRow({
      activity: "Hall Monitor",
      start: "1970-01-01T12:00:00Z",
      end: "1970-01-01T13:00:00Z",
    }),
  ];
  const overlapRows = [
    ...createEventRows(),
    createAdditionalEventRow({
      start: "1970-01-01T10:00:00Z",
      end: "1970-01-01T10:30:00Z",
    }),
  ];
  const otherEventSignup = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Alice", "1-A", appRoleGeneral(), new Date()],
  ];
  const ambiguousEvents = createEventRows();
  ambiguousEvents[1][8] = 3;
  const ambiguousRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-A", appRoleGeneral(), new Date()],
    ["s2", 1, "Alice", "1-A", appRoleGeneral(), new Date()],
  ];
  const scenarios = [
    {
      label: "duplicate",
      options: { signupRows: duplicateRows },
      invoke(app) {
        return app.submitSignup("1", "Alice", "2-A", app.ROLES.general, "spring-fete");
      },
    },
    {
      label: "slot full",
      options: { eventRows: slotRows, signupRows: duplicateRows },
      invoke(app) {
        return app.submitSignup("1", "Bob", "2-A", app.ROLES.general, "spring-fete");
      },
    },
    {
      label: "activity limit",
      options: {
        eventRows: activityRows,
        signupRows: otherEventSignup,
        activityLimitRows: [["Activity", "MaxPerPerson"], ["Hall Monitor", 1]],
      },
      invoke(app) {
        return app.submitSignup("1", "Alice", "2-A", app.ROLES.general, "spring-fete");
      },
    },
    {
      label: "time conflict",
      options: { eventRows: overlapRows, signupRows: otherEventSignup },
      invoke(app) {
        return app.submitSignup("1", "Alice", "2-A", app.ROLES.general, "spring-fete");
      },
    },
    {
      label: "cancel no match",
      options: {},
      invoke(app) {
        return app.cancelSignup("1", "Alice", "1-A", app.ROLES.general, "spring-fete");
      },
    },
    {
      label: "cancel ambiguity",
      options: { eventRows: ambiguousEvents, signupRows: ambiguousRows },
      invoke(app) {
        return app.cancelSignup("1", "Alice", "1-A", app.ROLES.general, "spring-fete");
      },
    },
    {
      label: "activity configuration",
      options: {
        activityLimitRows: [["Wrong", "MaxPerPerson"], ["Hall Monitor", 1]],
      },
      invoke(app) {
        return app.submitSignup("1", "Alice", "1-A", app.ROLES.general, "spring-fete");
      },
    },
  ];

  scenarios.forEach((scenario) => {
    const propertyStore = new Map();
    const { app, spreadsheets, lock } = loadBackend({
      ...scenario.options,
      propertyStore,
    });
    const result = scenario.invoke(app);
    assert.equal(result.success, false, scenario.label);
    assert.deepEqual(
      getDurableWriteBudgetEntries(propertyStore),
      [],
      scenario.label,
    );
    assert.equal(
      spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups").__state.deletedRows
        .length,
      0,
      scenario.label,
    );
    assert.equal(lock.releaseCount, 1, scenario.label);
  });

  const propertyStore = new Map();
  const finalPolicy = loadBackend({ propertyStore });
  const configSheet =
    finalPolicy.spreadsheets[MASTER_SHEET_ID].getSheetByName("Config");
  configSheet.__state.onGetValues = ({ callNumber }) => {
    if (callNumber === 2) configSheet.__state.values[1][2] = "READ_ONLY";
  };
  const result = finalPolicy.app.submitSignup(
    "1",
    "Alice",
    "1-A",
    finalPolicy.app.ROLES.general,
    "spring-fete",
  );
  assert.equal(result.code, "event_read_only");
  assert.deepEqual(getDurableWriteBudgetEntries(propertyStore), []);
  assert.equal(finalPolicy.lock.releaseCount, 1);
});

test("public signup matching uses NFKC for duplicate, overlap, and activity identity", () => {
  const duplicateRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-A", appRoleGeneral(), new Date()],
  ];
  const duplicate = loadBackend({ signupRows: duplicateRows });
  const duplicateResult = duplicate.app.submitSignup(
    "1",
    "Ａｌｉｃｅ",
    "2-A",
    duplicate.app.ROLES.general,
    "spring-fete",
  );
  assert.equal(duplicateResult.success, false);
  assert.equal(
    duplicate.spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups").__state
      .values.length,
    2,
  );

  const overlapEvents = [
    ...createEventRows(),
    createAdditionalEventRow({
      start: "1970-01-01T10:00:00Z",
      end: "1970-01-01T10:30:00Z",
    }),
  ];
  const otherEventSignup = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Ａｌｉｃｅ", "1-A", appRoleGeneral(), new Date()],
  ];
  const overlap = loadBackend({
    eventRows: overlapEvents,
    signupRows: otherEventSignup,
  });
  const overlapResult = overlap.app.submitSignup(
    "1",
    "Alice",
    "2-A",
    overlap.app.ROLES.general,
    "spring-fete",
  );
  assert.equal(overlapResult.code, "time_conflict");

  const activityEvents = [
    ...createEventRows(),
    createAdditionalEventRow({
      activity: "Hall Monitor",
      start: "1970-01-01T12:00:00Z",
      end: "1970-01-01T13:00:00Z",
    }),
  ];
  const activity = loadBackend({
    eventRows: activityEvents,
    signupRows: otherEventSignup,
    activityLimitRows: [["Activity", "MaxPerPerson"], ["Hall Monitor", 1]],
  });
  const activityResult = activity.app.submitSignup(
    "1",
    "Alice",
    "2-A",
    activity.app.ROLES.general,
    "spring-fete",
  );
  assert.equal(activityResult.code, "activity_limit");
});

test("public per-identity attempts share NFKC name and class variants", () => {
  const cacheStore = new Map();
  const { app, lock, spreadsheets } = loadBackend({ cacheStore });
  const variants = [
    ["Alice", "1-A"],
    ["Ａｌｉｃｅ", "１-Ａ"],
    ["𝐀lice", "1-𝐀"],
    ["Alice", "1-A"],
  ];
  const results = variants.map(([name, cls]) =>
    app.cancelSignup("1", name, cls, app.ROLES.general, "spring-fete"),
  );

  assert.equal(results[0].success, false);
  assert.equal(results[1].message, results[0].message);
  assert.equal(results[2].message, results[0].message);
  assert.notEqual(results[3].message, results[0].message);
  assert.equal(lock.tryCount, 3);
  assert.equal(
    spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups").__state.calls
      .getValues,
    3,
  );
  const emergencyCounter = JSON.parse(
    [...cacheStore.entries()].find(([key]) => key.includes("emergency_"))[1],
  );
  assert.equal(emergencyCounter.hits, 3);
});

test("activity labels retain their legacy non-NFKC grouping semantics", () => {
  const eventRows = createEventRows();
  eventRows[1][1] = "IV";
  eventRows.push(
    createAdditionalEventRow({
      activity: "Ⅳ",
      start: "1970-01-01T12:00:00Z",
      end: "1970-01-01T13:00:00Z",
    }),
  );
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 2, "Ａｌｉｃｅ", "1-A", appRoleGeneral(), new Date()],
  ];
  const { app } = loadBackend({
    eventRows,
    signupRows,
    activityLimitRows: [["Activity", "MaxPerPerson"], ["IV", 1]],
  });

  const result = app.submitSignup(
    "1",
    "Alice",
    "2-A",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, true);
});

test("cancellation prefers exact display identity before an NFKC collision", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Alice", "1-A", appRoleGeneral(), new Date()],
    ["s2", 1, "Ａｌｉｃｅ", "１-Ａ", appRoleGeneral(), new Date()],
  ];
  const { app, spreadsheets } = loadBackend({ signupRows });
  const result = app.cancelSignup(
    "1",
    "Alice",
    "1-A",
    app.ROLES.general,
    "spring-fete",
  );
  const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

  assert.equal(result.success, true);
  assert.equal(result.name, "Alice");
  assert.equal(result.cls, "1-A");
  assert.deepEqual(signupsSheet.__state.deletedRows, [2]);
  assert.equal(signupsSheet.__state.values[1][2], "Ａｌｉｃｅ");
});

test("unique NFKC cancellation returns and deletes the actual displayed tuple", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "Ａｌｉｃｅ", "１-Ａ", appRoleGeneral(), new Date()],
  ];
  const { app, spreadsheets } = loadBackend({ signupRows });
  const result = app.cancelSignup(
    "1",
    "Alice",
    "1-A",
    app.ROLES.general,
    "spring-fete",
  );

  assert.equal(result.success, true);
  assert.equal(result.name, "Ａｌｉｃｅ");
  assert.equal(result.cls, "１-Ａ");
  assert.deepEqual(
    spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups").__state.deletedRows,
    [2],
  );
});

test("exact, legacy, and NFKC cancellation collisions are all non-destructive", () => {
  const collisionGroups = [
    {
      label: "exact",
      request: "Alice",
      names: ["Alice", "Alice"],
    },
    {
      label: "legacy",
      request: "alice",
      names: ["Alice", "ALICE"],
    },
    {
      label: "NFKC",
      request: "Alice",
      names: ["Ａｌｉｃｅ", "𝐀lice"],
    },
  ];

  collisionGroups.forEach(({ label, request, names }) => {
    const eventRows = createEventRows();
    eventRows[1][8] = 3;
    const signupRows = [
      ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
      ["s1", 1, names[0], "1-A", appRoleGeneral(), new Date()],
      ["s2", 1, names[1], "1-A", appRoleGeneral(), new Date()],
    ];
    const propertyStore = new Map();
    const { app, spreadsheets } = loadBackend({
      eventRows,
      signupRows,
      propertyStore,
    });
    const result = app.cancelSignup(
      "1",
      request,
      "1-A",
      app.ROLES.general,
      "spring-fete",
    );
    const signupsSheet = spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups");

    assert.equal(result.success, false, label);
    assert.equal(result.code, "ambiguous_signup", label);
    assert.deepEqual(signupsSheet.__state.deletedRows, [], label);
    assert.equal(signupsSheet.__state.values.length, 3, label);
    assert.deepEqual(getDurableWriteBudgetEntries(propertyStore), [], label);
  });
});

test("GridData and Base64 template payload round-trip hostile text exactly", () => {
  const hostile = `</script><&>"'/\``;
  const eventRows = createEventRows();
  eventRows[1][1] = `Activity ${hostile}`;
  eventRows[1][2] = `Subtitle ${hostile}`;
  eventRows[1][6] = `Description ${hostile}`;
  eventRows[1][7] = `Location ${hostile}`;
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["secret-id", 1, `Name ${hostile}`, "raw-class", appRoleGeneral(), new Date()],
  ];
  const signupDisplayRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["secret-id", "1", `Name ${hostile}`, `Class ${hostile}`, appRoleGeneral(), "secret-time"],
  ];
  const { app } = loadBackend({
    eventRows,
    signupRows,
    signupDisplayRows,
    eventSpreadsheetName: `Title ${hostile}`,
  });

  const result = app.doGet({ parameter: { event: "Spring-Fete" } });
  const decoded = JSON.parse(
    Buffer.from(result.gridData, "base64").toString("utf8"),
  );
  const event = decoded.events[0];
  const rpc = app.getGridDataForAlias("Spring-Fete");

  assert.equal(result.kind, "template");
  assert.match(result.gridData, /^[A-Za-z0-9+/=]+$/);
  assert.equal(result.gridData.includes("<"), false);
  assert.equal(result.gridData.includes("</script>"), false);
  assert.equal(event.activity, `Activity ${hostile}`);
  assert.equal(event.subtitle, `Subtitle ${hostile}`);
  assert.equal(event.description, `Description ${hostile}`);
  assert.equal(event.location, `Location ${hostile}`);
  assert.equal(event.signups[0].name, `Name ${hostile}`);
  assert.equal(event.signups[0].cls, `Class ${hostile}`);
  assert.equal(rpc.success, true);
  assert.equal(rpc.gridData.events[0].description, `Description ${hostile}`);
  assert.equal(rpc.gridData.events[0].signups[0].name, `Name ${hostile}`);
  assert.deepEqual(Object.keys(event.signups[0]).sort(), ["cls", "name", "role"]);
  assert.equal(JSON.stringify(decoded).includes("secret-id"), false);
  assert.equal(JSON.stringify(decoded).includes("secret-time"), false);
});

test("apostrophe names survive bootstrap and cancellation round-trip", () => {
  const signupRows = [
    ["SignupID", "EventID", "Name", "Class", "Role", "CreatedAt"],
    ["s1", 1, "O'Neil", "1-A", appRoleGeneral(), new Date()],
  ];
  const { app, spreadsheets } = loadBackend({ signupRows });
  const page = app.doGet({ parameter: { event: "spring-fete" } });
  const signup = JSON.parse(
    Buffer.from(page.gridData, "base64").toString("utf8"),
  ).events[0].signups[0];
  const result = app.cancelSignup(
    "1",
    signup.name,
    signup.cls,
    signup.role,
    "spring-fete",
  );

  assert.equal(signup.name, "O'Neil");
  assert.equal(result.success, true);
  assert.equal(result.name, "O'Neil");
  assert.equal(result.cls, "1-A");
  assert.deepEqual(
    spreadsheets[EVENT_SHEET_ID].getSheetByName("Signups").__state.deletedRows,
    [2],
  );
});
