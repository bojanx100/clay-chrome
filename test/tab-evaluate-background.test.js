var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

function loadDebuggerCommands(chromeApi) {
  var source = fs.readFileSync(
    path.join(__dirname, "..", "background.js"), "utf8");
  var start = source.indexOf("function withDebugger");
  var end = source.indexOf("// MCP Bridge", start);
  assert.notStrictEqual(start, -1, "debugger helpers must exist");
  assert.notStrictEqual(end, -1, "MCP section marker must exist");
  var context = {
    chrome: chromeApi,
    clearTimeout: clearTimeout,
    setTimeout: setTimeout,
  };
  vm.runInNewContext(source.substring(start, end), context);
  return context;
}

function loadReconnectCommand(spies) {
  var source = fs.readFileSync(
    path.join(__dirname, "..", "background.js"), "utf8");
  var start = source.indexOf("function reconnectExtension");
  var end = source.indexOf("\n}\n", start);
  assert.notStrictEqual(start, -1, "reconnect command must exist");
  assert.notStrictEqual(end, -1, "reconnect command must be bounded");
  var context = {
    broadcastTabList: function () { spies.tabList++; },
    broadcastMcpServers: function () { spies.mcpServers++; },
  };
  vm.runInNewContext(source.substring(start, end + 3), context);
  return context.reconnectExtension;
}

function harness(options) {
  options = options || {};
  var calls = {
    attach: [],
    sendCommand: [],
    detach: [],
    tabsGet: [],
  };
  var tab = options.tab || {
    id: 42,
    discarded: false,
    status: "complete",
  };
  var updatedListeners = [];
  var chromeApi = {
    runtime: { lastError: null },
    tabs: {
      get: function (tabId, callback) {
        calls.tabsGet.push(tabId);
        chromeApi.runtime.lastError = options.tabError
          ? { message: options.tabError }
          : null;
        callback(options.tabError ? null : tab);
        chromeApi.runtime.lastError = null;
      },
      onUpdated: {
        addListener: function (listener) {
          updatedListeners.push(listener);
        },
        removeListener: function (listener) {
          var index = updatedListeners.indexOf(listener);
          if (index !== -1) updatedListeners.splice(index, 1);
        },
      },
    },
    debugger: {
      attach: function (target, version, callback) {
        calls.attach.push({ target: target, version: version });
        chromeApi.runtime.lastError = options.attachError
          ? { message: options.attachError }
          : null;
        callback();
        chromeApi.runtime.lastError = null;
      },
      sendCommand: function (target, method, params, callback) {
        calls.sendCommand.push({
          target: target,
          method: method,
          params: params,
        });
        chromeApi.runtime.lastError = options.commandError
          ? { message: options.commandError }
          : null;
        var response = typeof options.commandResponse === "function"
          ? options.commandResponse(method, params, calls.sendCommand.length - 1)
          : options.response;
        callback(response);
        chromeApi.runtime.lastError = null;
      },
      detach: function (target, callback) {
        calls.detach.push(target);
        callback();
      },
    },
  };
  var commands = loadDebuggerCommands(chromeApi);
  return {
    calls: calls,
    evaluate: function (script) {
      return new Promise(function (resolve) {
        commands.evaluateScript({ tabId: 42, script: script }, resolve);
      });
    },
    click: function (selector) {
      return new Promise(function (resolve) {
        commands.clickElement({ tabId: 42, selector: selector }, resolve);
      });
    },
    screenshot: function (selector) {
      return new Promise(function (resolve) {
        commands.takeScreenshot({ tabId: 42, selector: selector }, resolve);
      });
    },
    completeNavigation: function () {
      tab.status = "complete";
      var listeners = updatedListeners.slice();
      for (var i = 0; i < listeners.length; i++) {
        listeners[i](42, { status: "complete" }, tab);
      }
    },
    updatedListenerCount: function () {
      return updatedListeners.length;
    },
  };
}

test("tab_evaluate uses CSP-safe debugger evaluation and returns a value", async function () {
  var state = harness({
    response: { result: { type: "number", value: 42 } },
  });
  var result = await state.evaluate("document.querySelectorAll('button').length");

  assert.strictEqual(result.value, 42);
  assert.strictEqual(state.calls.attach.length, 1);
  assert.strictEqual(state.calls.attach[0].target.tabId, 42);
  assert.strictEqual(state.calls.sendCommand.length, 1);
  assert.strictEqual(state.calls.sendCommand[0].method, "Runtime.evaluate");
  assert.strictEqual(
    state.calls.sendCommand[0].params.expression,
    "document.querySelectorAll('button').length");
  assert.strictEqual(state.calls.sendCommand[0].params.returnByValue, true);
  assert.strictEqual(state.calls.sendCommand[0].params.awaitPromise, true);
  assert.strictEqual(
    state.calls.sendCommand[0].params.allowUnsafeEvalBlockedByCSP,
    false);
  assert.strictEqual(state.calls.detach.length, 1);
});

