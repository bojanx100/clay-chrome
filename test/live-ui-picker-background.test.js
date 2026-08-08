var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var pickerModule = require("../live-ui-picker-background");
var discoveryModule = require("../live-ui-picker-discovery");
var targetModule = require("../live-ui-picker-target");
var catalogModule = require("../live-ui-picker-catalog");
var workspaceModule = require("../live-ui-picker-workspace");

function harness(options) {
  options = options || {};
  var portMessages = [];
  var exitCalls = [];
  var updateCalls = [];
  var scriptCalls = [];
  var ports = options.connected === false ? {} : {
    7: {
      postMessage: function (message) { portMessages.push(message); },
    },
  };
  var tabs = [
    { id: 7, url: "http://100.100.10.20:2633/p/clay/", title: "Clay" },
    { id: 42, url: "http://100.100.10.20:4242/pricing", title: "Pricing" },
    { id: 43, url: "http://100.100.10.20:4242/account", title: "Account" },
  ];
  var chromeApi = {
    runtime: { id: "extension-a", lastError: null },
    tabs: {
      query: function (query, callback) {
        callback(query.active ? [tabs[1]] : tabs);
      },
      get: function (tabId, callback) {
        callback(tabs.filter(function (tab) { return tab.id === tabId; })[0]);
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
    getRecentPairings: function () { return options.recentPairings || []; },
    exitPairing: function (pairingId, callback) {
      exitCalls.push(pairingId);
      callback({ ok: true });
    },
  };
  var picker = pickerModule.createPicker(
    chromeApi,
    runtime,
    function (tabId) { return ports[tabId] || null; },
    function () { return Object.keys(ports); },
    discoveryModule,
    targetModule,
    catalogModule,
    workspaceModule
  );
  if (options.connected !== false) picker.handlePortMessage(7, {
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
  var recent = [{ targetTabId: 42, projectSlug: "clay", sessionId: 12 }];
  var state = harness({ recentPairings: recent });
  var response = null;
  assert.strictEqual(state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
  }, function (value) { response = value; }), true);
  assert.strictEqual(response.activeTab.id, 42);
  assert.strictEqual(response.controls.length, 1);
  assert.strictEqual(response.controls[0].projectSlug, "clay");
  assert.strictEqual(response.controls[0].projects.length, 2);
  assert.strictEqual(response.controls[0].sessions[0].title, "Live UI work");
  assert.deepStrictEqual(response.recentPairings, recent);
  assert.strictEqual(response.targetWorkspace.state, "checking");
  assert.ok(state.portMessages.some(function (message) {
    return message.type === "clay_live_ui_picker_probe_request";
  }));
});

test("picker exposes the server-authoritative workspace match", function () {
  var state = harness();
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
    targetTabId: 43,
  }, function (value) { response = value; });
  var probe = state.portMessages.filter(function (message) {
    return message.type === "clay_live_ui_picker_probe_request";
  })[0];
  assert.ok(probe);
  state.picker.handlePortMessage(7, {
    type: "clay_live_ui_target_workspace",
    requestId: probe.requestId,
    targetTabId: 43,
    state: "matched",
    projectSlug: "clay",
    projectLabel: "Clay",
    worktreeLabel: "design",
  });
  state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
    targetTabId: 43,
  }, function (value) { response = value; });
  assert.deepStrictEqual(response.targetWorkspace, {
    targetTabId: 43,
    state: "matched",
    projectSlug: "clay",
    projectLabel: "Clay",
    worktreeLabel: "design",
    code: null,
    error: null,
  });
});

test("workspace matching times out and retries when Clay does not answer", function () {
  var now = 0;
  var messages = [];
  var port = {
    postMessage: function (message) { messages.push(message); },
  };
  var probe = workspaceModule.createProbe({ runtime: { id: "extension-a" } },
    function () { return port; }, {
      now: function () { return now; },
      timeoutMs: 1000,
      retryDelayMs: 500,
    });
  var tab = { id: 43, url: "http://localhost:4242/account" };
  var controls = [{ controlTabId: 7 }];

  assert.strictEqual(probe.ensure(tab, controls, [tab]).state, "checking");
  assert.strictEqual(messages.length, 1);
  now = 1001;
  var timedOut = probe.ensure(tab, controls, [tab]);
  assert.strictEqual(timedOut.state, "unmatched");
  assert.strictEqual(timedOut.code, "LIVE_UI_TARGET_PROBE_TIMEOUT");
  assert.match(timedOut.error, /retry automatically/i);
  now = 1502;
  assert.strictEqual(probe.ensure(tab, controls, [tab]).state, "checking");
  assert.strictEqual(messages.length, 2);
  assert.notStrictEqual(messages[0].requestId, messages[1].requestId);
});

