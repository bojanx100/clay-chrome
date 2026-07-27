var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var moduleApi = require("../live-ui-background");

function harness(options) {
  options = options || {};
  var stored = {};
  var targetMessages = [];
  var controlMessages = [];
  var chromeApi = {
    runtime: { lastError: null },
    storage: {
      session: {
        get: function (key, callback) { callback(stored); },
        set: function (value) { stored = value; },
      },
    },
    tabs: {
      get: function (tabId, callback) {
        callback({ id: tabId, url: "http://localhost:4242/pricing" });
      },
      sendMessage: function (tabId, message, callback) {
        targetMessages.push({ tabId: tabId, message: message });
        callback({ ok: true });
      },
    },
    scripting: {
      executeScript: function (options, callback) { callback(); },
    },
  };
  var runtime = moduleApi.createRuntime(chromeApi, function () {
    return {
      postMessage: function (message) { controlMessages.push(message); },
    };
  }, {
    captureScreenshot: options.captureScreenshot,
    captureEvidence: options.captureEvidence,
  });
  return {
    runtime: runtime,
    targetMessages: targetMessages,
    controlMessages: controlMessages,
  };
}

test("origin validation keeps pairing on the authorized origin", function () {
  assert.strictEqual(moduleApi.originOf("http://localhost:4242/path"),
    "http://localhost:4242");
  assert.strictEqual(moduleApi.originOf("javascript:alert(1)"), null);
});

test("target overlay exposes a compact report queue and isolated picker", function () {
  var root = path.join(__dirname, "..");
  var target = fs.readFileSync(path.join(root, "live-ui-target.js"), "utf8");
  var targetContext = fs.readFileSync(
    path.join(root, "live-ui-target-context.js"), "utf8");
  var targetUi = fs.readFileSync(path.join(root, "live-ui-target-ui.js"), "utf8");
  var background = fs.readFileSync(path.join(root, "live-ui-background.js"), "utf8");
  var evidence = fs.readFileSync(path.join(root, "live-ui-evidence.js"), "utf8");
  assert.match(targetUi, /Coordinator/);
  assert.match(targetUi, /attached automatically/);
  assert.match(targetUi, /selection-shield/);
  assert.match(targetUi, /aggregate-dot/);
  assert.match(target, /selection\.clear/);
  assert.match(target, /report\.submit/);
  assert.match(target, /evidence\.capture/);
  assert.match(target, /handleShieldClick/);
  assert.match(targetUi, /Drag Live UI/);
  assert.match(targetUi, /setPointerCapture/);
  assert.match(targetUi, /stopImmediatePropagation/);
  assert.match(background, /captureEvidence/);
  assert.match(evidence, /captureDiagnostics/);
  assert.ok(target.split("\n").length < 500);
  assert.ok(targetContext.split("\n").length < 500);
  assert.ok(targetUi.split("\n").length < 500);
  assert.ok(background.split("\n").length < 500);
  assert.ok(evidence.split("\n").length < 500);
});

test("pair injects the target and relays target events to the owning control", function () {
  var state = harness();
  var result = null;
  state.runtime.pair({
    protocolVersion: 1,
    pairingId: "pair-1",
    targetTabId: 42,
    allowedOrigin: "http://localhost:4242",
    nonce: "nonce-1",
    reconnectCredential: "reconnect-1",
    projectLabel: "clay",
    sessionLabel: "Framer workflow",
    projectSlug: "clay",
    sessionId: "session-7",
  }, function (value) { result = value; }, { clayTabId: 7 });
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(state.targetMessages[0].message.type, "live_ui_init");
  assert.strictEqual(state.targetMessages[0].message.projectLabel, "clay");
  assert.strictEqual(state.targetMessages[0].message.sessionLabel, "Framer workflow");
  assert.strictEqual(state.runtime.getPairings()[0].projectSlug, "clay");
  assert.strictEqual(state.runtime.getPairings()[0].sessionId, "session-7");

  var response = null;
  var handled = state.runtime.handleTargetMessage({
    type: "live_ui_target_event",
    pairingId: "pair-1",
    event: "selection.update",
    clientMessageId: "selection-1",
    payload: { tag: "button" },
  }, {
    tab: { id: 42, url: "http://localhost:4242/pricing" },
  }, function (value) { response = value; });
  assert.strictEqual(handled, true);
  assert.deepStrictEqual(response, { ok: true });
  assert.strictEqual(state.controlMessages[0].type, "clay_live_ui_relay");
  assert.strictEqual(state.controlMessages[0].envelope.event, "selection.update");

  state.runtime.handleControlConnected(7, {
    postMessage: function (message) { state.controlMessages.push(message); },
  });
  assert.strictEqual(state.controlMessages[1].type, "clay_live_ui_restore");
  assert.strictEqual(state.controlMessages[1].reconnectCredential, "reconnect-1");
});

