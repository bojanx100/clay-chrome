var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

function loadEvaluateScript(chromeApi) {
  var source = fs.readFileSync(
    path.join(__dirname, "..", "background.js"), "utf8");
  var start = source.indexOf("function withDebugger");
  var end = source.indexOf("// MCP Bridge", start);
  assert.notStrictEqual(start, -1, "debugger helpers must exist");
  assert.notStrictEqual(end, -1, "MCP section marker must exist");
  var context = { chrome: chromeApi };
  vm.runInNewContext(source.substring(start, end), context);
  return context.evaluateScript;
}

function harness(options) {
  options = options || {};
  var calls = { attach: [], sendCommand: [], detach: [] };
  var chromeApi = {
    runtime: { lastError: null },
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
        callback(options.response);
        chromeApi.runtime.lastError = null;
      },
      detach: function (target, callback) {
        calls.detach.push(target);
        callback();
      },
    },
  };
  var evaluateScript = loadEvaluateScript(chromeApi);
  return {
    calls: calls,
    evaluate: function (script) {
      return new Promise(function (resolve) {
        evaluateScript({ tabId: 42, script: script }, resolve);
      });
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
