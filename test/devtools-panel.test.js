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
    style: { setProperty: function () {} },
    children: [],
    classList: {
      add: function (name) { classes[name] = true; },
      remove: function (name) { delete classes[name]; },
      contains: function (name) { return !!classes[name]; },
    },
    appendChild: function (child) {
      element.children.push(child);
      if (!value && child.value !== undefined) value = String(child.value);
    },
    setAttribute: function (name, next) { element[name] = String(next); },
    addEventListener: function (name, listener) { listeners[name] = listener; },
    dispatch: function (name, event) { listeners[name](event || {}); },
    click: function () { if (listeners.click) listeners.click({}); },
    focus: function () { element.focused = true; },
  };
  Object.defineProperty(element, "value", {
    get: function () { return value; },
    set: function (next) { value = String(next); },
  });
  Object.defineProperty(element, "innerHTML", {
    get: function () { return ""; },
    set: function () { element.children = []; value = ""; },
  });
  return element;
}

function panelHarness(options) {
  options = options || {};
  var ids = [
    "connectionBadge", "connectionLabel", "targetTitle", "targetUrl",
    "tabNumber", "projectSelect", "sessionSelect", "startButton",
    "exitButton", "panelStatus", "setupWorkspace", "liveWorkspace",
    "liveSession", "liveProject", "liveAggregateDot", "liveAggregateLabel",
    "selectedCard", "emptySelectionCard", "selectedTitle", "selectedSource",
    "selectedElement", "selectedChain", "clearSelectionButton", "pickButton",
    "hmrStatus", "hmrLabel", "reportCount", "reportList", "emptyReports",
    "followupTarget", "followupLabel", "newIssueButton", "reportInput",
    "reportError", "reportButton",
    "attachmentList",
  ];
  var elements = {};
  for (var i = 0; i < ids.length; i++) elements[ids[i]] = fakeElement(ids[i]);
  var messages = [];
  var state = options.state || {
    ok: true,
    activeTab: { id: 43, title: "Account", url: "http://localhost:4242/account" },
    controls: [{
      controlTabId: 7,
      serverOrigin: "http://localhost:2633",
      currentProjectSlug: "clay",
      projects: [{
        projectSlug: "clay",
        projectLabel: "Clay",
        sessionsLoaded: true,
        sessions: [{ id: 12, title: "Live UI work", coordinationMode: true }],
      }],
    }],
    pairings: [],
    recentPairings: [],
    status: null,
  };
  var context = {
    chrome: {
      devtools: { inspectedWindow: { tabId: 43 } },
      runtime: {
        lastError: null,
        sendMessage: function (message, callback) {
          messages.push(message);
          if (message.type === "live_ui_picker_get_state") callback(state);
          else if (message.type === "live_ui_devtools_command" &&
              message.action === "snapshot") callback(options.snapshot || { ok: false });
          else callback({ ok: true });
        },
      },
    },
    document: {
      activeElement: null,
      getElementById: function (id) { return elements[id]; },
      createElement: function () { return fakeElement("option"); },
    },
    window: { addEventListener: function () {} },
    setInterval: function () { return 1; },
    clearInterval: function () {},
    setTimeout: function () { return 1; },
    FileReader: function () {
      this.readAsDataURL = function (file) {
        this.onload({ target: { result: file.dataUrl } });
      };
      this.readAsText = function (file) {
        this.onload({ target: { result: file.text } });
      };
    },
    URL: URL,
  };
  var source = fs.readFileSync(path.join(
    __dirname, "..", "devtools-live-attachments.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(
    __dirname, "..", "devtools-live-workspace.js"), "utf8") + "\n" +
    fs.readFileSync(path.join(__dirname, "..", "devtools-panel.js"), "utf8");
  vm.runInNewContext(source, context);
  return { elements: elements, messages: messages };
}

test("DevTools entrypoint creates a Clay panel", function () {
  var created = null;
  var source = fs.readFileSync(path.join(__dirname, "..", "devtools.js"), "utf8");
  vm.runInNewContext(source, {
    chrome: {
      runtime: { lastError: null },
      devtools: { panels: { create: function (title, icon, page, callback) {
        created = { title: title, icon: icon, page: page };
        callback();
      } } },
    },
  });
  assert.deepStrictEqual(created, {
    title: "Clay",
    icon: "icons/icon-48.png",
    page: "devtools-panel.html",
  });
});

test("active DevTools workspace owns selection and report controls", function () {
  var state = {
    ok: true,
    activeTab: { id: 43, title: "Account", url: "http://localhost:4242/account" },
    controls: [],
    pairings: [{
      pairingId: "pair-1",
      targetTabId: 43,
      projectLabel: "Webapp",
      sessionLabel: "Fix account page",
    }],
    recentPairings: [],
    status: null,
  };
  var harness = panelHarness({
    state: state,
    snapshot: {
      ok: true,
      pairingId: "pair-1",
      projectLabel: "Webapp",
      sessionLabel: "Fix account page",
      connected: true,
      selecting: false,
      submitting: false,
      acceptedSequence: 0,
      selection: {
        title: "AccountClock",
        source: "src/AccountClock.jsx:17",
        element: "<button> · “Time”",
        chain: "App › AccountClock",
      },
      composeError: "",
      reports: [],
      counts: {},
      aggregateStatus: "",
      hmr: { status: "ready", message: "Fast Refresh ready" },
    },
  });
  assert.strictEqual(harness.elements.selectedTitle.textContent, "AccountClock");
  assert.strictEqual(harness.elements.liveSession.textContent, "Fix account page");
  assert.strictEqual(harness.elements.setupWorkspace.classList.contains("hidden"), true);

  harness.elements.pickButton.dispatch("click");
  var pick = harness.messages.filter(function (message) {
    return message.type === "live_ui_devtools_command" &&
      message.action === "selection.pick";
  })[0];
  assert.ok(pick);
  assert.strictEqual(pick.pairingId, "pair-1");
  assert.strictEqual(pick.targetTabId, 43);

  harness.elements.reportInput.value = "Increase the clock contrast";
  harness.elements.reportButton.dispatch("click");
  var report = harness.messages.filter(function (message) {
    return message.type === "live_ui_devtools_command" &&
      message.action === "report.submit";
  })[0];
  assert.ok(report);
  assert.strictEqual(report.payload.text, "Increase the clock contrast");
});

