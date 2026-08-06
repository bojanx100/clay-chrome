var test = require("node:test");
var assert = require("node:assert");
var moduleApi = require("../live-ui-devtools-background");

function harness() {
  var sent = [];
  var chromeApi = {
    runtime: { lastError: null },
    tabs: {
      sendMessage: function (tabId, message, callback) {
        sent.push({ tabId: tabId, message: message });
        callback({ ok: true, connected: true });
      },
    },
  };
  var runtime = {
    getPairings: function () {
      return [{ pairingId: "pair-1", targetTabId: 42 }];
    },
  };
  return {
    bridge: moduleApi.createBridge(chromeApi, runtime),
    sent: sent,
  };
}

test("DevTools bridge targets only the inspected tab's active pairing", function () {
  var state = harness();
  var response = null;
  assert.strictEqual(state.bridge.handleMessage({
    type: "live_ui_devtools_command",
    targetTabId: 42,
    pairingId: "pair-1",
    action: "snapshot",
  }, function (value) { response = value; }), true);
  assert.deepStrictEqual(response, { ok: true, connected: true });
  assert.strictEqual(state.sent[0].tabId, 42);
  assert.deepStrictEqual(state.sent[0].message, {
    type: "live_ui_devtools_command",
    pairingId: "pair-1",
    action: "snapshot",
    payload: {},
  });
});

test("DevTools bridge rejects stale pairings and unknown actions", function () {
  var state = harness();
  var stale = null;
  state.bridge.handleMessage({
    type: "live_ui_devtools_command",
    targetTabId: 43,
    pairingId: "pair-1",
    action: "snapshot",
  }, function (value) { stale = value; });
  assert.strictEqual(stale.ok, false);
  assert.deepStrictEqual(state.sent, []);

  var unknown = null;
  state.bridge.handleMessage({
    type: "live_ui_devtools_command",
    targetTabId: 42,
    pairingId: "pair-1",
    action: "evaluate",
  }, function (value) { unknown = value; });
  assert.strictEqual(unknown.ok, false);
  assert.deepStrictEqual(state.sent, []);
});

test("DevTools bridge bounds report text before crossing into the page", function () {
  var state = harness();
  state.bridge.handleMessage({
    type: "live_ui_devtools_command",
    targetTabId: 42,
    pairingId: "pair-1",
    action: "report.submit",
    payload: { text: "x".repeat(15000), reportId: "report-1" },
  }, function () {});
  assert.strictEqual(state.sent[0].message.payload.text.length, 12000);
  assert.strictEqual(state.sent[0].message.payload.reportId, "report-1");
});
