var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var pickerModule = require("../live-ui-picker-background");

function harness() {
  var portMessages = [];
  var exitCalls = [];
  var updateCalls = [];
  var scriptCalls = [];
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
      update: function (tabId, options, callback) {
        updateCalls.push({ tabId: tabId, options: options });
        callback(tabs[0]);
      },
    },
    scripting: {
      executeScript: function (options, callback) {
        scriptCalls.push(options);
        callback();
      },
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
      currentProjectSlug: "clay",
      projectLabel: "Clay",
      sessions: [
        { id: 11, title: "Live UI work", active: true },
        { id: 12, title: "Other chat", active: false },
      ],
      projects: [
        {
          projectSlug: "clay",
          projectLabel: "Clay",
          sessions: [
            { id: 11, title: "Live UI work", active: true },
            { id: 12, title: "Other chat", active: false },
          ],
        },
        {
          projectSlug: "urban-stay",
          projectLabel: "Urban Stay",
          sessions: [
            { id: 21, title: "Booking page", coordinationMode: true },
          ],
        },
      ],
    },
  });
  return {
    picker: picker,
    runtime: runtime,
    portMessages: portMessages,
    exitCalls: exitCalls,
    updateCalls: updateCalls,
    scriptCalls: scriptCalls,
    disconnect: function (tabId) { delete ports[tabId]; },
    reconnect: function (tabId) {
      ports[tabId] = {
        postMessage: function (message) { portMessages.push(message); },
      };
    },
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
  assert.strictEqual(response.controls[0].projects.length, 2);
  assert.strictEqual(response.controls[0].sessions[0].title, "Live UI work");
});

test("picker keeps a connected Clay tab visible when no chats exist", function () {
  var state = harness();
  state.picker.handlePortMessage(7, {
    type: "clay_live_ui_identity",
    identity: {
      serverOrigin: "http://100.100.10.20:2633",
      currentProjectSlug: "clay",
      projectSlug: "clay",
      projectLabel: "Clay",
      projects: [],
    },
  });
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
  }, function (value) { response = value; });
  assert.strictEqual(response.controls.length, 1);
  assert.deepStrictEqual(response.controls[0].projects, []);
});

test("picker pins the active web tab to an explicitly selected session", function () {
  var state = harness();
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_pair",
    controlTabId: 7,
    projectSlug: "clay",
    sessionId: 12,
  }, function (value) { response = value; });
  assert.strictEqual(response.ok, true);
  var request = state.portMessages.filter(function (message) {
    return message.type === "clay_live_ui_picker_pair_request";
  })[0];
  assert.ok(request);
  assert.strictEqual(request.targetTabId, 42);
  assert.strictEqual(request.projectSlug, "clay");
  assert.strictEqual(request.sessionId, 12);
  assert.strictEqual(request.extensionId, "extension-a");
  assert.ok(request.tabs.some(function (tab) { return tab.id === 42; }));
});

test("picker opens another project and pairs only after Clay reconnects there", function () {
  var state = harness();
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_pair",
    controlTabId: 7,
    projectSlug: "urban-stay",
    sessionId: 21,
  }, function (value) { response = value; });
  assert.strictEqual(response.ok, true);
  assert.deepStrictEqual(state.updateCalls, [{
    tabId: 7,
    options: { url: "http://100.100.10.20:2633/p/urban-stay/" },
  }]);
  assert.strictEqual(state.portMessages.some(function (message) {
    return message.type === "clay_live_ui_picker_pair_request";
  }), false);

  state.picker.handlePortDisconnected(7);
  state.disconnect(7);
  state.picker.handleTabUpdated(7, { status: "complete" }, {
    id: 7,
    url: "http://100.100.10.20:2633/p/urban-stay/",
  });
  assert.deepStrictEqual(state.scriptCalls, [{
    target: { tabId: 7 },
    files: ["content.js"],
  }]);
  state.reconnect(7);
  state.picker.handlePortMessage(7, {
    type: "clay_live_ui_identity",
    identity: {
      serverOrigin: "http://100.100.10.20:2633",
      currentProjectSlug: "urban-stay",
      projectSlug: "urban-stay",
      projectLabel: "Urban Stay",
      projects: [{
        projectSlug: "urban-stay",
        projectLabel: "Urban Stay",
        sessions: [{ id: 21, title: "Booking page", coordinationMode: true }],
      }],
    },
  });
  var request = state.portMessages.filter(function (message) {
    return message.type === "clay_live_ui_picker_pair_request";
  })[0];
  assert.ok(request);
  assert.strictEqual(request.projectSlug, "urban-stay");
  assert.strictEqual(request.sessionId, 21);
  assert.strictEqual(request.targetTabId, 42);
});

test("picker rejects stale session claims and routes explicit exit", function () {
  var state = harness();
  var pairResponse = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_pair",
    controlTabId: 7,
    projectSlug: "clay",
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
  var html = fs.readFileSync(path.join(__dirname, "..", "popup.html"), "utf8");
  var background = fs.readFileSync(
    path.join(__dirname, "..", "background.js"), "utf8"
  );
  assert.ok(source.split("\n").length < 500);
  assert.ok(popup.split("\n").length < 500);
  assert.ok(html.indexOf("liveUiProjectSelect") < html.indexOf("liveUiSessionSelect"));
  assert.match(popup, /projectSlug: selected\.projectSlug/);
  assert.match(background, /liveUiPicker\.handleTabUpdated/);
  assert.doesNotMatch(source, /storage\.local/);
  assert.doesNotMatch(popup, /localStorage/);
});
