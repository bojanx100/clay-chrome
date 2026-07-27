var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var pickerModule = require("../live-ui-picker-background");

function harness() {
  var portMessages = [];
  var exitCalls = [];
  var ports = {
    7: {
      postMessage: function (message) { portMessages.push(message); },
    },
  };
  var tabs = [
    { id: 7, url: "http://100.100.10.20:2633/p/clay/", title: "Clay" },
    { id: 42, url: "http://100.100.10.20:4242/pricing", title: "Pricing" },
  ];
  var chromeApi = {
    runtime: { id: "extension-a", lastError: null },
    tabs: {
      query: function (query, callback) {
        callback(query.active ? [tabs[1]] : tabs);
      },
    },
    scripting: {
      executeScript: function (options, callback) { callback(); },
    },
  };
  var runtime = {
    getPairings: function () { return []; },
    exitPairing: function (pairingId, callback) {
      exitCalls.push(pairingId);
      callback({ ok: true });
    },
  };
  var picker = pickerModule.createPicker(
    chromeApi,
    runtime,
    function (tabId) { return ports[tabId] || null; },
    function () { return Object.keys(ports); }
  );
  picker.handlePortMessage(7, {
    type: "clay_live_ui_identity",
    identity: {
      serverOrigin: "http://100.100.10.20:2633",
      projectSlug: "clay",
      projectLabel: "Clay",
      sessions: [
        { id: 11, title: "Live UI work", active: true },
        { id: 12, title: "Other chat", active: false },
      ],
    },
  });
  return {
    picker: picker,
    runtime: runtime,
    portMessages: portMessages,
    exitCalls: exitCalls,
  };
}

test("picker exposes connected Clay sessions and the active target tab", function () {
  var state = harness();
  var response = null;
  assert.strictEqual(state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
  }, function (value) { response = value; }), true);
  assert.strictEqual(response.activeTab.id, 42);
  assert.strictEqual(response.controls.length, 1);
  assert.strictEqual(response.controls[0].projectSlug, "clay");
  assert.strictEqual(response.controls[0].sessions[0].title, "Live UI work");
});

test("picker pins the active web tab to an explicitly selected session", function () {
  var state = harness();
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_pair",
    controlTabId: 7,
    sessionId: 12,
  }, function (value) { response = value; });
  assert.strictEqual(response.ok, true);
  var request = state.portMessages.filter(function (message) {
    return message.type === "clay_live_ui_picker_pair_request";
  })[0];
  assert.ok(request);
  assert.strictEqual(request.targetTabId, 42);
  assert.strictEqual(request.sessionId, 12);
  assert.strictEqual(request.extensionId, "extension-a");
  assert.ok(request.tabs.some(function (tab) { return tab.id === 42; }));
});

test("picker rejects stale session claims and routes explicit exit", function () {
  var state = harness();
  var pairResponse = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_pair",
    controlTabId: 7,
    sessionId: 999,
  }, function (value) { pairResponse = value; });
  assert.strictEqual(pairResponse.ok, false);
  assert.match(pairResponse.error, /no longer available/);

  var exitResponse = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_exit",
    pairingId: "pair-1",
  }, function (value) { exitResponse = value; });
  assert.deepStrictEqual(state.exitCalls, ["pair-1"]);
  assert.deepStrictEqual(exitResponse, { ok: true });
});

test("picker implementation stays bounded and avoids credential storage", function () {
  var source = fs.readFileSync(
    path.join(__dirname, "..", "live-ui-picker-background.js"),
    "utf8"
  );
  var popup = fs.readFileSync(
    path.join(__dirname, "..", "live-ui-popup.js"),
    "utf8"
  );
  assert.ok(source.split("\n").length < 500);
  assert.ok(popup.split("\n").length < 500);
  assert.doesNotMatch(source, /storage\.local/);
  assert.doesNotMatch(popup, /localStorage/);
});