test("picker preserves manual project choice for remote previews", function () {
  var state = harness();
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
    targetTabId: 43,
  }, function (value) { response = value; });
  var probe = state.portMessages.filter(function (message) {
    return message.type === "clay_live_ui_picker_probe_request";
  })[0];
  state.picker.handlePortMessage(7, {
    type: "clay_live_ui_target_workspace",
    requestId: probe.requestId,
    targetTabId: 43,
    state: "manual",
    code: "LIVE_UI_TARGET_LISTENER_NOT_FOUND",
  });
  state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
    targetTabId: 43,
  }, function (value) { response = value; });
  assert.strictEqual(response.targetWorkspace.state, "manual");
});

test("picker resolves the exact inspected tab requested by DevTools", function () {
  var state = harness();
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
    targetTabId: 43,
  }, function (value) { response = value; });
  assert.strictEqual(response.activeTab.id, 43);
  assert.strictEqual(response.activeTab.title, "Account");
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

test("picker keeps projects visible before their chats are loaded", function () {
  var state = harness();
  state.picker.handlePortMessage(7, {
    type: "clay_live_ui_identity",
    identity: {
      serverOrigin: "http://100.100.10.20:2633",
      currentProjectSlug: "clay",
      projectSlug: "clay",
      projectLabel: "Clay",
      projects: [{
        projectSlug: "webapp",
        projectLabel: "Webapp",
        sessionsLoaded: false,
      }],
    },
  });
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
  }, function (value) { response = value; });
  assert.strictEqual(response.controls[0].projects.length, 1);
  assert.strictEqual(response.controls[0].projects[0].sessionsLoaded, false);
});

test("picker requests chats for only the selected project", function () {
  var state = harness();
  state.picker.handlePortMessage(7, {
    type: "clay_live_ui_identity",
    identity: {
      serverOrigin: "http://100.100.10.20:2633",
      currentProjectSlug: "clay",
      projectSlug: "clay",
      projectLabel: "Clay",
      projects: [{
        projectSlug: "webapp",
        projectLabel: "Webapp",
        sessionsLoaded: false,
      }],
    },
  });
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_load_project",
    controlTabId: 7,
    projectSlug: "webapp",
  }, function (value) { response = value; });
  assert.deepStrictEqual(response, { ok: true });
  assert.ok(state.portMessages.some(function (message) {
      return message.type === "clay_live_ui_project_sessions_request" &&
      message.projectSlug === "webapp";
  }));

  state.picker.handlePortMessage(7, {
    type: "clay_live_ui_project_sessions",
    projectSlug: "webapp",
    sessions: [{ id: 21, title: "Booking page" }],
  });
  state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
  }, function (value) { response = value; });
  assert.strictEqual(response.controls[0].projects[0].sessionsLoaded, true);
  assert.strictEqual(response.controls[0].projects[0].sessions[0].title, "Booking page");
});

test("picker does not connect a normal localhost app as Clay", function () {
  var state = harness();
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_connect_current",
  }, function (value) { response = value; });
  assert.strictEqual(response.ok, false);
  assert.match(response.error, /Open Clay/);
  assert.deepStrictEqual(state.scriptCalls, []);
});

test("picker automatically discovers an open Clay project tab", function () {
  var state = harness({ connected: false });
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
  }, function (value) { response = value; });
  assert.strictEqual(response.discoveringClay, true);
  assert.deepStrictEqual(state.scriptCalls, [{
    target: { tabId: 7 },
    files: ["content.js"],
  }]);

  state.reconnect(7);
  state.picker.handlePortConnected(7);
  state.picker.handlePortMessage(7, {
    type: "clay_live_ui_identity",
    identity: {
      serverOrigin: "http://100.100.10.20:2633",
      currentProjectSlug: "clay",
      projectSlug: "clay",
      projectLabel: "Clay",
      projects: [{
        projectSlug: "clay",
        projectLabel: "Clay",
        sessions: [{ id: 11, title: "Live UI work" }],
      }],
    },
  });
  state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
  }, function (value) { response = value; });
  assert.strictEqual(response.controls.length, 1);
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

