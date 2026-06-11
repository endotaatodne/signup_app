const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { loadIndexHtml } = require("../test-support/load-index-html");

function createElement(tagName) {
  const attributes = {};
  return {
    tagName,
    className: "",
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    children: [],
    style: {},
    classList: createClassList(),
    get firstChild() {
      return this.children[0] || null;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name)
        ? attributes[name]
        : null;
    },
    addEventListener() {},
    removeEventListener() {},
    closest() {
      return null;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      return child;
    },
    focus() {},
  };
}

function createClassList() {
  const classNames = new Set();
  return {
    add(name) {
      classNames.add(name);
    },
    remove(name) {
      classNames.delete(name);
    },
    toggle(name, force) {
      if (force) {
        classNames.add(name);
      } else {
        classNames.delete(name);
      }
    },
    has(name) {
      return classNames.has(name);
    },
  };
}

function createDocument(elements = {}) {
  const fallbackElements = {};
  return {
    elements,
    body: {
      classList: createClassList(),
      style: {},
    },
    documentElement: {
      clientWidth: 0,
    },
    getElementById(id) {
      if (elements[id]) return elements[id];
      if (!fallbackElements[id]) {
        fallbackElements[id] = createElement("div");
      }
      return fallbackElements[id];
    },
    querySelector(selector) {
      if (elements[selector]) return elements[selector];
      if (!fallbackElements[selector]) {
        fallbackElements[selector] = createElement("div");
      }
      return fallbackElements[selector];
    },
    createElement(tagName) {
      return createElement(tagName);
    },
  };
}

function createLocalStorage(initialValues = {}) {
  const values = { ...initialValues };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(values, key)
        ? values[key]
        : null;
    },
    setItem(key, value) {
      values[key] = String(value);
    },
  };
}

function loadClient(options = {}) {
  const {
    gridData = {
      events: [
        {
          eventId: 1,
          activity: "Hall Monitor",
          subtitle: "Morning",
          startTime: "09:30",
          endTime: "11:00",
          location: "Gym",
          description: "Guide arrivals",
          slots: {
            general: { max: 2, filled: 1 },
            classRep: { max: 1, filled: 1 },
            committee: { max: 0, filled: 0 },
          },
          signups: [
            { name: "Alice", cls: "1-1", role: "一般保護者" },
            { name: "Bob", cls: "1-2", role: "学年委員" },
          ],
        },
        {
          eventId: 2,
          activity: "Library Desk",
          subtitle: "",
          startTime: "09:30",
          endTime: "10:30",
          location: "Library",
          description: "",
          slots: {
            general: { max: 1, filled: 1 },
            classRep: { max: 0, filled: 0 },
            committee: { max: 1, filled: 0 },
          },
          signups: [],
        },
      ],
      times: ["09:30"],
      activities: ["Hall Monitor", "Library Desk"],
    },
    elements = {},
    windowOverrides = {},
    extraGlobals = {},
  } = options;

  const document = createDocument(elements);
  const window = {
    innerWidth: 1200,
    screen: { width: 1280 },
    visualViewport: { width: 1100 },
    addEventListener() {},
    setTimeout,
    clearTimeout,
    top: {
      location: {
        href: "",
        reload() {},
      },
    },
    ...windowOverrides,
  };

  const googleScriptRun = {
    withSuccessHandler(handler) {
      return {
        withFailureHandler() {
          return this;
        },
        getDeployedUrl() {
          handler("https://example.com/app");
          return this;
        },
        submitSignup() {
          return this;
        },
        cancelSignup() {
          return this;
        },
      };
    },
  };

  return loadIndexHtml(
    [
      "ROLE_KEYS",
      "ROLE_META_BY_LABEL",
      "gridData",
      "b64decode",
      "getEventLookupKey",
      "buildGridIndexes",
      "getEventById",
      "getRoleMetaByLabel",
      "getMobileDisplayMode",
      "setMobileDisplayMode",
      "updateMobileDisplayModeControl",
      "getEffectiveWidth",
      "isCompactLayout",
      "hasAnyAvailable",
      "formatTime",
      "formatTimeRange",
      "normaliseWhitespace",
      "normaliseAsciiDigits",
      "isClassTokenChar",
      "normaliseClassSeparators",
      "normaliseClassValue",
      "normaliseComparable",
      "normaliseClassComparable",
      "showMessage",
      "showCancelMessage",
      "findAndConfirmCancel",
      "submitSignup",
      "buildGrid",
      "buildMobileAgenda",
      "buildMobileAgendaByActivity",
      "buildMobileAgendaByTime",
      "renderResponsiveView",
    ],
    {
      gridData,
      globals: {
        window,
        document,
        google: { script: { run: googleScriptRun } },
        ...extraGlobals,
      },
    },
  );
}