test("extension exit closes the overlay and notifies its pinned control", function () {
  var state = harness();
  var result = null;
  state.runtime.pair({
    protocolVersion: 1,
    pairingId: "pair-1",
    targetTabId: 42,
    allowedOrigin: "http://localhost:4242",
    nonce: "nonce-1",
  }, function (value) { result = value; }, { clayTabId: 7 });
  assert.deepStrictEqual(result, { ok: true });
  var exitResult = null;
  state.runtime.exitPairing("pair-1", function (value) { exitResult = value; });
  assert.deepStrictEqual(exitResult, { ok: true });
  assert.strictEqual(state.runtime.getPairings().length, 0);
  assert.ok(state.controlMessages.some(function (message) {
    return message.envelope &&
      message.envelope.event === "target.closed" &&
      message.envelope.payload.reason === "extension_exit";
  }));
  assert.ok(state.targetMessages.some(function (entry) {
    return entry.message.type === "live_ui_destroy";
  }));
});

test("a new pairing replaces stale state for the same target tab", function () {
  var state = harness();
  function pair(pairingId, clayTabId) {
    var result = null;
    state.runtime.pair({
      protocolVersion: 1,
      pairingId: pairingId,
      targetTabId: 42,
      allowedOrigin: "http://localhost:4242",
      nonce: "nonce-" + pairingId,
      reconnectCredential: "reconnect-" + pairingId,
      projectLabel: "clay",
      sessionLabel: pairingId,
    }, function (value) { result = value; }, { clayTabId: clayTabId });
    return result;
  }
  assert.deepStrictEqual(pair("pair-old", 7), { ok: true });
  assert.deepStrictEqual(pair("pair-new", 8), { ok: true });
  assert.ok(state.targetMessages.some(function (entry) {
    return entry.message.type === "live_ui_destroy" &&
      entry.message.pairingId === "pair-old";
  }));
  assert.ok(state.controlMessages.some(function (entry) {
    return entry.envelope &&
      entry.envelope.event === "target.closed" &&
      entry.envelope.pairingId === "pair-old";
  }));
});

test("control disconnect marks the target unavailable until server confirmation", function () {
  var state = harness();
  var result = null;
  state.runtime.pair({
    protocolVersion: 1,
    pairingId: "pair-1",
    targetTabId: 42,
    allowedOrigin: "http://localhost:4242",
    nonce: "nonce-1",
    reconnectCredential: "reconnect-1",
  }, function (value) { result = value; }, { clayTabId: 7 });
  assert.deepStrictEqual(result, { ok: true });
  state.runtime.handleControlDisconnected(7);
  assert.ok(state.targetMessages.some(function (entry) {
    return entry.message.type === "live_ui_connection" &&
      entry.message.state === "disconnected";
  }));
});

