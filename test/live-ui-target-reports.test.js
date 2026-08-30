var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

function reportApi() {
  var context = { globalThis: {} };
  vm.runInNewContext(fs.readFileSync(path.join(
    __dirname, "..", "live-ui-target-reports.js"), "utf8"), context);
  return context.globalThis.ClayLiveUiTargetReports;
}

function matches(node, selector) {
  if (selector.charAt(0) === ".") {
    return String(node.className).split(" ").indexOf(selector.slice(1)) >= 0;
  }
  var attribute = /^\[data-report-id="(.*)"\]$/.exec(selector);
  return !!attribute && node.dataset.reportId === attribute[1];
}

function collect(node, selector, found) {
  for (var i = 0; i < node.children.length; i++) {
    if (matches(node.children[i], selector)) found.push(node.children[i]);
    collect(node.children[i], selector, found);
  }
  return found;
}

function fakeNode() {
  var node = {
    className: "",
    textContent: "",
    hidden: false,
    parent: null,
    dataset: {},
    children: [],
    style: { setProperty: function () {} },
    classList: {
      names: {},
      add: function (name) { node.classList.names[name] = true; },
      remove: function (name) { delete node.classList.names[name]; },
      contains: function (name) { return !!node.classList.names[name]; },
      toggle: function (name, on) {
        if (on) node.classList.add(name);
        else node.classList.remove(name);
      },
    },
    appendChild: function (child) {
      node.children.push(child);
      child.parent = node;
      return child;
    },
    remove: function () {
      if (!node.parent) return;
      var index = node.parent.children.indexOf(node);
      if (index >= 0) node.parent.children.splice(index, 1);
      node.parent = null;
    },
    querySelector: function (selector) {
      return collect(node, selector, [])[0] || null;
    },
    querySelectorAll: function (selector) {
      return collect(node, selector, []);
    },
  };
  return node;
}

function manager(reports) {
  var context = {
    globalThis: {},
    CSS: { escape: function (value) { return String(value); } },
    document: { createElement: function () { return fakeNode(); } },
    innerWidth: 1200,
    innerHeight: 800,
    setTimeout: function () { return 1; },
    clearTimeout: function () {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(
    __dirname, "..", "live-ui-target-reports.js"), "utf8"), context);
  var layer = fakeNode();
  var value = context.globalThis.ClayLiveUiTargetReports.create({
    highlightLayer: layer,
    resolveElement: function () {
      return {
        getBoundingClientRect: function () {
          return { left: 10, top: 10, width: 80, height: 20 };
        },
      };
    },
  });
  value.replace(reports);
  return { layer: layer, reports: value };
}

function outlineIds(layer) {
  return layer.querySelectorAll(".worker-outline").map(function (outline) {
    return outline.dataset.reportId;
  }).sort();
}

function working(reportId) {
  return {
    reportId: reportId,
    status: "working",
    worker: { label: reportId, color: "#55A7FF" },
    locator: { route: "/settings", selectors: ["#a"] },
  };
}

test("worker focus replaces the transient composer selection", function () {
  var calls = [];
  reportApi().syncSelectionFocus({
    reportId: "report-1",
    locator: { route: "/account", selectors: ["#clock"] },
  }, {
    clear: function (notify) { calls.push(["clear", notify]); },
    restore: function (locator, notify) {
      calls.push(["restore", locator.selectors[0], notify]);
    },
  });
  assert.deepStrictEqual(calls, [
    ["clear", true],
    ["restore", "#clock", false],
  ]);
});

test("leaving a worker clears its component selection", function () {
  var calls = [];
  reportApi().syncSelectionFocus(null, {
    clear: function (notify) { calls.push(["clear", notify]); },
    restore: function () { calls.push(["restore"]); },
  });
  assert.deepStrictEqual(calls, [["clear", true]]);
});

test("no worker outlines are drawn until a worker is picked", function () {
  var harness = manager([working("worker-1"), working("worker-2")]);
  assert.deepStrictEqual(outlineIds(harness.layer), []);
});

test("picking a worker shows only that worker's component", function () {
  var harness = manager([working("worker-1"), working("worker-2")]);
  harness.reports.focus("worker-2");
  assert.deepStrictEqual(outlineIds(harness.layer), ["worker-2"]);
});

test("leaving a worker removes its outline again", function () {
  var harness = manager([working("worker-1"), working("worker-2")]);
  harness.reports.focus("worker-1");
  harness.reports.focus(null);
  assert.deepStrictEqual(outlineIds(harness.layer), []);
});

test("the show-all flag reveals every open worker", function () {
  var harness = manager([working("worker-1"), working("worker-2")]);
  harness.reports.setShowAllWorkers(true);
  assert.deepStrictEqual(outlineIds(harness.layer), ["worker-1", "worker-2"]);
});

test("turning the show-all flag off collapses back to the picked worker", function () {
  var harness = manager([working("worker-1"), working("worker-2")]);
  harness.reports.setShowAllWorkers(true);
  harness.reports.focus("worker-1");
  harness.reports.setShowAllWorkers(false);
  assert.deepStrictEqual(outlineIds(harness.layer), ["worker-1"]);
});

test("the show-all flag ignores workers that are no longer open", function () {
  var finished = working("worker-2");
  finished.status = "completed";
  var harness = manager([working("worker-1"), finished]);
  harness.reports.setShowAllWorkers(true);
  assert.deepStrictEqual(outlineIds(harness.layer), ["worker-1"]);
});

test("a picked worker stays visible even after it finishes", function () {
  var finished = working("worker-1");
  finished.status = "completed";
  var harness = manager([finished]);
  harness.reports.focus("worker-1");
  assert.deepStrictEqual(outlineIds(harness.layer), ["worker-1"]);
});

test("the show-all flag is reported to the panel", function () {
  var harness = manager([working("worker-1")]);
  assert.strictEqual(harness.reports.snapshot().showAllWorkers, false);
  harness.reports.setShowAllWorkers(true);
  assert.strictEqual(harness.reports.snapshot().showAllWorkers, true);
});