test("b64decode restores UTF-8 text", () => {
  const { exports: client } = loadClient();
  const encoded = Buffer.from("こんにちは", "utf8").toString("base64");

  assert.equal(client.b64decode(encoded), "こんにちは");
});

test("server template data is injected only as quoted base64 values", () => {
  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.match(htmlSource, /JSON\.parse\(b64decode\("<\?!= gridData \?>"\)\)/);
  assert.match(htmlSource, /var alias = b64decode\("<\?!= alias \?>"\);/);
  assert.match(htmlSource, /JSON\.parse\(b64decode\("<\?!= roles \?>"\)\)/);
  assert.match(htmlSource, /var PAGE_TITLE = b64decode\("<\?!= title \?>"\);/);
});

test("buildGridIndexes creates lookups and groups signups by role", () => {
  const { exports: client, context } = loadClient();

  client.buildGridIndexes();

  const firstEvent = client.getEventById(1);
  assert.equal(firstEvent.activity, "Hall Monitor");
  assert.equal(
    context.gridIndexes.eventByActivityAndTime["Hall Monitor\u000009:30"].eventId,
    1,
  );
  assert.equal(firstEvent.signupsByRole["一般保護者"].length, 1);
  assert.equal(firstEvent.signupsByRole["学年委員"].length, 1);
});

test("getRoleMetaByLabel returns metadata for known role labels", () => {
  const { exports: client } = loadClient();

  assert.equal(client.getRoleMetaByLabel("一般保護者").key, "general");
  assert.equal(client.getRoleMetaByLabel("missing"), null);
});

test("getEffectiveWidth uses the smallest valid viewport width", () => {
  const { exports: client } = loadClient({
    windowOverrides: {
      innerWidth: 1000,
      screen: { width: 900 },
      visualViewport: { width: 820 },
    },
  });

  assert.equal(client.getEffectiveWidth(), 820);
  assert.equal(client.isCompactLayout(), true);
});

test("hasAnyAvailable reports whether at least one role still has capacity", () => {
  const { exports: client } = loadClient();

  assert.equal(
    client.hasAnyAvailable({
      general: { max: 1, filled: 1 },
      classRep: { max: 1, filled: 0 },
      committee: { max: 0, filled: 0 },
    }),
    true,
  );
  assert.equal(
    client.hasAnyAvailable({
      general: { max: 1, filled: 1 },
      classRep: { max: 1, filled: 1 },
      committee: { max: 0, filled: 0 },
    }),
    false,
  );
});

test("formatTime and formatTimeRange present times in 12-hour format", () => {
  const { exports: client } = loadClient();

  assert.equal(client.formatTime("00:00"), "12:00 am");
  assert.equal(client.formatTime("13:05"), "1:05 pm");
  assert.equal(client.formatTimeRange("09:30", "11:00"), "9:30 am - 11:00 am");
});

test("class normalization in index.html matches the backend contract", () => {
  const { exports: client } = loadClient();

  assert.equal(client.normaliseClassValue(" １ー２ "), "1-2");
  assert.equal(client.normaliseClassValue("四ー二"), "4-2");
  assert.equal(
    client.normaliseClassComparable("四ー2"),
    client.normaliseClassComparable("4-2"),
  );
  assert.equal(client.normaliseClassSeparators("クラスーA"), "クラスーA");
});

