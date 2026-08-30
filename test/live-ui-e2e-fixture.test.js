var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");

var FIXTURE = path.join(__dirname, "e2e", "live-ui-highlight.e2e.html");

function fixture() {
  return fs.readFileSync(FIXTURE, "utf8");
}

test("the end-to-end fixture exists and is documented", function () {
  assert.ok(fs.existsSync(FIXTURE));
  assert.ok(fs.existsSync(path.join(__dirname, "e2e", "README.md")));
});

test("the end-to-end fixture loads the real modules, not copies", function () {
  var source = fixture();
  var scripts = source.match(/<script src="([^"]+)"><\/script>/g) || [];
  assert.ok(scripts.length >= 3);
  var referenced = scripts.map(function (tag) {
    return /src="([^"]+)"/.exec(tag)[1];
  });
  var wanted = [
    "../../live-ui-target-context.js",
    "../../live-ui-target-ui.js",
    "../../live-ui-target-reports.js",
  ];
  for (var i = 0; i < wanted.length; i++) {
    assert.ok(referenced.indexOf(wanted[i]) >= 0, "missing " + wanted[i]);
  }
  for (var j = 0; j < referenced.length; j++) {
    assert.ok(fs.existsSync(path.join(__dirname, "e2e", referenced[j])),
      "unresolvable script path " + referenced[j]);
  }
});

test("the end-to-end fixture still reproduces the original bug", function () {
  var source = fixture();
  assert.match(source, /BUG REPRO/);
  assert.match(source, /history\.pushState/);
  assert.match(source, /selectionPacket/);
  assert.match(source, /resolveElement/);
  assert.match(source, /setShowAllWorkers/);
  assert.match(source, /getBoundingClientRect/);
});

test("the end-to-end fixture reports a machine readable result", function () {
  assert.match(fixture(), /__clayE2E/);
});
