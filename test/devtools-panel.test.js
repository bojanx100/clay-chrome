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
    classList: {
      add: function (name) { classes[name] = true; },
      remove: function (name) { delete classes[name]; },
      contains: function (name) { return !!classes[name]; },
    },
    appendChild: function (child) {
      element.children.push(child);
      if (!value && child.value !== undefined) value = String(child.value);
    },
    addEventListener: function (name, listener) { listeners[name] = listener; },
    dispatch: function (name) { listeners[name](); },
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

function panelHarness() {
  var ids = [
    "connectionBadge", "connectionLabel", "targetTitle", "targetUrl",
    "tabNumber", "projectSelect", "sessionSelect", "startButton",
    "exitButton", "panelStatus", "inactiveView", "activeView",
    "activeSession", "activeProject", "activeRouteLabel",
  ];
  var elements = {};
  for (var i = 0; i < ids.length; i++) elements[ids[i]] = fakeElement(ids[i]);
  var messages = [];
  var state = {
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
          callback(message.type === "live_ui_picker_get_state" ? state : { ok: true });
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
    URL: URL,
  };
  var source = fs.readFileSync(
    path.join(__dirname, "..", "devtools-panel.js"), "utf8");
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
  var entry = fs.readFileSync(path.join(root, "devtools.js"), "utf8");
  var target = fs.readFileSync(path.join(root, "live-ui-picker-target.js"), "utf8");
  var background = fs.readFileSync(path.join(root, "background.js"), "utf8");
  assert.strictEqual(manifest.devtools_page, "devtools.html");
  assert.ok(html.indexOf("projectSelect") < html.indexOf("sessionSelect"));
  assert.match(html, /Screenshot/);
  assert.match(html, /Console/);
  assert.match(html, /Network/);
  assert.match(panel, /chrome\.devtools\.inspectedWindow\.tabId/);
  assert.match(panel, /targetTabId: inspectedTabId/);
  assert.match(panel, /document\.activeElement === sessionSelect/);
  assert.match(panel, /projectActive = document\.activeElement === projectSelect/);
  assert.match(entry, /chrome\.devtools\.panels\.create/);
  assert.ok(background.indexOf("live-ui-picker-target.js") <
    background.indexOf("live-ui-picker-background.js"));
  assert.ok(panel.split("\n").length < 500);
  assert.ok(target.split("\n").length < 500);
  assert.doesNotMatch(panel, /localStorage/);
  assert.doesNotMatch(panel + entry + target, /\b(?:const|let)\b|=>/);
});
