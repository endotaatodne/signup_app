const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { loadIndexHtml } = require("../test-support/load-index-html");

function elementMatchesSelector(element, selector) {
  if (!element || !selector) return false;
  if (selector.startsWith("#")) {
    const id = selector.slice(1);
    return element.id === id || element.getAttribute?.("id") === id;
  }

  const attributeMatch = selector.match(/^\[([^\]=]+)(?:="([^"]*)")?\]$/);
  if (attributeMatch) {
    const value = element.getAttribute?.(attributeMatch[1]);
    return attributeMatch[2] === undefined
      ? value !== null
      : value === attributeMatch[2];
  }

  return false;
}

function createElement(tagName) {
  const attributes = {};
  const listeners = {};
  return {
    tagName,
    id: "",
    parentNode: null,
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
      if (name === "id") this.id = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name)
        ? attributes[name]
        : null;
    },
    addEventListener(type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((item) => item !== handler);
    },
    dispatchEvent(event) {
      const eventWithTarget = { target: this, ...event };
      (listeners[eventWithTarget.type] || []).forEach((handler) =>
        handler(eventWithTarget),
      );
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (elementMatchesSelector(current, selector)) return current;
        current = current.parentNode || null;
      }
      return null;
    },
    contains(node) {
      let current = node;
      while (current) {
        if (current === this) return true;
        current = current.parentNode || null;
      }
      return false;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      if (child.parentNode === this) child.parentNode = null;
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
  const listeners = {};
  function withElementId(id, element) {
    if (element?.setAttribute) element.setAttribute("id", id);
    else if (element) element.id = id;
    return element;
  }

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
      if (elements[id]) return withElementId(id, elements[id]);
      if (!fallbackElements[id]) {
        fallbackElements[id] = createElement("div");
      }
      return withElementId(id, fallbackElements[id]);
    },
    addEventListener(type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener(type, handler) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((item) => item !== handler);
    },
    dispatchEvent(event) {
      (listeners[event.type] || []).forEach((handler) => handler(event));
    },
    querySelector(selector) {
      if (elements[selector]) return elements[selector];
      if (selector.startsWith("#")) return this.getElementById(selector.slice(1));
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
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 1, filled: 0 },
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
            steeringCommittee: { max: 1, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
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
      "buildGridIndexes",
      "getEventById",
      "getRoleMetaByLabel",
      "getMobileDisplayMode",
      "setMobileDisplayMode",
      "updateMobileDisplayModeControl",
      "getEffectiveWidth",
      "isCompactLayout",
      "hasAnyAvailable",
      "getAvailableSlotCount",
      "getMobileAvailableTimeOptions",
      "getMobileAvailableTimeFilters",
      "getMobileAvailableTimeFilter",
      "setMobileAvailableTimeFilter",
      "setMobileTimeFilterDropdownOpen",
      "getMobileActivityFilter",
      "setMobileActivityFilter",
      "getMobileRoleFilter",
      "setMobileRoleFilter",
      "getMobileKeywordSearchQuery",
      "setMobileKeywordSearchQuery",
      "getMobileVolunteerNameQuery",
      "setMobileVolunteerNameQuery",
      "getMobileFilteredEvents",
      "updateMobileAvailabilityControl",
      "updateDesktopScheduleSummary",
      "formatTime",
      "formatTimeRange",
      "normaliseWhitespace",
      "normaliseAsciiDigits",
      "normaliseBrackets",
      "normaliseNameValue",
      "isValidNameValue",
      "isClassTokenChar",
      "normaliseClassSeparators",
      "normaliseClassValue",
      "normaliseComparable",
      "normaliseClassComparable",
      "showMessage",
      "showCancelMessage",
      "openModal",
      "closeModal",
      "switchTab",
      "renderCancelSignupList",
      "selectCancelSignup",
      "findAndConfirmCancel",
      "confirmCancel",
      "submitSignup",
      "buildMobileAgenda",
      "buildMobileAgendaByTime",
      "buildMobileDayOverview",
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

test("buildGridIndexes creates the event lookup and groups signups by role", () => {
  const { exports: client } = loadClient();

  client.buildGridIndexes();

  const firstEvent = client.getEventById(1);
  assert.equal(firstEvent.activity, "Hall Monitor");
  assert.equal(firstEvent.signupsByRole["一般保護者"].length, 1);
  assert.equal(firstEvent.signupsByRole["学年委員"].length, 1);
});

test("getRoleMetaByLabel returns metadata for known role labels", () => {
  const { exports: client } = loadClient();

  assert.equal(client.getRoleMetaByLabel("一般保護者").key, "general");
  assert.equal(
    client.getRoleMetaByLabel("役員、運営・実行委員").key,
    "steeringCommittee",
  );
  assert.equal(
    client.getRoleMetaByLabel("\u5B9F\u884C\u59D4\u54E1").key,
    "orgCommittee",
  );
  assert.equal(client.getRoleMetaByLabel("missing"), null);
});

test("openModal renders an org committee role button when slots exist", () => {
  const roleButtons = createElement("div");
  const { exports: client } = loadClient({
    elements: {
      modalTitle: createElement("div"),
      modalSubtitle: createElement("div"),
      namesSection: createElement("div"),
      namesGroups: createElement("div"),
      roleButtons,
      modalForm: createElement("div"),
      inputName: createElement("input"),
      inputClass: createElement("input"),
      modalMessage: createElement("div"),
      modalOverlay: createElement("div"),
    },
  });

  client.buildGridIndexes();
  client.openModal(1);

  const orgCommitteeButton = roleButtons.children.find(function (child) {
    return child.getAttribute("data-role") === "\u5B9F\u884C\u59D4\u54E1";
  });
  assert.ok(orgCommitteeButton);
  assert.equal(orgCommitteeButton.className, "role-btn role-btn-orgcommittee");
  assert.equal(orgCommitteeButton.children[0].textContent, "\u5B9F\u884C\u59D4\u54E1");
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
      steeringCommittee: { max: 0, filled: 0 },
      orgCommittee: { max: 0, filled: 0 },
    }),
    true,
  );
  assert.equal(
    client.hasAnyAvailable({
      general: { max: 1, filled: 1 },
      classRep: { max: 1, filled: 1 },
      steeringCommittee: { max: 0, filled: 0 },
      orgCommittee: { max: 0, filled: 0 },
    }),
    false,
  );
});

