var test = require("node:test");
var assert = require("node:assert");
var moduleApi = require("../live-ui-background");

function harness() {
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
  }, function (value) { result = value; }, { clayTabId: 7 });
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(state.targetMessages[0].message.type, "live_ui_init");

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