test("DevTools composer sends pasted screenshots and long text", function () {
  var state = {
    ok: true,
    activeTab: { id: 43, title: "Account", url: "http://localhost:4242/account" },
    controls: [],
    pairings: [{ pairingId: "pair-1", targetTabId: 43 }],
    recentPairings: [],
    status: null,
  };
  var snapshot = {
    ok: true,
    pairingId: "pair-1",
    connected: true,
    reports: [],
    counts: {},
    hmr: {},
  };
  var harness = panelHarness({ state: state, snapshot: snapshot });
  var prevented = 0;
  harness.elements.reportInput.dispatch("paste", {
    clipboardData: {
      files: [{
        name: "screen.png",
        type: "image/png",
        size: 12,
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      }],
      items: [],
      getData: function () { return ""; },
    },
    preventDefault: function () { prevented++; },
  });
  harness.elements.reportInput.dispatch("paste", {
    clipboardData: {
      files: [],
      items: [],
      getData: function () { return "log line\n".repeat(80); },
    },
    preventDefault: function () { prevented++; },
  });
  harness.elements.reportButton.dispatch("click");
  var report = harness.messages.filter(function (message) {
    return message.type === "live_ui_devtools_command" &&
      message.action === "report.submit";
  })[0];
  assert.strictEqual(prevented, 2);
  assert.strictEqual(report.payload.attachments.images.length, 1);
  assert.strictEqual(report.payload.attachments.images[0].mediaType, "image/png");
  assert.strictEqual(report.payload.attachments.pastes.length, 1);
  assert.match(report.payload.attachments.pastes[0], /log line/);
});

test("panel routes state and pairing to the exact inspected tab", function () {
  var harness = panelHarness();
  assert.strictEqual(harness.messages[0].type, "live_ui_picker_get_state");
  assert.strictEqual(harness.messages[0].targetTabId, 43);
  assert.strictEqual(harness.elements.targetTitle.textContent, "Account");
  assert.strictEqual(harness.elements.projectSelect.children[0].textContent, "Clay");
  assert.match(harness.elements.sessionSelect.children[0].textContent, /Coordinator/);

  harness.elements.startButton.dispatch("click");
  var pair = harness.messages.filter(function (message) {
    return message.type === "live_ui_picker_pair";
  })[0];
  assert.ok(pair);
  assert.strictEqual(pair.targetTabId, 43);
  assert.strictEqual(pair.projectSlug, "clay");
  assert.strictEqual(pair.sessionId, 12);
});

test("DevTools surface stays bounded and avoids browser-side settings", function () {
  var root = path.join(__dirname, "..");
  var manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  var html = fs.readFileSync(path.join(root, "devtools-panel.html"), "utf8");
  var panel = fs.readFileSync(path.join(root, "devtools-panel.js"), "utf8");
  var workspace = fs.readFileSync(
    path.join(root, "devtools-live-workspace.js"), "utf8");
  var attachments = fs.readFileSync(
    path.join(root, "devtools-live-attachments.js"), "utf8");
  var entry = fs.readFileSync(path.join(root, "devtools.js"), "utf8");
  var target = fs.readFileSync(path.join(root, "live-ui-picker-target.js"), "utf8");
  var background = fs.readFileSync(path.join(root, "background.js"), "utf8");
  assert.strictEqual(manifest.devtools_page, "devtools.html");
  assert.ok(html.indexOf("projectSelect") < html.indexOf("sessionSelect"));
  assert.match(html, /Screenshot/);
  assert.match(html, /Console/);
  assert.match(html, /Network/);
  assert.match(html, /Selected component/);
  assert.match(html, /Worker changes/);
  assert.match(html, /Pick component/);
  assert.match(html, /Describe the issue or change/);
  assert.match(html, /Paste screenshots, images, long text/);
  assert.match(panel, /chrome\.devtools\.inspectedWindow\.tabId/);
  assert.match(panel, /targetTabId: inspectedTabId/);
  assert.match(panel, /live_ui_devtools_command/);
  assert.match(workspace, /report\.submit/);
  assert.match(workspace, /report\.approve/);
  assert.match(attachments, /addEventListener\("paste"/);
  assert.doesNotMatch(html + workspace, /collapse|expand/i);
  assert.match(panel, /document\.activeElement === sessionSelect/);
  assert.match(panel, /projectActive = document\.activeElement === projectSelect/);
  assert.match(entry, /chrome\.devtools\.panels\.create/);
  assert.ok(background.indexOf("live-ui-picker-target.js") <
    background.indexOf("live-ui-picker-background.js"));
  assert.match(background, /live-ui-devtools-background\.js/);
  assert.ok(panel.split("\n").length < 500);
  assert.ok(workspace.split("\n").length < 500);
  assert.ok(attachments.split("\n").length < 500);
  assert.ok(target.split("\n").length < 500);
  assert.doesNotMatch(panel, /localStorage/);
  assert.doesNotMatch(panel + workspace + attachments + entry + target,
    /\b(?:const|let)\b|=>/);
});