test("mobile availability control lists activity pills and open time slots", () => {
  const timeFilter = createElement("div");
  const timeToggle = createElement("button");
  const activityFilter = createElement("div");
  const { exports: client } = loadClient({
    gridData: {
      activities: ["Gate", "Shop", "Cleanup"],
      times: ["09:00", "10:00", "11:00"],
      events: [
        {
          eventId: 1,
          activity: "Gate",
          subtitle: "",
          startTime: "09:00",
          endTime: "10:00",
          location: "Front",
          description: "",
          slots: {
            general: { max: 2, filled: 1 },
            classRep: { max: 0, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 2,
          activity: "Shop",
          subtitle: "",
          startTime: "10:00",
          endTime: "11:00",
          location: "Hall",
          description: "",
          slots: {
            general: { max: 1, filled: 1 },
            classRep: { max: 0, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 3,
          activity: "Cleanup",
          subtitle: "",
          startTime: "11:00",
          endTime: "12:00",
          location: "Gym",
          description: "",
          slots: {
            general: { max: 0, filled: 0 },
            classRep: { max: 2, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
      ],
    },
    elements: {
      mobileActivityFilter: activityFilter,
      mobileTimeAvailabilityFilter: timeFilter,
      mobileTimeAvailabilityToggle: timeToggle,
    },
  });

  client.buildGridIndexes();
  client.updateMobileAvailabilityControl();

  assert.equal(client.getAvailableSlotCount(client.getMobileFilteredEvents()[0]), 1);
  assert.equal(activityFilter.children.length, 4);
  assert.equal(activityFilter.children[0].getAttribute("data-mobile-activity-filter"), "__all__");
  assert.equal(activityFilter.children[1].textContent, "Gate");
  assert.equal(timeToggle.textContent, "\u3059\u3079\u3066\u306E\u6642\u9593\u5E2F");
  assert.equal(timeToggle.getAttribute("aria-expanded"), "false");
  assert.equal(timeFilter.hidden, true);
  assert.equal(timeFilter.children.length, 3);
  assert.equal(timeFilter.children[0].className.includes("is-active"), true);
  assert.equal(
    timeFilter.children[0].getAttribute("data-mobile-time-filter"),
    "__all__",
  );
  assert.equal(timeFilter.children[0].children[0].textContent, "\u2713");
  assert.equal(
    timeFilter.children[0].children[1].textContent,
    "\u3059\u3079\u3066\u306E\u6642\u9593\u5E2F",
  );
  assert.equal(
    timeFilter.children[1].getAttribute("data-mobile-time-filter"),
    "09:00",
  );
  assert.match(timeFilter.children[1].children[1].textContent, /9:00 am - 10:00 am/);
  assert.equal(
    timeFilter.children[1].children[1].textContent.includes(client.ROLE_KEYS[0].label),
    false,
  );
  assert.equal(
    timeFilter.children[2].getAttribute("data-mobile-time-filter"),
    "11:00",
  );
});

test("mobile filters render directly without collapsed summary state", () => {
  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.doesNotMatch(htmlSource, /mobileFilterSummaryBar/);
  assert.doesNotMatch(htmlSource, /mobileFilterSummaryText/);
  assert.doesNotMatch(htmlSource, /is-filters-collapsed/);
  assert.doesNotMatch(htmlSource, /is-filters-expanded/);
  assert.match(
    htmlSource,
    /id="mobileAvailabilityControl"[\s\S]*class="mobile-filter-row mobile-filter-row-secondary"[\s\S]*id="mobileActivityFilter"[\s\S]*id="mobileRoleAvailabilityFilter"[\s\S]*id="mobileKeywordSearch"[\s\S]*id="mobileTimeAvailabilityToggle"/,
  );
});

test("mobile available time filter narrows the mobile agenda", () => {
  const mobileNode = createElement("div");
  mobileNode.className = "mobile-agenda";
  mobileNode.style = {};
  const { exports: client } = loadClient({
    gridData: {
      activities: ["Gate", "Cleanup"],
      times: ["09:00", "11:00"],
      events: [
        {
          eventId: 1,
          activity: "Gate",
          subtitle: "",
          startTime: "09:00",
          endTime: "10:00",
          location: "Front",
          description: "",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 2,
          activity: "Cleanup",
          subtitle: "",
          startTime: "11:00",
          endTime: "12:00",
          location: "Gym",
          description: "",
          slots: {
            general: { max: 0, filled: 0 },
            classRep: { max: 2, filled: 1 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
      ],
    },
    elements: {
      mobileAgenda: mobileNode,
      mobileTimeAvailabilityFilter: createElement("div"),
    },
  });

  client.buildGridIndexes();
  client.setMobileAvailableTimeFilter("11:00");
  client.buildMobileAgenda();

  const onlySection = mobileNode.children[0];
  const onlyCard = onlySection.children[1];
  const titleWrap = onlyCard.children[0].children[0];

  assert.deepEqual(Array.from(client.getMobileAvailableTimeFilters()), ["11:00"]);
  assert.equal(mobileNode.children.length, 1);
  assert.equal(onlySection.children[0].textContent, "11:00 am - 12:00 pm");
  assert.equal(titleWrap.children[0].textContent, "Cleanup");
  assert.equal(client.getMobileFilteredEvents().length, 1);
});

test("mobile available time filter supports multiple selected time slots", () => {
  const mobileNode = createElement("div");
  mobileNode.className = "mobile-agenda";
  mobileNode.style = {};
  const timeFilter = createElement("div");
  const timeToggle = createElement("button");
  const detail = createElement("div");
  const { exports: client, context } = loadClient({
    gridData: {
      activities: ["Gate", "Shop", "Cleanup"],
      times: ["09:00", "10:00", "11:00"],
      events: [
        {
          eventId: 1,
          activity: "Gate",
          subtitle: "",
          startTime: "09:00",
          endTime: "10:00",
          location: "Front",
          description: "",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 2,
          activity: "Shop",
          subtitle: "",
          startTime: "10:00",
          endTime: "11:00",
          location: "Hall",
          description: "",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 3,
          activity: "Cleanup",
          subtitle: "",
          startTime: "11:00",
          endTime: "12:00",
          location: "Gym",
          description: "",
          slots: {
            general: { max: 0, filled: 0 },
            classRep: { max: 2, filled: 1 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
      ],
    },
    elements: {
      mobileAgenda: mobileNode,
      mobileTimeAvailabilityFilter: timeFilter,
      mobileTimeAvailabilityToggle: timeToggle,
      mobileTimeAvailabilityDetail: detail,
    },
  });

  client.buildGridIndexes();
  client.setMobileAvailableTimeFilter("09:00");
  client.setMobileAvailableTimeFilter("11:00");
  client.buildMobileAgenda();

  assert.deepEqual(Array.from(client.getMobileAvailableTimeFilters()), [
    "09:00",
    "11:00",
  ]);
  assert.equal(client.getMobileFilteredEvents().length, 2);
  assert.equal(mobileNode.children.length, 2);
  assert.equal(mobileNode.children[0].children[0].textContent, "9:00 am - 10:00 am");
  assert.equal(mobileNode.children[1].children[0].textContent, "11:00 am - 12:00 pm");
  assert.equal(timeToggle.textContent, "2\u3064\u306E\u6642\u9593\u5E2F\u3092\u9078\u629E\u4E2D");
  assert.equal(timeFilter.children.length, 4);
  assert.equal(timeFilter.hidden, true);
  assert.equal(timeFilter.children[1].className.includes("is-active"), true);
  assert.equal(timeFilter.children[3].className.includes("is-active"), true);
  assert.equal(timeFilter.children[1].children[0].textContent, "\u2713");
  assert.equal(timeFilter.children[3].children[0].textContent, "\u2713");
  assert.match(detail.textContent, /2\u3064\u306E\u6642\u9593\u5E2F\u306E\u7A7A\u304D/);

  client.setMobileTimeFilterDropdownOpen(true);
  assert.equal(timeFilter.hidden, false);
  assert.equal(timeToggle.getAttribute("aria-expanded"), "true");
  assert.equal(timeToggle.className.includes("is-open"), true);

  context.document.dispatchEvent({
    type: "click",
    target: timeFilter.children[1].children[1],
  });
  assert.equal(timeFilter.hidden, false);
  assert.equal(timeToggle.getAttribute("aria-expanded"), "true");

  context.document.dispatchEvent({
    type: "click",
    target: createElement("div"),
  });
  assert.equal(timeFilter.hidden, true);
  assert.equal(timeToggle.getAttribute("aria-expanded"), "false");
  assert.equal(timeToggle.className.includes("is-open"), false);

  client.setMobileTimeFilterDropdownOpen(true);
  client.setMobileAvailableTimeFilter("__all__");
  assert.deepEqual(Array.from(client.getMobileAvailableTimeFilters()), []);
  assert.equal(timeFilter.children[0].className.includes("is-active"), true);
  assert.equal(timeToggle.textContent, "\u3059\u3079\u3066\u306E\u6642\u9593\u5E2F");
});

test("activity filter refreshes the shared card renderer at desktop width", () => {
  const mobileNode = createElement("div");
  mobileNode.className = "mobile-agenda";
  mobileNode.style = {};
  const activityFilter = createElement("div");
  const { exports: client } = loadClient({
    gridData: {
      activities: ["Gate", "Cleanup"],
      times: ["09:00", "11:00"],
      events: [
        {
          eventId: 1,
          activity: "Gate",
          subtitle: "",
          startTime: "09:00",
          endTime: "10:00",
          location: "Front",
          description: "",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 2,
          activity: "Cleanup",
          subtitle: "",
          startTime: "11:00",
          endTime: "12:00",
          location: "Gym",
          description: "",
          slots: {
            general: { max: 0, filled: 0 },
            classRep: { max: 2, filled: 1 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
      ],
    },
    elements: {
      mobileAgenda: mobileNode,
      mobileActivityFilter: activityFilter,
      mobileTimeAvailabilityFilter: createElement("div"),
      mobileRoleAvailabilityFilter: createElement("div"),
      mobileKeywordSearch: createElement("input"),
      mobileTimeAvailabilityDetail: createElement("div"),
    },
  });

  client.buildGridIndexes();
  client.setMobileActivityFilter("Cleanup");

  const onlySection = mobileNode.children[0];
  const onlyCard = onlySection.children[1];
  const titleWrap = onlyCard.children[0].children[0];

  assert.equal(client.getMobileActivityFilter(), "Cleanup");
  assert.equal(activityFilter.children.length, 3);
  assert.equal(
    activityFilter.children[2].getAttribute("data-mobile-activity-filter"),
    "Cleanup",
  );
  assert.equal(activityFilter.children[2].className.includes("is-active"), true);
  assert.equal(client.getMobileFilteredEvents().length, 1);
  assert.equal(titleWrap.children[0].textContent, "Cleanup");
});

test("mobile keyword search narrows the mobile agenda by volunteer name", () => {
  const mobileNode = createElement("div");
  mobileNode.className = "mobile-agenda";
  mobileNode.style = {};
  const { exports: client } = loadClient({
    gridData: {
      activities: ["Gate", "Kitchen"],
      times: ["09:00", "10:00"],
      events: [
        {
          eventId: 1,
          activity: "Gate",
          subtitle: "",
          startTime: "09:00",
          endTime: "10:00",
          location: "Front",
          description: "",
          slots: {
            general: { max: 2, filled: 1 },
            classRep: { max: 0, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [
            { name: "Alice Tanaka", cls: "1-1", role: clientRoleGeneral() },
          ],
        },
        {
          eventId: 2,
          activity: "Kitchen",
          subtitle: "",
          startTime: "10:00",
          endTime: "11:00",
          location: "Hall",
          description: "",
          slots: {
            general: { max: 2, filled: 1 },
            classRep: { max: 0, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [
            { name: "Bob Sato", cls: "1-2", role: clientRoleGeneral() },
          ],
        },
      ],
    },
    elements: {
      mobileAgenda: mobileNode,
      mobileTimeAvailabilityFilter: createElement("div"),
      mobileRoleAvailabilityFilter: createElement("div"),
      mobileKeywordSearch: createElement("input"),
      mobileTimeAvailabilityDetail: createElement("div"),
    },
  });

  function clientRoleGeneral() {
    return "\u4E00\u822C\u4FDD\u8B77\u8005";
  }

  client.buildGridIndexes();
  client.setMobileKeywordSearchQuery("alice");
  client.buildMobileAgenda();

  const onlySection = mobileNode.children[0];
  const onlyCard = onlySection.children[1];
  const titleWrap = onlyCard.children[0].children[0];

  assert.equal(client.getMobileKeywordSearchQuery(), "alice");
  assert.equal(client.getMobileFilteredEvents().length, 1);
  assert.equal(titleWrap.children[0].textContent, "Gate");
});

test("mobile keyword search matches activity subtitle and description", () => {
  const mobileNode = createElement("div");
  mobileNode.className = "mobile-agenda";
  mobileNode.style = {};
  const { exports: client } = loadClient({
    gridData: {
      activities: ["Gate", "Kitchen"],
      times: ["09:00", "10:00"],
      events: [
        {
          eventId: 1,
          activity: "Gate",
          subtitle: "Main entrance",
          startTime: "09:00",
          endTime: "10:00",
          location: "Front",
          description: "Welcome desk",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 2,
          activity: "Kitchen",
          subtitle: "Lunch prep",
          startTime: "10:00",
          endTime: "11:00",
          location: "Hall",
          description: "Pack allergy-safe meals",
          slots: {
            general: { max: 1, filled: 0 },
            classRep: { max: 0, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
      ],
    },
    elements: {
      mobileAgenda: mobileNode,
      mobileTimeAvailabilityFilter: createElement("div"),
      mobileRoleAvailabilityFilter: createElement("div"),
      mobileKeywordSearch: createElement("input"),
      mobileTimeAvailabilityDetail: createElement("div"),
    },
  });

  client.buildGridIndexes();
  client.setMobileKeywordSearchQuery("allergy");
  client.buildMobileAgenda();

  const onlySection = mobileNode.children[0];
  const onlyCard = onlySection.children[1];
  const titleWrap = onlyCard.children[0].children[0];

  assert.equal(client.getMobileFilteredEvents().length, 1);
  assert.equal(titleWrap.children[0].textContent, "Kitchen");
});

test("mobile role filter updates pill state and time availability labels", () => {
  const timeFilter = createElement("div");
  const timeToggle = createElement("button");
  const activityFilter = createElement("div");
  const roleFilter = createElement("div");
  const detail = createElement("div");
  const { exports: client } = loadClient({
    gridData: {
      activities: ["Gate", "Desk", "Shop"],
      times: ["09:00", "10:00"],
      events: [
        {
          eventId: 1,
          activity: "Gate",
          subtitle: "",
          startTime: "09:00",
          endTime: "10:00",
          location: "Front",
          description: "",
          slots: {
            general: { max: 2, filled: 1 },
            classRep: { max: 1, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 2,
          activity: "Desk",
          subtitle: "",
          startTime: "09:00",
          endTime: "10:00",
          location: "Hall",
          description: "",
          slots: {
            general: { max: 0, filled: 0 },
            classRep: { max: 2, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
        {
          eventId: 3,
          activity: "Shop",
          subtitle: "",
          startTime: "10:00",
          endTime: "11:00",
          location: "Canteen",
          description: "",
          slots: {
            general: { max: 1, filled: 1 },
            classRep: { max: 0, filled: 0 },
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
          },
          signups: [],
        },
      ],
    },
    elements: {
      mobileActivityFilter: activityFilter,
      mobileTimeAvailabilityFilter: timeFilter,
      mobileTimeAvailabilityToggle: timeToggle,
      mobileRoleAvailabilityFilter: roleFilter,
      mobileKeywordSearch: createElement("input"),
      mobileTimeAvailabilityDetail: detail,
    },
  });

  client.buildGridIndexes();
  client.setMobileRoleFilter("general");
  client.setMobileAvailableTimeFilter("09:00");

  assert.equal(client.getMobileRoleFilter(), "general");
  assert.equal(roleFilter.children.length, 3);
  assert.equal(roleFilter.children[1].getAttribute("data-mobile-role-filter"), "general");
  assert.equal(roleFilter.children[1].className.includes("is-active"), true);
  assert.equal(roleFilter.children[2].getAttribute("data-mobile-role-filter"), "classRep");
  assert.deepEqual(Array.from(client.getMobileAvailableTimeFilters()), ["09:00"]);
  assert.equal(timeFilter.children.length, 2);
  assert.equal(
    timeFilter.children[1].getAttribute("data-mobile-time-filter"),
    "09:00",
  );
  assert.equal(timeFilter.children[1].className.includes("is-active"), true);
  assert.equal(timeFilter.children[1].children[1].textContent, "9:00 am - 10:00 am");
  assert.equal(timeToggle.textContent, "9:00 am - 10:00 am");
  assert.ok(detail.textContent.includes(client.ROLE_KEYS[0].label));

  client.setMobileAvailableTimeFilter("__all__");
  assert.equal(client.getMobileFilteredEvents().length, 2);

  client.setMobileActivityFilter("Desk");
  assert.equal(client.getMobileRoleFilter(), "__all__");
  assert.equal(roleFilter.children.length, 2);
  assert.equal(roleFilter.children[0].className.includes("is-active"), true);
  assert.equal(roleFilter.children[1].getAttribute("data-mobile-role-filter"), "classRep");
  assert.equal(client.getMobileFilteredEvents().length, 1);
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

test("name normalization in index.html converts full-width brackets", () => {
  const { exports: client } = loadClient();

  assert.equal(client.normaliseBrackets("Alice（parent）"), "Alice(parent)");
  assert.equal(client.normaliseNameValue(" 山田（太郎） "), "山田(太郎)");
  assert.equal(client.normaliseNameValue(" 山田 太郎 "), "山田太郎");
  assert.equal(client.normaliseNameValue("山田\u3000太郎"), "山田太郎");
  assert.equal(client.normaliseNameValue("山田\u2002太郎"), "山田太郎");
  assert.equal(client.normaliseNameValue(" John  Smith "), "John Smith");
  assert.equal(client.normaliseComparable("山田（太郎）"), "山田(太郎)");
  assert.equal(client.isValidNameValue("山田(太郎)"), true);
  assert.equal(client.isValidNameValue("山田（太郎）"), false);
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

test("index.html keeps signup validation inputs and uses a cancellation selection list", () => {
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
  const inputClassBlock = getInputBlock("inputClass");

  assert.ok(inputNameBlock);
  assert.ok(inputClassBlock);
  assert.doesNotMatch(inputNameBlock, /maxlength=/);
  assert.match(inputClassBlock, /maxlength="10"/);
  assert.match(htmlSource, /id="cancelSignupList"/);
  assert.doesNotMatch(htmlSource, /id="cancelName"/);
  assert.doesNotMatch(htmlSource, /id="cancelClass"/);
  assert.doesNotMatch(htmlSource, /id="cancelRole"/);
});

test("findAndConfirmCancel requires a selected signup", () => {
  const cancelMessage = createElement("div");
  cancelMessage.style = { display: "none" };

  const { exports: client } = loadClient({
    elements: {
      cancelMessage,
    },
  });

  client.findAndConfirmCancel();

  assert.equal(cancelMessage.textContent, "キャンセルする登録を選んでください。");
  assert.equal(cancelMessage.className, "modal-message error");
  assert.equal(cancelMessage.style.display, "block");
});

test("cancellation list renders existing signups and confirms the selected details", () => {
  const cancelSignupList = createElement("div");
  const cancelMessage = createElement("div");
  cancelMessage.style = { display: "none" };
  const confirmBox = createElement("div");
  confirmBox.style = { display: "none" };
  let confirmScrollOptions = null;
  confirmBox.scrollIntoView = function (options) {
    confirmScrollOptions = options;
  };
  const confirmText = createElement("div");
  const cancelSubmitBtn = createElement("button");

  const { exports: client, context } = loadClient({
    elements: {
      cancelSignupList,
      cancelMessage,
      confirmBox,
      confirmText,
      cancelSubmitBtn,
    },
  });
  context.currentEventId = 1;

  client.renderCancelSignupList();

  assert.equal(cancelSignupList.children.length, 2);
  assert.equal(cancelSignupList.children[0].children[0].textContent, "Alice");
  assert.equal(
    cancelSignupList.children[0].children[1].textContent,
    "1-1 · 一般保護者",
  );
  assert.equal(cancelSignupList.children[0].getAttribute("aria-pressed"), "false");

  cancelSignupList.dispatchEvent({
    type: "click",
    target: cancelSignupList.children[0].children[1],
  });

  assert.equal(cancelSignupList.children[0].classList.has("selected"), true);
  assert.equal(cancelSignupList.children[0].getAttribute("aria-pressed"), "true");
  assert.equal(cancelSignupList.children[1].getAttribute("aria-pressed"), "false");
  assert.equal(cancelSubmitBtn.disabled, false);

  client.findAndConfirmCancel();

  assert.equal(confirmText.children.length, 2);
  assert.equal(
    confirmText.children[0].textContent,
    "以下の登録を本当にキャンセルしますか？",
  );
  assert.equal(confirmText.children[0].className, "confirm-question");
  assert.equal(confirmText.children[1].className, "confirm-signup-summary");
  assert.equal(confirmText.children[1].children[0].textContent, "Alice");
  assert.equal(
    confirmText.children[1].children[1].textContent,
    "1-1 · 一般保護者",
  );
  assert.equal(confirmBox.style.display, "block");
  assert.equal(cancelSubmitBtn.style.display, "none");
  assert.equal(confirmScrollOptions.behavior, "smooth");
  assert.equal(confirmScrollOptions.block, "center");
  assert.equal(confirmScrollOptions.inline, "nearest");
});

test("confirmCancel sends the selected signup details to the existing backend", () => {
  const cancelSignupList = createElement("div");
  const selectedOption = createElement("button");
  cancelSignupList.appendChild(selectedOption);
  const confirmBox = createElement("div");
  confirmBox.style = { display: "block" };
  const confirmYes = createElement("button");
  const confirmNo = createElement("button");
  const cancelSubmitBtn = createElement("button");
  const cancelMessage = createElement("div");
  cancelMessage.style = { display: "none" };
  let receivedCancelArgs = null;
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
            cancelSignup(...args) {
              receivedCancelArgs = args;
              handler({ success: false, message: "Rejected by test." });
              return this;
            },
          };
        },
      },
    },
  };

  const { exports: client, context } = loadClient({
    elements: {
      cancelSignupList,
      confirmBox,
      confirmYes,
      confirmNo,
      cancelSubmitBtn,
      cancelMessage,
    },
    extraGlobals: {
      google,
    },
  });
  context.currentEventId = 1;
  client.selectCancelSignup(
    { name: "Alice", cls: "1-1", role: "一般保護者" },
    selectedOption,
  );

  client.confirmCancel();

  assert.deepEqual(Array.from(receivedCancelArgs), [
    1,
    "Alice",
    "1-1",
    "一般保護者",
    "test-alias",
  ]);
  assert.equal(cancelMessage.textContent, "Rejected by test.");
  assert.equal(confirmBox.style.display, "none");
  assert.equal(confirmYes.disabled, false);
  assert.equal(confirmNo.disabled, false);
  assert.equal(selectedOption.disabled, false);
});

test("cancellation selection updates only the previous and current options", () => {
  const cancelSignupList = createElement("div");
  const cancelSubmitBtn = createElement("button");
  const firstOption = createElement("button");
  const secondOption = createElement("button");
  const untouchedOption = createElement("button");
  cancelSignupList.appendChild(firstOption);
  cancelSignupList.appendChild(secondOption);
  cancelSignupList.appendChild(untouchedOption);

  const { exports: client } = loadClient({
    elements: {
      cancelSignupList,
      cancelSubmitBtn,
      cancelMessage: createElement("div"),
      confirmBox: createElement("div"),
    },
  });

  client.selectCancelSignup(
    { name: "Alice", cls: "1-1", role: "一般保護者" },
    firstOption,
  );
  client.selectCancelSignup(
    { name: "Bob", cls: "1-2", role: "学年委員" },
    secondOption,
  );

  assert.equal(firstOption.classList.has("selected"), false);
  assert.equal(firstOption.getAttribute("aria-pressed"), "false");
  assert.equal(secondOption.classList.has("selected"), true);
  assert.equal(secondOption.getAttribute("aria-pressed"), "true");
  assert.equal(untouchedOption.getAttribute("aria-pressed"), null);
});

test("registration tab restores role choices and resets retained modal scroll", () => {
  const roleButtons = createElement("div");
  const namesSection = createElement("div");
  const cancelSignupList = createElement("div");
  const modal = createElement("div");
  const { exports: client } = loadClient({
    elements: {
      ".modal": modal,
      modalTitle: createElement("div"),
      modalSubtitle: createElement("div"),
      namesSection,
      namesGroups: createElement("div"),
      roleButtons,
      modalForm: createElement("div"),
      inputName: createElement("input"),
      inputClass: createElement("input"),
      modalMessage: createElement("div"),
      modalOverlay: createElement("div"),
      cancelSignupList,
    },
  });

  client.openModal(1);
  modal.scrollTop = 120;
  cancelSignupList.scrollTop = 80;
  client.switchTab("cancel");

  assert.equal(roleButtons.style.display, "none");
  assert.equal(modal.scrollTop, 0);
  assert.equal(cancelSignupList.scrollTop, 0);

  modal.scrollTop = 90;
  namesSection.scrollTop = 60;
  client.switchTab("signup");

  assert.equal(roleButtons.style.display, "");
  assert.ok(roleButtons.children.length > 0);
  assert.equal(modal.scrollTop, 0);
  assert.equal(namesSection.scrollTop, 0);

  client.switchTab("cancel");
  client.openModal(1);

  assert.equal(roleButtons.style.display, "");
  assert.ok(roleButtons.children.length > 0);
});

test("cancellation list styling contains highlights inside the scroll area", () => {
  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.match(
    htmlSource,
    /\.cancel-signup-list\s*{[\s\S]*?scrollbar-gutter:\s*stable;/,
  );
  assert.match(
    htmlSource,
    /\.cancel-signup-option\s*{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?overflow:\s*hidden;[\s\S]*?touch-action:\s*manipulation;/,
  );
  assert.match(
    htmlSource,
    /\.cancel-signup-option\.selected\s*{[\s\S]*?box-shadow:\s*inset 0 0 0 1px #c62828;/,
  );
  assert.match(
    htmlSource,
    /@media \(hover:\s*hover\) and \(pointer:\s*fine\)\s*{[\s\S]*?\.cancel-signup-option:hover/,
  );
  assert.match(
    htmlSource,
    /\.cancel-signup-details\s*{[\s\S]*?overflow-wrap:\s*anywhere;/,
  );
});

test("cancellation confirmation prominently centres the selected signup", () => {
  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.match(
    htmlSource,
    /\.confirm-signup-summary\s*{[\s\S]*?border:\s*2px solid #c62828;[\s\S]*?text-align:\s*center;/,
  );
  assert.match(
    htmlSource,
    /\.confirm-signup-name\s*{[\s\S]*?font-size:\s*22px;[\s\S]*?font-weight:\s*800;/,
  );
  assert.match(
    htmlSource,
    /\.confirm-signup-details\s*{[\s\S]*?font-size:\s*16px;[\s\S]*?font-weight:\s*800;/,
  );
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

test("submitSignup normalises Japanese spacing and brackets before sending to backend", () => {
  const modalMessage = createElement("div");
  modalMessage.style = { display: "none" };
  const submitBtn = createElement("button");
  let receivedSignupArgs = null;
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
            submitSignup(...args) {
              receivedSignupArgs = args;
              handler({ success: false, message: "Rejected by test." });
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
      inputName: { ...createElement("input"), value: "山田　（太郎）" },
      inputClass: { ...createElement("input"), value: "1-1" },
      submitBtn,
      modalMessage,
    },
    extraGlobals: {
      google,
    },
  });

  context.PAGE_LOAD_TIME = Date.now() - 4000;
  context.currentEventId = 1;
  context.currentRole = client.ROLE_KEYS[0].label;

  client.submitSignup();

  assert.ok(receivedSignupArgs);
  assert.equal(receivedSignupArgs[1], "山田(太郎)");
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
          steeringCommittee: { max: 0, filled: 0 },
          orgCommittee: { max: 0, filled: 0 },
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

test("desktop reuses the responsive filters and card schedule", () => {
  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.match(
    htmlSource,
    /body\.desktop-layout\s*{[\s\S]*?background:\s*#f5f2ee;/,
  );
  assert.match(
    htmlSource,
    /\.schedule-controls\s*{[\s\S]*?display:\s*contents;/,
  );
  assert.match(
    htmlSource,
    /\.desktop-schedule-stats\s*{[\s\S]*?display:\s*none;/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout \.desktop-schedule-stats\s*{[\s\S]*?display:\s*grid;/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout \.mobile-availability-control\s*{[\s\S]*?display:\s*block;[\s\S]*?border-radius:\s*16px;/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout \.schedule-controls\s*{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*84px;[\s\S]*?z-index:\s*20;/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout \.mobile-activity-filter-field\s*{[\s\S]*?grid-column:\s*1\s*\/\s*span 7;/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout \.mobile-role-filter-field\s*{[\s\S]*?grid-column:\s*8\s*\/\s*-1;/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout \.mobile-activity-filter-pills,[\s\S]*?body\.desktop-layout \.mobile-role-filter-pills\s*{[\s\S]*?flex-wrap:\s*wrap;/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout \.mobile-activity-filter-pill,[\s\S]*?body\.desktop-layout \.mobile-role-filter-pill\s*{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?white-space:\s*nowrap;/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout \.mobile-time-group\s*{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    htmlSource,
    /@media \(min-width:\s*1280px\)\s*{[\s\S]*?body\.desktop-layout \.mobile-time-group,[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    htmlSource,
    /body\.desktop-layout \.modal \.role-buttons\s*{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(htmlSource, /<main class="schedule-shell">/);
  assert.match(htmlSource, /id="mobileAvailabilityControl"/);
  assert.match(htmlSource, /id="mobileAgenda" class="mobile-agenda"/);
  assert.match(htmlSource, /id="desktopAvailableCount"/);
  assert.match(htmlSource, /id="desktopOpenRoleCount"/);
  assert.match(htmlSource, /id="desktopSignupCount"/);
  assert.doesNotMatch(htmlSource, /id="desktopScheduleView"/);
  assert.doesNotMatch(htmlSource, /id="grid"/);
  assert.doesNotMatch(htmlSource, /function buildGrid\(\)/);
});

test("desktop schedule summary counts open slots, roles, and registrations", () => {
  const availableCount = createElement("strong");
  const openRoleCount = createElement("strong");
  const signupCount = createElement("strong");
  const { exports: client } = loadClient({
    elements: {
      desktopAvailableCount: availableCount,
      desktopOpenRoleCount: openRoleCount,
      desktopSignupCount: signupCount,
    },
  });

  client.updateDesktopScheduleSummary();

  assert.equal(availableCount.textContent, 3);
  assert.equal(openRoleCount.textContent, 3);
  assert.equal(signupCount.textContent, 2);
});

test("mobile role filter active pills keep their role colour families", () => {
  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.match(
    htmlSource,
    /\.mobile-role-filter-pill\.role-general\.is-active\s*{[\s\S]*?background:\s*#267a32;/,
  );
  assert.match(
    htmlSource,
    /\.mobile-role-filter-pill\.role-classrep\.is-active\s*{[\s\S]*?background:\s*#b26a00;/,
  );
  assert.match(
    htmlSource,
    /\.mobile-role-filter-pill\.role-steeringcommittee\.is-active\s*{[\s\S]*?background:\s*#155fae;/,
  );
  assert.match(
    htmlSource,
    /\.mobile-role-filter-pill\.role-orgcommittee\.is-active\s*{[\s\S]*?background:\s*#681c8d;/,
  );
});

test("mobile tab and filter controls stay sticky in compact layout", () => {
  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.match(
    htmlSource,
    /body\.compact-layout \.mobile-display-mode-control\s*{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*0;/,
  );
  assert.match(
    htmlSource,
    /body\.compact-layout \.mobile-availability-control\s*{[\s\S]*?position:\s*sticky;/,
  );
  assert.match(
    htmlSource,
    /body\.compact-layout \.mobile-availability-control\s*{[\s\S]*?top:\s*80px;/,
  );
});

test("mobile sticky controls use opaque backing so cards do not show through", () => {
  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.match(
    htmlSource,
    /body\.compact-layout \.mobile-availability-control\s*{[\s\S]*?isolation:\s*isolate;[\s\S]*?background:\s*#faf8f5;/,
  );
  assert.match(
    htmlSource,
    /body\.compact-layout \.mobile-availability-control::before\s*{[\s\S]*?right:\s*-14px;[\s\S]*?left:\s*-14px;[\s\S]*?background:\s*#f5f2ee;/,
  );
  assert.match(
    htmlSource,
    /body\.compact-layout \.mobile-display-mode-control\s*{[\s\S]*?position:\s*sticky;[\s\S]*?isolation:\s*isolate;[\s\S]*?background:\s*#efebe5;/,
  );
  assert.match(
    htmlSource,
    /body\.compact-layout \.mobile-display-mode-control::before\s*{[\s\S]*?right:\s*-14px;[\s\S]*?left:\s*-14px;[\s\S]*?background:\s*#efebe5;/,
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
  client.setMobileDisplayMode("signup");
  client.buildMobileAgenda();

  const firstSection = mobileNode.children[0];
  const firstCard = firstSection.children[1];
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

test("buildMobileDayOverview renders a time-based day timeline", () => {
  const mobileNode = createElement("div");
  mobileNode.className = "mobile-agenda";
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
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
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
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
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
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
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
  client.setMobileDisplayMode("overview");
  client.buildMobileAgenda();

  const timeline = mobileNode.children[0];
  const firstTimeBlock = timeline.children[0];
  const secondTimeBlock = timeline.children[1];
  const firstItem = firstTimeBlock.children[1].children[0];
  const secondItem = secondTimeBlock.children[1].children[0];

  assert.equal(mobileNode.className, "mobile-agenda mobile-display-by-overview");
  assert.equal(timeline.className, "mobile-overview-timeline");
  assert.equal(timeline.children.length, 3);
  assert.equal(firstTimeBlock.children[0].textContent, "9:30 am - 10:00 am");
  assert.equal(firstItem.className.includes("mobile-overview-item"), true);
  assert.equal(firstItem.className.includes("activity-accent-0"), true);
  assert.equal(secondItem.className.includes("activity-accent-1"), true);
  assert.equal(firstItem.children[0].children[0].textContent, "Bake Sale");
  assert.equal(firstItem.children[1].className, "mobile-overview-role-chips");
  assert.equal(firstItem.children[1].children[0].textContent, "\u52DF\u96C6\u4E2D");
  assert.equal(
    firstItem.children[1].children[1].className,
    "mobile-overview-role-chip role-general",
  );
  assert.equal(
    firstItem.children[1].children[1].textContent,
    client.ROLE_KEYS[0].label + " 1",
  );
  assert.equal(secondTimeBlock.children[0].textContent, "10:00 am - 10:30 am");
  assert.equal(secondItem.children[0].children[0].textContent, "Games");
});

test("mobile day overview keeps activity accent colours in compact layout", () => {
  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.match(
    htmlSource,
    /body\.compact-layout \.mobile-overview-item\.activity-accent-0\s*{[\s\S]*?border-left-color:\s*#e87b45;/,
  );
  assert.match(
    htmlSource,
    /body\.compact-layout \.mobile-overview-item\.activity-accent-1\s*{[\s\S]*?border-left-color:\s*#3b82a0;/,
  );
});

test("mobile display mode maps the old activity preference to overview", () => {
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

  assert.equal(client.getMobileDisplayMode(), "overview");
  assert.equal(activityBtn.getAttribute("aria-pressed"), "true");
  assert.equal(timeBtn.getAttribute("aria-pressed"), "false");
  assert.equal(activityBtn.classList.has("active"), true);
  assert.equal(timeBtn.classList.has("active"), false);
});

test("mobile display mode defaults to signup when no preference is saved", () => {
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

  assert.equal(client.getMobileDisplayMode(), "signup");
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
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
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
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
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
            steeringCommittee: { max: 0, filled: 0 },
            orgCommittee: { max: 0, filled: 0 },
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

  assert.equal(storage.getItem("signupApp.mobileDisplayMode"), "signup");
  assert.equal(mobileNode.className, "mobile-agenda mobile-display-by-signup");
  assert.equal(mobileNode.children.length, 2);
  assert.equal(firstTimeSection.children[0].className, "mobile-time-heading");
  assert.equal(firstTimeSection.children[0].textContent, "9:30 am - 10:00 am");
  assert.equal(getTitleWrap(firstCard).children[0].textContent, "Bake Sale");
  assert.equal(getTitleWrap(firstCard).children[1].className, "mobile-slot-time");
  assert.equal(getTitleWrap(firstCard).children[1].textContent, "9:30 am - 10:00 am");
  assert.equal(getTitleWrap(firstCard).children[2].className, "mobile-slot-meta");
  assert.equal(getTitleWrap(secondCard).children[0].textContent, "Games");
  assert.equal(secondTimeSection.children[0].textContent, "10:00 am - 10:30 am");
});

test("renderResponsiveView only changes responsive classes for the shared view", () => {
  const { exports: client, context } = loadClient({
    windowOverrides: {
      innerWidth: 800,
      screen: { width: 820 },
      visualViewport: { width: 790 },
    },
  });

  client.renderResponsiveView();

  assert.equal(context.document.body.classList.has("compact-layout"), true);
  assert.equal(context.document.body.classList.has("desktop-layout"), false);

  context.window.innerWidth = 1200;
  context.window.screen.width = 1280;
  context.window.visualViewport.width = 1100;
  client.renderResponsiveView();

  assert.equal(context.document.body.classList.has("compact-layout"), false);
  assert.equal(context.document.body.classList.has("desktop-layout"), true);
});