test("tab_evaluate returns thrown page errors and detaches", async function () {
  var state = harness({
    response: {
      result: {
        type: "object",
        subtype: "error",
        className: "Error",
        description: "Error: boom\n    at <anonymous>:1:7",
      },
      exceptionDetails: {
        text: "Uncaught",
        exception: {
          className: "Error",
          description: "Error: boom\n    at <anonymous>:1:7",
        },
      },
    },
  });
  var result = await state.evaluate("throw new Error('boom')");

  assert.strictEqual(result.error, "boom");
  assert.strictEqual(state.calls.detach.length, 1);
});

test("tab_evaluate requests by-value serialization for structured results", async function () {
  var state = harness({
    response: {
      result: {
        type: "object",
        value: { count: 2, labels: ["save", "cancel"], optional: null },
      },
    },
  });
  var result = await state.evaluate("({ count: 2, labels: ['save', 'cancel'], optional: null })");

  assert.strictEqual(
    JSON.stringify(result.value),
    JSON.stringify({ count: 2, labels: ["save", "cancel"], optional: null }));
  assert.strictEqual(state.calls.sendCommand[0].params.returnByValue, true);
});

test("tab_evaluate reports values that cannot be serialized", async function () {
  var state = harness({
    commandError: "Object could not be returned by value",
  });
  var result = await state.evaluate("window");

  assert.strictEqual(result.error, "Object could not be returned by value");
  assert.strictEqual(state.calls.detach.length, 1);
});

test("tab_evaluate returns restricted-page attach errors without evaluating", async function () {
  var state = harness({
    attachError: "Cannot access a chrome:// URL",
  });
  var result = await state.evaluate("document.title");

  assert.strictEqual(result.error, "Cannot access a chrome:// URL");
  assert.strictEqual(state.calls.sendCommand.length, 0);
  assert.strictEqual(state.calls.detach.length, 0);
});

test("tab_click dispatches trusted pointer input at the element center", async function () {
  var state = harness({
    commandResponse: function (method) {
      if (method === "Runtime.evaluate") {
        return { result: { value: { x: 10, y: 20, width: 100, height: 40 } } };
      }
      return {};
    },
  });
  var result = await state.click("#save");

  assert.strictEqual(result.success, true);
  assert.deepStrictEqual(state.calls.sendCommand.map(function (call) {
    return call.method;
  }), [
    "Runtime.evaluate",
    "Input.dispatchMouseEvent",
    "Input.dispatchMouseEvent",
    "Input.dispatchMouseEvent",
  ]);
  assert.strictEqual(state.calls.sendCommand[1].params.type, "mouseMoved");
  assert.strictEqual(state.calls.sendCommand[1].params.x, 60);
  assert.strictEqual(state.calls.sendCommand[1].params.y, 40);
  assert.strictEqual(state.calls.sendCommand[2].params.type, "mousePressed");
  assert.strictEqual(state.calls.sendCommand[3].params.type, "mouseReleased");
  assert.strictEqual(state.calls.detach.length, 1);
});

test("tab_screenshot waits for navigation and primes the renderer", async function () {
  var state = harness({
    tab: { id: 42, discarded: false, status: "loading" },
    commandResponse: function (method) {
      if (method === "Runtime.evaluate") {
        return { result: { value: "complete" } };
      }
      if (method === "Page.captureScreenshot") {
        return { data: "fresh-png" };
      }
      return {};
    },
  });

  var pending = state.screenshot();
  assert.strictEqual(state.calls.attach.length, 0);
  assert.strictEqual(state.updatedListenerCount(), 1);

  state.completeNavigation();
  var result = await pending;

  assert.strictEqual(result.image, "fresh-png");
  assert.deepStrictEqual(state.calls.sendCommand.map(function (call) {
    return call.method;
  }), ["Runtime.evaluate", "Page.captureScreenshot"]);
  assert.strictEqual(
    state.calls.sendCommand[0].params.expression,
    "document.readyState");
  assert.strictEqual(state.calls.detach.length, 1);
  assert.strictEqual(state.updatedListenerCount(), 0);
});

test("tab_screenshot rejects discarded tabs before debugger attach", async function () {
  var state = harness({
    tab: { id: 42, discarded: true, status: "unloaded" },
  });

  var result = await state.screenshot();

  assert.match(result.error, /discarded/);
  assert.strictEqual(state.calls.attach.length, 0);
  assert.strictEqual(state.calls.sendCommand.length, 0);
  assert.strictEqual(state.calls.detach.length, 0);
  assert.strictEqual(state.updatedListenerCount(), 0);
});

test("extension reconnect rebroadcasts browser and MCP state", function () {
  var spies = { tabList: 0, mcpServers: 0 };
  var reconnectExtension = loadReconnectCommand(spies);
  var result = null;
  reconnectExtension({}, function (value) { result = value; });

  assert.strictEqual(spies.tabList, 1);
  assert.strictEqual(spies.mcpServers, 1);
  assert.strictEqual(result.connected, true);
});
