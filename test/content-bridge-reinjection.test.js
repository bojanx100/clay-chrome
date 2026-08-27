var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

function loadTwice() {
  var source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  var listeners = [];
  var ports = [];
  var windowApi = {
    postMessage: function () {},
    addEventListener: function (type, listener) {
      if (type === "message") listeners.push(listener);
    },
    removeEventListener: function (type, listener) {
      var index = listeners.indexOf(listener);
      if (type === "message" && index !== -1) listeners.splice(index, 1);
    },
  };
  windowApi.window = windowApi;
  windowApi.__clayExtensionBridgeLoaded = true;
  var chromeApi = {
    runtime: {
      lastError: null,
      connect: function () {
        var port = {
          disconnected: false,
          messages: [],
          disconnect: function () { port.disconnected = true; },
          onDisconnect: { addListener: function () {} },
          onMessage: { addListener: function () {} },
          postMessage: function (message) { port.messages.push(message); },
        };
        ports.push(port);
        return port;
      },
    },
  };
  var context = {
    chrome: chromeApi,
    clearTimeout: function () {},
    console: { log: function () {} },
    setTimeout: function () { return 1; },
    window: windowApi,
  };
  vm.runInNewContext(source, context);
  vm.runInNewContext(source, context);
  return { listeners: listeners, ports: ports, windowApi: windowApi };
}

test("reinjection replaces an invalid bridge without duplicating page listeners", function () {
  var state = loadTwice();

  assert.strictEqual(state.ports.length, 2);
  assert.strictEqual(state.ports[0].disconnected, true);
  assert.strictEqual(state.listeners.length, 1);

  state.listeners[0]({
    source: state.windowApi,
    data: { source: "clay-page", payload: { type: "clay_ext_command" } },
  });
  assert.strictEqual(state.ports[0].messages.length, 0);
  assert.strictEqual(state.ports[1].messages.length, 1);
});
