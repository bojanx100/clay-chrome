var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

function fakeElement(id) {
  var listeners = {};
  var classes = {};
  var value = "";
  var element = {
    id: id,
    textContent: "",
    className: "",
    disabled: false,
    checked: false,
    children: [],
    style: { setProperty: function () {} },
    classList: {
      add: function (name) { classes[name] = true; },
      remove: function (name) { delete classes[name]; },
      contains: function (name) { return !!classes[name]; },
    },
    appendChild: function (child) { element.children.push(child); },
    setAttribute: function (name, next) { element[name] = String(next); },
    addEventListener: function (name, listener) { listeners[name] = listener; },
    dispatch: function (name, event) { listeners[name](event || {}); },
    click: function () { if (listeners.click) listeners.click({}); },
    focus: function () {},
  };
  Object.defineProperty(element, "value", {
    get: function () { return value; },
    set: function (next) { value = String(next); },
  });
  Object.defineProperty(element, "innerHTML", {
    get: function () { return ""; },
    set: function () { element.children = []; },
  });
  return element;
}

function elements() {
  var ids = [
    "liveWorkspace", "liveSession", "liveProject", "liveAggregateDot",
    "liveAggregateLabel", "selectedCard", "emptySelectionCard", "selectedTitle",
    "selectedSource", "selectedElement", "selectedChain", "clearSelectionButton",
    "pickButton", "hmrStatus", "hmrLabel", "reportCount", "reportList",
    "emptyReports", "followupTarget", "followupLabel", "newIssueButton",
    "reportInput", "attachmentList", "reportError", "reportButton",
    "showAllWorkers",
  ];
  var result = {};
  for (var i = 0; i < ids.length; i++) result[ids[i]] = fakeElement(ids[i]);
  return result;
}

function memoryPreferences(records) {
  return {
    records: records,
    load: function (key, callback) {
      callback(Object.prototype.hasOwnProperty.call(records, key) ?
        records[key] : null);
    },
    save: function (key, value) { records[key] = value; },
  };
}

function deferredPreferences(records) {
  var pending = [];
  return {
    records: records,
    release: function () {
      var waiting = pending.slice();
      pending = [];
      for (var i = 0; i < waiting.length; i++) waiting[i]();
    },
    load: function (key, callback) {
      // A real storage read observes the value as of when the read STARTED,
      // not when it resolves. Snapshot it here or the race cannot reproduce.
      var value = Object.prototype.hasOwnProperty.call(records, key) ?
        records[key] : null;
      pending.push(function () { callback(value); });
    },
    save: function (key, value) { records[key] = value; },
  };
}

function snapshot(showAllWorkers) {
  return {
    ok: true,
    pairingId: "pair-1",
    projectLabel: "Webapp",
    sessionLabel: "Live UI work",
    connected: true,
    selecting: false,
    submitting: false,
    acceptedSequence: 0,
    selection: null,
    composeError: "",
    reports: [],
    counts: {},
    aggregateStatus: "",
    showAllWorkers: showAllWorkers === true,
    hmr: {},
  };
}

function workspace(preferences, sent, targetState) {
  var refs = elements();
  var context = {
    document: {
      getElementById: function (id) { return refs[id]; },
      createElement: function () { return fakeElement("created"); },
    },
    FileReader: function () {},
    setTimeout: function (handler) { handler(); return 1; },
    clearTimeout: function () {},
  };
  context.globalThis = context;
  var source = fs.readFileSync(path.join(
    __dirname, "..", "devtools-live-attachments.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(
      __dirname, "..", "devtools-live-workspace.js"), "utf8");
  vm.runInNewContext(source, context);
  var value = context.ClayLiveUiDevtoolsWorkspace.create({
    preferences: preferences,
    command: function (action, payload, callback) {
      sent.push({ action: action, showAll: payload.showAll });
      if (action !== "report.showAll") return callback({ ok: true });
      if (targetState.reject) return callback({ ok: false, error: "no" });
      targetState.showAll = payload.showAll;
      callback(snapshot(targetState.showAll));
    },
  });
  return { refs: refs, workspace: value };
}

