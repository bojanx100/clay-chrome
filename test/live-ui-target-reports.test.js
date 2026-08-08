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
