var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

function fakeStyle() {
  return {
    display: "",
    transform: "",
    width: "",
    height: "",
    borderColor: "",
    visibility: "",
  };
}

function fakeElement(left) {
  return {
    isConnected: true,
    style: fakeStyle(),
    getBoundingClientRect: function () {
      return { left: left, top: 10, width: 80, height: 20 };
    },
    remove: function () { this.isConnected = false; },
  };
}

function targetHarness() {
  var root = path.join(__dirname, "..");
  var listeners = [];
  var rafs = [];
  var observer = null;
  var resolved = fakeElement(20);
  var sent = [];
  var responses = [];
  var refreshes = 0;
  var outline = { style: fakeStyle() };
  var shield = {
    hidden: true,
    style: fakeStyle(),
    addEventListener: function () {},
  };
  var host = fakeElement(0);
  var manager = {
    clear: function () {},
    focus: function () {},
    focusForSubmission: function () { return true; },
    focused: function () { return null; },
    get: function () { return null; },
    handleHmr: function () {},
    refreshHighlights: function () { refreshes++; },
    remove: function () {},
    replace: function () {},
    setShowAllWorkers: function () {},
    snapshot: function () { return {}; },
    upsert: function () {},
  };
  var sandbox = {
    globalThis: {
      ClayLiveUiTargetContext: {
        resolveElement: function () { return resolved; },
        selectionPacket: function () {
          return {
            tag: "button",
            route: "/settings",
            selectors: ["#save"],
            component: null,
          };
        },
        screenshotMasks: function () { return []; },
      },
      ClayLiveUiTargetReports: {
        create: function () { return manager; },
        syncSelectionFocus: function () {},
      },
      ClayLiveUiTargetSnapshot: {
        build: function () { return { ok: true }; },
      },
      ClayLiveUiTargetUi: {
        create: function () {
          return {
            highlightLayer: {},
            host: host,
            selectionOutline: outline,
            selectionShield: shield,
          };
        },
      },
    },
    chrome: {
      runtime: {
        lastError: null,
        onMessage: {
          addListener: function (listener) { listeners.push(listener); },
        },
        sendMessage: function (message, callback) {
          sent.push(message);
          if (callback) callback({ ok: true });
        },
      },
    },
    document: {
      addEventListener: function () {},
      documentElement: { getAttribute: function () { return null; } },
      elementFromPoint: function () { return null; },
    },
    location: {
      href: "http://localhost:4242/settings",
      origin: "http://localhost:4242",
      pathname: "/settings",
      search: "",
      hash: "",
    },
    window: {
      addEventListener: function () {},
    },
    URL: URL,
    MutationObserver: function (callback) {
      observer = {
        callback: callback,
        disconnect: function () {},
        observe: function () {},
      };
      return observer;
    },
    clearTimeout: function () {},
    setTimeout: function () { return 1; },
    cancelAnimationFrame: function () {},
    requestAnimationFrame: function (callback) {
      rafs.push(callback);
      return rafs.length;
    },
    innerHeight: 800,
    innerWidth: 1200,
    scrollX: 0,
    scrollY: 0,
  };

  vm.runInNewContext(fs.readFileSync(path.join(
    root, "live-ui-target-selection.js"), "utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(
    root, "live-ui-target.js"), "utf8"), sandbox);

  return {
    disconnectResolved: function () {
      if (resolved) resolved.isConnected = false;
    },
    flush: function () {
      while (rafs.length) rafs.shift()();
    },
    messages: sent,
    outline: outline,
    refreshes: function () { return refreshes; },
    send: function (message) {
      responses = [];
      listeners[0](message, {}, function (response) { responses.push(response); });
      return responses[0];
    },
    setResolved: function (element) { resolved = element; },
    triggerMutation: function () { observer.callback(); },
  };
}

test("target hides and restores the selection outline when a packet cannot resolve", function () {
  var harness = targetHarness();
  var response = harness.send({
    type: "live_ui_init",
    pairingId: "pair-1",
    allowedOrigin: "http://localhost:4242",
    selection: { route: "/settings", tag: "button", selectors: ["#save"] },
  });
  assert.strictEqual(response.ok, true);

  response = harness.send({
    type: "live_ui_server_event",
    envelope: {
      pairingId: "pair-1",
      type: "live_ui_state",
      state: "paired",
    },
  });
  assert.strictEqual(response.ok, true);
  assert.strictEqual(harness.outline.style.display, "block");
  assert.match(harness.outline.style.transform, /translate\(20px,10px\)/);
  assert.strictEqual(harness.messages[0].event, "selection.update");

  harness.disconnectResolved();
  harness.setResolved(null);
  harness.triggerMutation();
  harness.flush();
  assert.strictEqual(harness.outline.style.display, "none");
  assert.strictEqual(harness.refreshes(), 1);

  harness.setResolved(fakeElement(140));
  harness.triggerMutation();
  harness.flush();
  assert.strictEqual(harness.outline.style.display, "block");
  assert.match(harness.outline.style.transform, /translate\(140px,10px\)/);
});