test("selection clear removes persisted selection before reinjection", function () {
  var state = harness();
  var result = null;
  state.runtime.pair({
    protocolVersion: 1,
    pairingId: "pair-1",
    targetTabId: 42,
    allowedOrigin: "http://localhost:4242",
    nonce: "nonce-1",
    reconnectCredential: "reconnect-1",
  }, function (value) { result = value; }, { clayTabId: 7 });
  assert.deepStrictEqual(result, { ok: true });
  state.runtime.handleTargetMessage({
    type: "live_ui_target_event",
    pairingId: "pair-1",
    event: "selection.update",
    clientMessageId: "selection-1",
    payload: { tag: "button" },
  }, {
    tab: { id: 42, url: "http://localhost:4242/pricing" },
  }, function () {});
  state.runtime.handleTargetMessage({
    type: "live_ui_target_event",
    pairingId: "pair-1",
    event: "selection.clear",
    clientMessageId: "selection-clear-1",
  }, {
    tab: { id: 42, url: "http://localhost:4242/pricing" },
  }, function () {});
  state.runtime.handleTabComplete(42, {
    id: 42,
    url: "http://localhost:4242/pricing",
  });
  var initMessages = state.targetMessages.filter(function (entry) {
    return entry.message.type === "live_ui_init";
  });
  assert.strictEqual(initMessages[initMessages.length - 1].message.selection, null);
});

test("screenshot capture stays inside the extension until the masked result is ready", function () {
  var captureArgs = null;
  var state = harness({
    captureScreenshot: function (pairing, payload, callback) {
      captureArgs = { pairing: pairing, payload: payload };
      callback({
        ok: true,
        mediaType: "image/png",
        data: "bWFza2VkLXBuZw==",
      });
    },
  });
  var result = null;
  state.runtime.pair({
    protocolVersion: 1,
    pairingId: "pair-1",
    targetTabId: 42,
    allowedOrigin: "http://localhost:4242",
    nonce: "nonce-1",
    reconnectCredential: "reconnect-1",
  }, function (value) { result = value; }, { clayTabId: 7 });
  assert.deepStrictEqual(result, { ok: true });
  var response = null;
  state.runtime.handleTargetMessage({
    type: "live_ui_target_event",
    pairingId: "pair-1",
    event: "screenshot.capture",
    clientMessageId: "capture-1",
    payload: {
      documentGeneration: "document-1",
      viewport: { width: 1200, height: 800, scrollX: 0, scrollY: 0 },
      masks: [{ x: 10, y: 20, width: 100, height: 30 }],
    },
  }, {
    tab: { id: 42, url: "http://localhost:4242/pricing" },
  }, function (value) { response = value; });
  assert.strictEqual(captureArgs.pairing.pairingId, "pair-1");
  assert.strictEqual(captureArgs.payload.masks.length, 1);
  assert.strictEqual(response.ok, true);
  assert.strictEqual(response.screenshot.data, "bWFza2VkLXBuZw==");
  assert.strictEqual(state.controlMessages.length, 0);
});

test("automatic report evidence combines a masked screenshot and diagnostics", function () {
  var captureArgs = null;
  var state = harness({
    captureEvidence: function (pairing, payload, callback) {
      captureArgs = { pairing: pairing, payload: payload };
      callback({
        ok: true,
        mediaType: "image/png",
        data: "bWFza2VkLXBuZw==",
        diagnostics: {
          console: [{ level: "error", text: "Boom" }],
          network: [{ method: "GET", url: "/api/items", status: 500 }],
        },
      });
    },
  });
  var result = null;
  state.runtime.pair({
    protocolVersion: 1,
    pairingId: "pair-1",
    targetTabId: 42,
    allowedOrigin: "http://localhost:4242",
    nonce: "nonce-1",
  }, function (value) { result = value; }, { clayTabId: 7 });
  assert.deepStrictEqual(result, { ok: true });
  var response = null;
  state.runtime.handleTargetMessage({
    type: "live_ui_target_event",
    pairingId: "pair-1",
    event: "evidence.capture",
    payload: {
      documentGeneration: "document-1",
      viewport: { width: 1200, height: 800, scrollX: 0, scrollY: 0 },
      masks: [],
    },
  }, {
    tab: { id: 42, url: "http://localhost:4242/pricing" },
  }, function (value) { response = value; });
  assert.strictEqual(captureArgs.pairing.pairingId, "pair-1");
  assert.strictEqual(response.screenshot.data, "bWFza2VkLXBuZw==");
  assert.strictEqual(response.diagnostics.console[0].text, "Boom");
  assert.strictEqual(state.controlMessages.length, 0);
});
