var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

function fakeElement() {
  return {
    textContent: "",
    className: "",
    disabled: false,
    value: "",
    children: [],
    classList: {
      add: function () {},
      remove: function () {},
    },
    addEventListener: function () {},
    appendChild: function (child) { this.children.push(child); },
  };
}

test("DevTools panel recovers when an extension reload invalidates its context", function () {
  var root = path.join(__dirname, "..");
  var runtimePath = path.join(root, "devtools-panel-runtime.js");
  var source = fs.existsSync(runtimePath) ?
    fs.readFileSync(runtimePath, "utf8") + "\n" : "";
  source += fs.readFileSync(path.join(root, "devtools-panel.js"), "utf8");
  var elements = {};
  var reloads = 0;
  var intervalStarts = 0;
  var context = {
    chrome: {
      devtools: { inspectedWindow: { tabId: 43 } },
      runtime: {
        sendMessage: function () {
          throw new Error("Extension context invalidated.");
        },
      },
    },
    document: {
      activeElement: null,
      getElementById: function (id) {
        if (!elements[id]) elements[id] = fakeElement();
        return elements[id];
      },
      createElement: function () { return fakeElement(); },
    },
    window: {
      location: { reload: function () { reloads++; } },
      addEventListener: function () {},
    },
    ClayLiveUiDevtoolsWorkspace: {
      create: function () {
        return { render: function () {}, reset: function () {} };
      },
    },
    setInterval: function () { intervalStarts++; return 1; },
    clearInterval: function () {},
    setTimeout: function (callback) { callback(); return 1; },
  };

  assert.doesNotThrow(function () { vm.runInNewContext(source, context); });
  context.loadState();
  assert.strictEqual(reloads, 1);
  assert.strictEqual(intervalStarts, 0);
  assert.strictEqual(elements.connectionLabel.textContent, "Reloading");
  assert.match(elements.panelStatus.textContent, /extension was updated/i);
});