test("showMessage renders refresh prompts with emphasis spans", () => {
  const messageNode = createElement("div");
  messageNode.style = { display: "none" };
  const { exports: client } = loadClient({
    elements: {
      modalMessage: messageNode,
      cancelMessage: createElement("div"),
    },
  });

  client.showMessage(
    "modalMessage",
    "キャンセルされました。ページをリフレッシュしてください。",
    true,
  );

  assert.equal(messageNode.className, "modal-message success action-needed");
  assert.equal(messageNode.style.display, "block");
  assert.equal(messageNode.children.length, 2);
  assert.equal(messageNode.children[0].className, "modal-message-main");
  assert.equal(messageNode.children[1].className, "modal-message-emphasis");
});

test("showCancelMessage forwards to the cancel message target", () => {
  const cancelNode = createElement("div");
  cancelNode.style = { display: "none" };
  const { exports: client } = loadClient({
    elements: {
      cancelMessage: cancelNode,
    },
  });

  client.showCancelMessage("入力内容をご確認ください。", false);

  assert.equal(cancelNode.textContent, "入力内容をご確認ください。");
  assert.equal(cancelNode.className, "modal-message error");
  assert.equal(cancelNode.style.display, "block");
});

test("index.html leaves name length enforcement to validation while keeping class inputs at 10", () => {
  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );
  function getInputBlock(id) {
    const afterId = htmlSource.split(`id="${id}"`)[1];
    if (!afterId) return null;
    return afterId.split("/>")[0];
  }

  const inputNameBlock = getInputBlock("inputName");
  const cancelNameBlock = getInputBlock("cancelName");
  const inputClassBlock = getInputBlock("inputClass");
  const cancelClassBlock = getInputBlock("cancelClass");

  assert.ok(inputNameBlock);
  assert.ok(cancelNameBlock);
  assert.ok(inputClassBlock);
  assert.ok(cancelClassBlock);
  assert.doesNotMatch(inputNameBlock, /maxlength=/);
  assert.doesNotMatch(cancelNameBlock, /maxlength=/);
  assert.match(inputClassBlock, /maxlength="10"/);
  assert.match(cancelClassBlock, /maxlength="10"/);
});

test("findAndConfirmCancel enforces the 50-character name limit client-side", () => {
  const cancelMessage = createElement("div");
  cancelMessage.style = { display: "none" };
  const cancelRole = createElement("select");
  cancelRole.value = "general";

  const { exports: client } = loadClient({
    elements: {
      cancelRole,
      cancelName: { ...createElement("input"), value: "A".repeat(51) },
      cancelClass: { ...createElement("input"), value: "1-1" },
      cancelMessage,
    },
  });

  client.findAndConfirmCancel();

  assert.equal(cancelMessage.textContent, "名前は５０文字以下で入力してください。");
  assert.equal(cancelMessage.className, "modal-message error");
  assert.equal(cancelMessage.style.display, "block");
});

test("submitSignup enforces the 50-character name limit client-side", () => {
  const modalMessage = createElement("div");
  modalMessage.style = { display: "none" };
  const submitBtn = createElement("button");

  const { exports: client, context } = loadClient({
    elements: {
      honeypot: { ...createElement("input"), value: "" },
      inputName: { ...createElement("input"), value: "A".repeat(51) },
      inputClass: { ...createElement("input"), value: "1-1" },
      submitBtn,
      modalMessage,
    },
  });

  context.PAGE_LOAD_TIME = Date.now() - 4000;
  context.currentRole = "general";

  client.submitSignup();

  assert.equal(modalMessage.textContent, "名前は５０文字以下で入力してください。");
  assert.equal(modalMessage.className, "modal-message error");
  assert.equal(modalMessage.style.display, "block");
});

