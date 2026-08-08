var test = require("node:test");
var assert = require("node:assert");
var backgroundModule = require("../live-ui-background");
var pickerModule = require("../live-ui-picker-background");
var recoveryModule = require("../live-ui-picker-recovery");
var discoveryModule = require("../live-ui-picker-discovery");
var targetModule = require("../live-ui-picker-target");
var catalogModule = require("../live-ui-picker-catalog");
var workspaceModule = require("../live-ui-picker-workspace");

function runtimeHarness() {
  var recovered = [];
  var stored = {};
  var chromeApi = {
    runtime: { lastError: null },
    storage: { session: {
      get: function (keys, callback) { callback(stored); },
      set: function (value) { stored = value; },
    } },
    tabs: {
      get: function (tabId, callback) {
        callback({ id: tabId, url: "http://localhost:4242/page" });
      },
      sendMessage: function (tabId, message, callback) { callback({ ok: true }); },
    },
    scripting: { executeScript: function (options, callback) { callback(); } },
  };
  var runtime = backgroundModule.createRuntime(chromeApi, function () {
    return { postMessage: function () {} };
  }, {
    recoverPairing: function (metadata) { recovered.push(metadata); },
  });
  runtime.pair({
    protocolVersion: 1,
    pairingId: "pair-stale",
    targetTabId: 42,
    allowedOrigin: "http://localhost:4242",
    nonce: "nonce",
    reconnectCredential: "secret",
    projectSlug: "webapp",
    projectLabel: "Webapp",
    sessionId: "session-redesign",
    sessionLabel: "REDESIGN",
  }, function () {}, { clayTabId: 7 });
  return { runtime: runtime, recovered: recovered };
}

test("stale server pairings automatically request safe recovery", function () {
  var state = runtimeHarness();
  assert.strictEqual(state.runtime.handleServerEnvelope({
    type: "live_ui_state",
    protocolVersion: 1,
    pairingId: "pair-stale",
    state: "revoked",
    reason: "server_restart",
  }), true);
  assert.strictEqual(state.runtime.getPairings().length, 0);
  assert.deepStrictEqual(state.recovered, [{
    clayTabId: 7,
    targetTabId: 42,
    allowedOrigin: "http://localhost:4242",
    projectLabel: "Webapp",
    sessionLabel: "REDESIGN",
    projectSlug: "webapp",
    sessionId: "session-redesign",
  }]);

  state = runtimeHarness();
  state.runtime.handleServerEnvelope({
    type: "live_ui_state",
    protocolVersion: 1,
    pairingId: "pair-stale",
    state: "error",
    code: "LIVE_UI_NOT_FOUND",
  });
  assert.strictEqual(state.recovered.length, 1);
});

test("intentional server revocation does not automatically reconnect", function () {
  var state = runtimeHarness();
  state.runtime.handleServerEnvelope({
    type: "live_ui_state",
    protocolVersion: 1,
    pairingId: "pair-stale",
    state: "revoked",
    reason: "user_exit",
  });
  assert.strictEqual(state.recovered.length, 0);
});

test("recovery waits for the refreshed Clay tab to identify itself", function () {
  var identity = null;
  var requested = [];
  var started = [];
  var recovery = recoveryModule.createRecovery({
    getIdentity: function () { return identity; },
    getPort: function () { return { postMessage: function () {} }; },
    projectBySlug: catalogModule.projectBySlug,
    findSelection: function (value, projectSlug, sessionId) {
      return value.projects[0].sessions.filter(function (session) {
        return String(session.id) === String(sessionId);
      })[0] || null;
    },
    requestIdentity: function (tabId) { requested.push(tabId); },
    loadProject: function () {},
    startPair: function (message, callback) {
      started.push(message);
      callback({ ok: true });
    },
  });
  recovery.recover({
    clayTabId: 7,
    targetTabId: 42,
    projectSlug: "webapp",
    sessionId: "session-redesign",
  });
  assert.deepStrictEqual(requested, [7]);
  assert.strictEqual(started.length, 0);

  identity = {
    projects: [{
      projectSlug: "webapp",
      sessionsLoaded: true,
      sessions: [{ id: "session-redesign" }],
    }],
  };
  recovery.retry();
  assert.strictEqual(started.length, 1);
  assert.strictEqual(started[0].targetTabId, 42);
});

test("picker recovery restores the same project session and target", function () {
  var portMessages = [];
  var ports = { 7: { postMessage: function (message) { portMessages.push(message); } } };
  var tabs = [
    { id: 7, url: "http://localhost:2633/p/clay/", title: "Clay" },
    { id: 42, url: "http://localhost:4242/page", title: "App" },
  ];
  var chromeApi = {
    runtime: { id: "extension-a", lastError: null },
    tabs: {
      query: function (query, callback) { callback(tabs); },
      get: function (tabId, callback) {
        callback(tabs.filter(function (tab) { return tab.id === tabId; })[0]);
      },
      update: function (tabId, options, callback) { callback(tabs[0]); },
    },
    scripting: { executeScript: function (options, callback) { callback(); } },
  };
  var runtime = {
    getPairings: function () { return []; },
    getRecentPairings: function () { return []; },
    exitPairing: function (id, callback) { callback({ ok: true }); },
  };
  var picker = pickerModule.createPicker(
    chromeApi,
    runtime,
    function (tabId) { return ports[tabId] || null; },
    function () { return Object.keys(ports); },
    discoveryModule,
    targetModule,
    catalogModule,
    workspaceModule,
    recoveryModule
  );
  picker.handlePortMessage(7, {
    type: "clay_live_ui_identity",
    identity: {
      serverOrigin: "http://localhost:2633",
      currentProjectSlug: "clay",
      projects: [{
        projectSlug: "clay",
        projectLabel: "Clay",
        sessions: [{ id: "session-redesign", title: "REDESIGN" }],
      }],
    },
  });

  assert.strictEqual(picker.recoverPairing({
    clayTabId: 7,
    targetTabId: 42,
    allowedOrigin: "http://localhost:4242",
    projectSlug: "clay",
    sessionId: "session-redesign",
  }), true);
  var request = portMessages.filter(function (message) {
    return message.type === "clay_live_ui_picker_pair_request";
  })[0];
  assert.ok(request);
  assert.strictEqual(request.projectSlug, "clay");
  assert.strictEqual(request.sessionId, "session-redesign");
  assert.strictEqual(request.targetTabId, 42);
  assert.strictEqual(request.reconnectServer, true);
  assert.strictEqual(request.attachWorkspace, true);
});
