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

function memoryDrafts() {
  var records = {};
  return {
    records: records,
    load: function (key, callback) { callback(records[key] || null); },
    save: function (key, value, callback) {
      records[key] = JSON.parse(JSON.stringify(value));
      if (callback) callback();
    },
    remove: function (key, callback) {
      delete records[key];
      if (callback) callback();
    },
  };
}

function snapshot(sequence) {
  return {
    ok: true,
    pairingId: "pair-next",
    projectLabel: "Webapp",
    sessionLabel: "Live UI work",
    connected: true,
    selecting: false,
    submitting: false,
    acceptedSequence: sequence || 0,
    selection: null,
    composeError: "",
    reports: [],
    counts: {},
    aggregateStatus: "",
    hmr: {},
  };
}

function workspace(drafts, sent) {
  var refs = elements();
  var context = {
    document: {
      getElementById: function (id) { return refs[id]; },
      createElement: function () { return fakeElement("created"); },
    },
    FileReader: function () {
      this.readAsDataURL = function (file) {
        this.onload({ target: { result: file.dataUrl } });
      };
      this.readAsText = function (file) {
        this.onload({ target: { result: file.text } });
      };
    },
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
    drafts: drafts,
    command: function (action, payload, callback) {
      sent.push({ action: action, payload: payload });
      callback({ ok: true });
    },
  });
  return { refs: refs, workspace: value };
}

test("composer text, pasted screenshots, and pasted context survive panel recreation", function () {
  var drafts = memoryDrafts();
  var firstSent = [];
  var first = workspace(drafts, firstSent);
  first.workspace.setDraftKey("tab-43:webapp:session-31");
  first.workspace.render(snapshot(0));
  first.refs.reportInput.value = "Keep the sidebar above the table";
  first.refs.reportInput.dispatch("input");
  first.refs.reportInput.dispatch("paste", {
    preventDefault: function () {},
    clipboardData: {
      files: [{
        type: "image/png",
        size: 12,
        name: "sidebar.png",
        dataUrl: "data:image/png;base64,aW1hZ2U=",
      }],
    },
  });
  first.refs.reportInput.dispatch("paste", {
    preventDefault: function () {},
    clipboardData: {
      files: [],
      getData: function () { return new Array(501).join("context "); },
    },
  });

  var secondSent = [];
  var second = workspace(drafts, secondSent);
  second.workspace.setDraftKey("tab-43:webapp:session-31");
  second.workspace.render(snapshot(0));
  assert.strictEqual(second.refs.reportInput.value,
    "Keep the sidebar above the table");
  second.refs.reportButton.dispatch("click");
  assert.strictEqual(secondSent.length, 1);
  assert.strictEqual(secondSent[0].action, "report.submit");
  assert.strictEqual(secondSent[0].payload.attachments.images.length, 1);
  assert.strictEqual(secondSent[0].payload.attachments.pastes.length, 1);
});

test("temporary disconnect preserves a draft and accepted submission clears it", function () {
  var drafts = memoryDrafts();
  var sent = [];
  var harness = workspace(drafts, sent);
  var key = "tab-43:webapp:session-31";
  harness.workspace.setDraftKey(key);
  harness.workspace.render(snapshot(0));
  harness.refs.reportInput.value = "Do not lose this while reconnecting";
  harness.refs.reportInput.dispatch("input");
  harness.workspace.reset();
  assert.ok(drafts.records[key]);
  assert.strictEqual(harness.refs.reportInput.value,
    "Do not lose this while reconnecting");

  harness.workspace.render(snapshot(0));
  harness.workspace.render(snapshot(1));
  assert.strictEqual(drafts.records[key], undefined);
  assert.strictEqual(harness.refs.reportInput.value, "");
});

test("DevTools panel scopes drafts to the stable tab, project, and session", function () {
  var panel = fs.readFileSync(path.join(__dirname, "..", "devtools-panel.js"), "utf8");
  assert.match(panel, /liveUiWorkspace\.setDraftRoute\(pairing\)/);
  assert.match(panel, /liveUiWorkspace\.discardDraft\(\)/);
  var html = fs.readFileSync(path.join(__dirname, "..", "devtools-panel.html"), "utf8");
  assert.match(html, /devtools-live-drafts\.js/);
});
