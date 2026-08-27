var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

test("content bridge forwards the extension port disconnect reason", function () {
  var source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  var posted = [];
  var disconnectListener = null;
  var port = {
    onMessage: { addListener: function () {} },
    onDisconnect: {
      addListener: function (listener) { disconnectListener = listener; },
    },
    postMessage: function () {},
  };
  var chromeApi = {
    runtime: {
      id: "extension-id",
      lastError: null,
      connect: function () { return port; },
    },
  };
  var windowApi = {
    postMessage: function (message) { posted.push(message); },
    addEventListener: function () {},
  };
  windowApi.window = windowApi;
  vm.runInNewContext(source, {
    chrome: chromeApi,
    window: windowApi,
    console: { log: function () {} },
    setTimeout: function () { return 1; },
    clearTimeout: function () {},
  });

  chromeApi.runtime.lastError = { message: "Extension context invalidated" };
  disconnectListener();

  var event = posted.find(function (message) {
    return message.payload && message.payload.type === "clay_ext_disconnected";
  });
  assert.ok(event);
  assert.strictEqual(event.payload.reason, "Extension context invalidated");
});

test("content bridge detects an invalidated runtime without a supplied error", function () {
  var source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
  var posted = [];
  var disconnectListener = null;
  var port = {
    onMessage: { addListener: function () {} },
    onDisconnect: {
      addListener: function (listener) { disconnectListener = listener; },
    },
    postMessage: function () {},
  };
  var chromeApi = {
    runtime: {
      id: "extension-id",
      lastError: null,
      connect: function () { return port; },
    },
  };
  var windowApi = {
    postMessage: function (message) { posted.push(message); },
    addEventListener: function () {},
  };
  windowApi.window = windowApi;
  vm.runInNewContext(source, {
    chrome: chromeApi,
    window: windowApi,
    console: { log: function () {} },
    setTimeout: function () { return 1; },
    clearTimeout: function () {},
  });

  delete chromeApi.runtime.id;
  disconnectListener();

  var event = posted.find(function (message) {
    return message.payload && message.payload.type === "clay_ext_disconnected";
  });
  assert.ok(event);
  assert.strictEqual(event.payload.reason, "Extension context invalidated.");
});
