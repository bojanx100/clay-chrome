var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");

var recoveryModule = require("../content-bridge-recovery");

test("recovery matches only Clay project URLs, including hosted development ports", function () {
  assert.strictEqual(recoveryModule.isClayProjectUrl(
    "https://100-124-11-117.d.clay.studio:7292/p/lead/"), true);
  assert.strictEqual(recoveryModule.isClayProjectUrl(
    "https://localhost:7292/p/clay/"), true);
  assert.strictEqual(recoveryModule.isClayProjectUrl(
    "https://127.0.0.1:7292/p/clay/"), true);
  assert.strictEqual(recoveryModule.isClayProjectUrl(
    "https://clay.studio.evil.example/p/lead/"), false);
  assert.strictEqual(recoveryModule.isClayProjectUrl(
    "https://example.com/p/lead/"), false);
});

function harness() {
  var calls = {
    injected: [],
    installedListener: null,
    startupListener: null,
    timers: [],
  };
  var connected = { 7: true };
  var chromeApi = {
    runtime: {
      lastError: null,
      onInstalled: {
        addListener: function (listener) { calls.installedListener = listener; },
      },
      onStartup: {
        addListener: function (listener) { calls.startupListener = listener; },
      },
    },
    scripting: {
      executeScript: function (options, callback) {
        calls.injected.push(options);
        callback();
      },
    },
    tabs: {
      query: function (query, callback) {
        callback([
          { id: 7, url: "https://localhost:7292/p/clay/" },
          { id: 8, url: "https://100-124-11-117.d.clay.studio:7292/p/lead/" },
          { id: 9, url: "https://example.com/" },
        ]);
      },
    },
  };
  function setTimer(callback, delay) {
    calls.timers.push({ callback: callback, delay: delay });
    return calls.timers.length;
  }
  return {
    calls: calls,
    chromeApi: chromeApi,
    connected: connected,
    options: {
      getPort: function (tabId) { return connected[tabId] || null; },
      initialDelayMs: 400,
      setTimer: setTimer,
      logger: { log: function () {}, warn: function () {} },
    },
  };
}

test("startup recovery reinjects the bridge only into disconnected Clay tabs", function () {
  var state = harness();
  recoveryModule.install(state.chromeApi, state.options);

  assert.strictEqual(state.calls.timers.length, 1);
  assert.strictEqual(state.calls.timers[0].delay, 400);
  state.calls.timers[0].callback();

  assert.deepStrictEqual(state.calls.injected, [{
    target: { tabId: 8 },
    files: ["content.js"],
  }]);
});

test("background service worker installs bridge recovery", function () {
  var source = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");

  assert.match(source, /importScripts\("content-bridge-recovery\.js"/);
  assert.match(source, /ClayContentBridgeRecovery\.install\(chrome/);
});

test("install and browser startup schedule one deduplicated recovery", function () {
  var state = harness();
  state.connected = {};
  var recovery = recoveryModule.install(state.chromeApi, state.options);

  assert.strictEqual(typeof state.calls.installedListener, "function");
  assert.strictEqual(typeof state.calls.startupListener, "function");
  state.calls.installedListener();
  state.calls.startupListener();
  recovery.schedule(0);

  assert.strictEqual(state.calls.timers.length, 1);
});