test("picker pins the exact inspected tab instead of the active tab", function () {
  var state = harness();
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_pair",
    controlTabId: 7,
    projectSlug: "clay",
    sessionId: 12,
    targetTabId: 43,
  }, function (value) { response = value; });
  assert.strictEqual(response.ok, true);
  var request = state.portMessages.filter(function (message) {
    return message.type === "clay_live_ui_picker_pair_request";
  })[0];
  assert.ok(request);
  assert.strictEqual(request.targetTabId, 43);
  assert.ok(request.tabs.some(function (tab) { return tab.id === 43; }));
});

test("picker can create a coordinator chat for the inspected workspace", function () {
  var state = harness();
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_create",
    controlTabId: 7,
    projectSlug: "clay",
    targetTabId: 43,
    attachWorkspace: true,
  }, function (value) { response = value; });
  assert.strictEqual(response.ok, true);
  var request = state.portMessages.filter(function (message) {
    return message.type === "clay_live_ui_picker_create_request";
  })[0];
  assert.ok(request);
  assert.strictEqual(request.targetTabId, 43);
  assert.strictEqual(request.projectSlug, "clay");
  assert.strictEqual(request.sessionId, null);
  assert.strictEqual(request.attachWorkspace, true);
});

test("picker forwards guarded server reconnect intent and its error code", function () {
  var state = harness();
  var response = null;
  state.picker.handlePopupMessage({
    type: "live_ui_picker_pair",
    controlTabId: 7,
    projectSlug: "clay",
    sessionId: 12,
    targetTabId: 43,
    reconnectServer: true,
  }, function (value) { response = value; });
  assert.strictEqual(response.ok, true);
  var request = state.portMessages.filter(function (message) {
    return message.type === "clay_live_ui_picker_pair_request";
  })[0];
  assert.strictEqual(request.reconnectServer, true);

  state.picker.handlePortMessage(7, {
    type: "clay_live_ui_picker_state",
    requestId: request.requestId,
    state: "error",
    code: "LIVE_UI_SERVER_ROOT_MISMATCH",
    error: "Different worktree",
  });
  state.picker.handlePopupMessage({
    type: "live_ui_picker_get_state",
    targetTabId: 43,
  }, function (value) { response = value; });
  assert.strictEqual(response.status.code, "LIVE_UI_SERVER_ROOT_MISMATCH");
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
  var discovery = fs.readFileSync(
    path.join(__dirname, "..", "live-ui-picker-discovery.js"), "utf8"
  );
  var catalog = fs.readFileSync(
    path.join(__dirname, "..", "live-ui-picker-catalog.js"), "utf8"
  );
  var workspace = fs.readFileSync(
    path.join(__dirname, "..", "live-ui-picker-workspace.js"), "utf8"
  );
  assert.ok(source.split("\n").length < 500);
  assert.ok(popup.split("\n").length < 500);
  assert.ok(discovery.split("\n").length < 500);
  assert.ok(catalog.split("\n").length < 500);
  assert.ok(workspace.split("\n").length < 500);
  assert.ok(html.indexOf("liveUiProjectSelect") < html.indexOf("liveUiSessionSelect"));
  assert.match(popup, /projectSlug: selected\.projectSlug/);
  assert.match(popup, /live_ui_picker_load_project/);
  assert.match(popup, /attachWorkspace: true/);
  assert.match(popup, /targetWorkspace/);
  assert.match(popup, /nextSignature === liveUiOptionsSignature/);
  assert.match(popup, /document\.activeElement === liveUiSessionSelect/);
  assert.match(background, /liveUiPicker\.handleTabUpdated/);
  assert.match(background, /live-ui-picker-discovery\.js/);
  assert.ok(background.indexOf("live-ui-picker-catalog.js") <
    background.indexOf("live-ui-picker-background.js"));
  assert.ok(background.indexOf("live-ui-picker-workspace.js") <
    background.indexOf("live-ui-picker-background.js"));
  assert.doesNotMatch(source, /storage\.local/);
  assert.doesNotMatch(popup, /localStorage/);
  assert.doesNotMatch(catalog + workspace, /\b(?:const|let)\b|=>/);
});