test("submitSignup refreshes grid data after a stale full-slot rejection", () => {
  const modalMessage = createElement("div");
  modalMessage.style = { display: "none" };
  const submitBtn = createElement("button");
  const roleButtons = createElement("div");
  const freshGridData = {
    events: [
      {
        eventId: 1,
        activity: "Hall Monitor",
        subtitle: "Morning",
        startTime: "09:30",
        endTime: "11:00",
        location: "Gym",
        description: "Guide arrivals",
        slots: {
          general: { max: 2, filled: 2 },
          classRep: { max: 1, filled: 1 },
          committee: { max: 0, filled: 0 },
        },
        signups: [],
      },
    ],
    times: ["09:30"],
    activities: ["Hall Monitor"],
  };
  let submitCalls = 0;
  let refreshCalls = 0;
  const google = {
    script: {
      run: {
        withSuccessHandler(handler) {
          return {
            withFailureHandler() {
              return this;
            },
            getDeployedUrl() {
              handler("https://example.com/app");
              return this;
            },
            submitSignup() {
              submitCalls += 1;
              handler({
                success: false,
                code: "slot_full",
                message: "Slot is full.",
              });
              return this;
            },
            getGridDataForAlias(receivedAlias) {
              refreshCalls += 1;
              assert.equal(receivedAlias, "test-alias");
              handler({ success: true, gridData: freshGridData });
              return this;
            },
          };
        },
      },
    },
  };

  const { exports: client, context } = loadClient({
    elements: {
      honeypot: { ...createElement("input"), value: "" },
      inputName: { ...createElement("input"), value: "Alice" },
      inputClass: { ...createElement("input"), value: "1-1" },
      submitBtn,
      modalMessage,
      roleButtons,
    },
    extraGlobals: {
      google,
    },
  });

  context.PAGE_LOAD_TIME = Date.now() - 4000;
  context.currentEventId = 1;
  context.currentRole = client.ROLE_KEYS[0].label;

  client.submitSignup();

  assert.equal(submitCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(client.getEventById(1).slots.general.filled, 2);
  assert.equal(modalMessage.textContent, "Slot is full.");
  assert.equal(modalMessage.className, "modal-message error");
  assert.equal(submitBtn.disabled, false);
  assert.equal(roleButtons.children[0].children[1].textContent, "Full");
});

test("desktop grid typography overrides are scoped to desktop layout", () => {
  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.match(
    htmlSource,
    /body\.desktop-layout td\.time-cell\s*{[\s\S]*?font-size:\s*16px;/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout td\.desc-cell\s*{[\s\S]*?font-size:\s*15px;/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout \.activity-title\s*{[\s\S]*?font-size:\s*18px;/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout \.activity-subtitle\s*{[\s\S]*?font-size:\s*15px;/,
  );
  assert.doesNotMatch(
    htmlSource,
    /body\.compact-layout [^{]*(?:td\.time-cell|td\.desc-cell|\.activity-title|\.activity-subtitle)/,
  );
});

test("buildGrid renders desktop header text with CSS classes", () => {
  const table = createElement("table");
  const { exports: client } = loadClient({
    elements: {
      grid: table,
    },
  });

  client.buildGridIndexes();
  client.buildGrid();

  const headerRow = table.children[0].children[0];
  const firstActivityHeader = headerRow.children[2];
  const title = firstActivityHeader.children[0];
  const subtitle = firstActivityHeader.children[1];
  const location = firstActivityHeader.children[2];

  assert.equal(title.className, "activity-title");
  assert.equal(title.textContent, "Hall Monitor");
  assert.equal(title.style.fontWeight, "600");
  assert.equal(title.style.cssText || "", "");
  assert.equal(subtitle.className, "activity-subtitle");
  assert.equal(subtitle.textContent, "Morning");
  assert.equal(subtitle.style.cssText, "font-weight:400;color:#888;margin-top:2px;");
  assert.equal(location.className, "activity-location");
  assert.equal(location.textContent, "Gym");
  assert.equal(
    location.style.cssText,
    "font-weight:400;color:#999;margin-top:3px;font-size:0.88em;",
  );
});

test("buildMobileAgenda groups mobile signup names by role", () => {
  const mobileNode = createElement("div");
  mobileNode.style = {};
  const { exports: client } = loadClient({
    elements: {
      mobileAgenda: mobileNode,
    },
  });

  client.buildGridIndexes();
  client.setMobileDisplayMode("activity");
  client.buildMobileAgenda();

  const firstSection = mobileNode.children[0];
  const firstCard = firstSection.children[0];
  const summary = firstCard.children[1];
  const namesList = firstCard.children[2];

  assert.equal(firstCard.children.length, 3);
  assert.equal(summary.className, "mobile-slot-summary");
  assert.equal(namesList.className, "mobile-slot-names");
  assert.equal(namesList.children.length, 2);
  assert.equal(namesList.children[0].className, "mobile-slot-name-group");
  assert.equal(
    namesList.children[0].children[0].textContent,
    client.ROLE_KEYS[0].label + ":",
  );
  assert.equal(namesList.children[0].children[1].textContent, "Alice");
  assert.equal(
    namesList.children[1].children[0].textContent,
    client.ROLE_KEYS[1].label + ":",
  );
  assert.equal(namesList.children[1].children[1].textContent, "Bob");
});

test("buildMobileAgenda groups mobile cards by activity and sorts each group by time", () => {
  const mobileNode = createElement("div");
  mobileNode.style = {};
  const { exports: client } = loadClient({
    gridData: {
      activities: ["Bake Sale", "Games"],
      times: ["09:30", "10:00", "11:00"],
      events: [
        {
          eventId: 3,
          activity: "Games",
          subtitle: "",
          startTime: "10:00",
          endTime: "10:30",
          location: "Oval",
          description: "",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            committee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 2,
          activity: "Bake Sale",
          subtitle: "",
          startTime: "11:00",
          endTime: "11:30",
          location: "Hall",
          description: "",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            committee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 1,
          activity: "Bake Sale",
          subtitle: "",
          startTime: "09:30",
          endTime: "10:00",
          location: "Hall",
          description: "",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            committee: { max: 0, filled: 0 },
          },
          signups: [],
        },
      ],
    },
    elements: {
      mobileAgenda: mobileNode,
    },
  });

  client.buildGridIndexes();
  client.setMobileDisplayMode("activity");
  client.buildMobileAgenda();

  function getTitleWrap(card) {
    return card.children[0].children[0];
  }

  const bakeSaleSection = mobileNode.children[0];
  const gamesSection = mobileNode.children[1];
  const firstBakeSaleCard = bakeSaleSection.children[0];
  const secondBakeSaleCard = bakeSaleSection.children[1];
  const firstGamesCard = gamesSection.children[0];

  assert.equal(mobileNode.children.length, 2);
  assert.equal(bakeSaleSection.children.length, 2);
  assert.equal(
    getTitleWrap(firstBakeSaleCard).children[0].textContent,
    "Bake Sale",
  );
  assert.equal(
    getTitleWrap(firstBakeSaleCard).children[1].textContent,
    "9:30 am - 10:00 am",
  );
  assert.equal(
    getTitleWrap(secondBakeSaleCard).children[1].textContent,
    "11:00 am - 11:30 am",
  );
  assert.equal(
    getTitleWrap(firstGamesCard).children[0].textContent,
    "Games",
  );
});

test("mobile display mode restores saved preference and updates the control", () => {
  const activityBtn = createElement("button");
  const timeBtn = createElement("button");
  const storage = createLocalStorage({
    "signupApp.mobileDisplayMode": "activity",
  });

  const { exports: client } = loadClient({
    elements: {
      mobileDisplayModeActivity: activityBtn,
      mobileDisplayModeTime: timeBtn,
    },
    windowOverrides: {
      localStorage: storage,
    },
  });

  assert.equal(client.getMobileDisplayMode(), "activity");
  assert.equal(activityBtn.getAttribute("aria-pressed"), "true");
  assert.equal(timeBtn.getAttribute("aria-pressed"), "false");
  assert.equal(activityBtn.classList.has("active"), true);
  assert.equal(timeBtn.classList.has("active"), false);
});

test("mobile display mode defaults to time when no preference is saved", () => {
  const activityBtn = createElement("button");
  const timeBtn = createElement("button");

  const { exports: client } = loadClient({
    elements: {
      mobileDisplayModeActivity: activityBtn,
      mobileDisplayModeTime: timeBtn,
    },
    windowOverrides: {
      localStorage: createLocalStorage(),
    },
  });

  assert.equal(client.getMobileDisplayMode(), "time");
  assert.equal(activityBtn.getAttribute("aria-pressed"), "false");
  assert.equal(timeBtn.getAttribute("aria-pressed"), "true");
  assert.equal(activityBtn.classList.has("active"), false);
  assert.equal(timeBtn.classList.has("active"), true);
});

test("buildMobileAgenda can group mobile cards by time with headings", () => {
  const mobileNode = createElement("div");
  mobileNode.className = "mobile-agenda";
  mobileNode.style = {};
  const storage = createLocalStorage({
    "signupApp.mobileDisplayMode": "activity",
  });

  const { exports: client } = loadClient({
    gridData: {
      activities: ["Bake Sale", "Games"],
      times: ["09:30", "10:00"],
      events: [
        {
          eventId: 2,
          activity: "Games",
          subtitle: "",
          startTime: "09:30",
          endTime: "10:00",
          location: "Oval",
          description: "",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            committee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 1,
          activity: "Bake Sale",
          subtitle: "",
          startTime: "09:30",
          endTime: "10:00",
          location: "Hall",
          description: "",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            committee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 3,
          activity: "Bake Sale",
          subtitle: "",
          startTime: "10:00",
          endTime: "10:30",
          location: "Hall",
          description: "",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            committee: { max: 0, filled: 0 },
          },
          signups: [],
        },
      ],
    },
    elements: {
      mobileAgenda: mobileNode,
    },
    windowOverrides: {
      innerWidth: 800,
      screen: { width: 820 },
      visualViewport: { width: 790 },
      localStorage: storage,
    },
  });

  client.buildGridIndexes();
  client.setMobileDisplayMode("time");

  function getTitleWrap(card) {
    return card.children[0].children[0];
  }

  const firstTimeSection = mobileNode.children[0];
  const secondTimeSection = mobileNode.children[1];
  const firstCard = firstTimeSection.children[1];
  const secondCard = firstTimeSection.children[2];

  assert.equal(storage.getItem("signupApp.mobileDisplayMode"), "time");
  assert.equal(mobileNode.className, "mobile-agenda mobile-display-by-time");
  assert.equal(mobileNode.children.length, 2);
  assert.equal(firstTimeSection.children[0].className, "mobile-time-heading");
  assert.equal(firstTimeSection.children[0].textContent, "9:30 am - 10:00 am");
  assert.equal(getTitleWrap(firstCard).children[0].textContent, "Bake Sale");
  assert.equal(getTitleWrap(firstCard).children[1].className, "mobile-slot-meta");
  assert.notEqual(getTitleWrap(firstCard).children[1].className, "mobile-slot-time");
  assert.equal(getTitleWrap(secondCard).children[0].textContent, "Games");
  assert.equal(secondTimeSection.children[0].textContent, "10:00 am - 10:30 am");
});

test("renderResponsiveView toggles layout classes and target visibility", () => {
  const desktopNode = createElement("div");
  desktopNode.style = {};
  const mobileNode = createElement("div");
  mobileNode.style = {};

  const { exports: client, context } = loadClient({
    elements: {
      desktopGridWrapper: desktopNode,
      mobileAgenda: mobileNode,
    },
    windowOverrides: {
      innerWidth: 800,
      screen: { width: 820 },
      visualViewport: { width: 790 },
    },
  });

  let mobileBuilds = 0;
  let gridBuilds = 0;
  context.buildMobileAgenda = function () {
    mobileBuilds += 1;
  };
  context.buildGrid = function () {
    gridBuilds += 1;
  };
  context.lastCompactLayout = null;

  client.renderResponsiveView();

  assert.equal(desktopNode.style.display, "none");
  assert.equal(mobileNode.style.display, "block");
  assert.equal(mobileBuilds, 1);
  assert.equal(gridBuilds, 0);
  assert.equal(context.document.body.classList.has("compact-layout"), true);
});