test("the highlight-all toggle is off until the user turns it on", function () {
  var sent = [];
  var harness = workspace(memoryPreferences({}), sent, { showAll: false });
  harness.workspace.render(snapshot(false));
  assert.strictEqual(harness.refs.showAllWorkers.checked, false);
  assert.strictEqual(sent.length, 0);
});

test("turning the toggle on tells the inspected page to highlight every worker", function () {
  var sent = [];
  var harness = workspace(memoryPreferences({}), sent, { showAll: false });
  harness.workspace.render(snapshot(false));
  harness.refs.showAllWorkers.checked = true;
  harness.refs.showAllWorkers.dispatch("change");
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].action, "report.showAll");
  assert.strictEqual(sent[0].showAll, true);
});

test("turning the toggle back off restores picked-worker-only highlighting", function () {
  var sent = [];
  var targetState = { showAll: false };
  var harness = workspace(memoryPreferences({}), sent, targetState);
  harness.workspace.render(snapshot(false));
  harness.refs.showAllWorkers.checked = true;
  harness.refs.showAllWorkers.dispatch("change");
  harness.refs.showAllWorkers.checked = false;
  harness.refs.showAllWorkers.dispatch("change");
  assert.strictEqual(targetState.showAll, false);
  assert.strictEqual(sent.length, 2);
  assert.strictEqual(sent[1].showAll, false);
});

test("the toggle choice survives reopening the panel", function () {
  var records = {};
  var first = workspace(memoryPreferences(records), [], { showAll: false });
  first.workspace.render(snapshot(false));
  first.refs.showAllWorkers.checked = true;
  first.refs.showAllWorkers.dispatch("change");

  var sent = [];
  var second = workspace(memoryPreferences(records), sent, { showAll: false });
  assert.strictEqual(second.refs.showAllWorkers.checked, true);
  second.workspace.render(snapshot(false));
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].showAll, true);
});

test("a reloaded page is told the stored toggle choice again", function () {
  var sent = [];
  var harness = workspace(memoryPreferences({ liveUiShowAllWorkers: true }),
    sent, { showAll: false });
  harness.workspace.render(snapshot(false));
  harness.workspace.reset();
  harness.workspace.render(snapshot(false));
  assert.strictEqual(sent.length, 2);
  assert.strictEqual(sent[1].showAll, true);
});

test("an agreeing page is not told the toggle choice again", function () {
  var sent = [];
  var harness = workspace(memoryPreferences({ liveUiShowAllWorkers: true }),
    sent, { showAll: true });
  harness.workspace.render(snapshot(true));
  harness.workspace.render(snapshot(true));
  assert.strictEqual(sent.length, 0);
});

test("a page that rejects the toggle is not retried in a loop", function () {
  var sent = [];
  var harness = workspace(memoryPreferences({ liveUiShowAllWorkers: true }),
    sent, { showAll: false, reject: true });
  for (var i = 0; i < 5; i++) harness.workspace.render(snapshot(false));
  assert.strictEqual(sent.length, 1);
});

test("a disconnected page is not sent the toggle choice", function () {
  var sent = [];
  var harness = workspace(memoryPreferences({ liveUiShowAllWorkers: true }),
    sent, { showAll: false });
  var offline = snapshot(false);
  offline.connected = false;
  harness.workspace.render(offline);
  assert.strictEqual(sent.length, 0);
});

test("a slow storage read does not clobber a choice made while it loaded", function () {
  var records = { liveUiShowAllWorkers: true };
  var preferences = deferredPreferences(records);
  var sent = [];
  var harness = workspace(preferences, sent, { showAll: false });

  // The user toggles on, then off, before the stored value ever arrives.
  harness.refs.showAllWorkers.checked = true;
  harness.refs.showAllWorkers.dispatch("change");
  harness.refs.showAllWorkers.checked = false;
  harness.refs.showAllWorkers.dispatch("change");

  preferences.release();

  assert.strictEqual(harness.refs.showAllWorkers.checked, false);
  assert.strictEqual(records.liveUiShowAllWorkers, false);
});

test("a slow storage read still applies when the user has not chosen", function () {
  var preferences = deferredPreferences({ liveUiShowAllWorkers: true });
  var harness = workspace(preferences, [], { showAll: false });
  assert.strictEqual(harness.refs.showAllWorkers.checked, false);
  preferences.release();
  assert.strictEqual(harness.refs.showAllWorkers.checked, true);
});
