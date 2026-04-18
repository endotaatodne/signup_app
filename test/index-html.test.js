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
  assert.equal(client.normaliseClassComparable("１ー2"), client.normaliseClassComparable("1-2"));
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
