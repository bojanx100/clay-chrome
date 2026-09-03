var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

var tabGroups = require("../tab-groups");

function harness(options) {
  var opts = options || {};
  var groups = (opts.groups || []).slice();
  var calls = { group: [], query: [], update: [] };
  var pendingQueries = [];
  var nextGroupId = 100;
  var chromeApi = {
    runtime: { lastError: null },
    tabs: {
      group: function (groupOptions, callback) {
        calls.group.push(groupOptions);
        var groupId = groupOptions.groupId;
        if (groupId === undefined) {
          groupId = nextGroupId++;
          groups.push({ id: groupId, title: "", color: "grey",
            windowId: opts.windowId || 7 });
        }
        callback(groupId);
      },
    },
    tabGroups: {
      query: function (query, callback) {
        calls.query.push(query);
        var answer = function () { callback(groups.filter(function (group) {
          return group.windowId === query.windowId;
        })); };
        if (opts.deferQuery) pendingQueries.push(answer);
        else answer();
      },
      update: function (groupId, changes, callback) {
        calls.update.push({ groupId: groupId, changes: changes });
        for (var i = 0; i < groups.length; i++) {
          if (groups[i].id === groupId) groups[i] = Object.assign({}, groups[i], changes);
        }
        callback();
      },
    },
  };
  return {
    calls: calls,
    groups: groups,
    manager: tabGroups.create(chromeApi),
    releaseQuery: function () {
      var answer = pendingQueries.shift();
      if (answer) answer();
    },
  };
}

function add(manager, tab) {
  return new Promise(function (resolve) { manager.add(tab, resolve); });
}

test("first MCP tab creates a labelled purple Clay AI group", async function () {
  var state = harness({ windowId: 7 });
  var result = await add(state.manager, { id: 41, windowId: 7 });

  assert.deepStrictEqual(result, { ok: true, groupId: 100, created: true });
  assert.deepStrictEqual(state.calls.group, [{ tabIds: [41] }]);
  assert.deepStrictEqual(state.calls.update, [{
    groupId: 100,
    changes: { title: "Clay AI", color: "purple" },
  }]);
});

test("later MCP tabs reuse the Clay AI group without resetting user choices", async function () {
  var state = harness({ groups: [{ id: 23, title: "Clay AI", color: "blue",
    collapsed: true, windowId: 7 }] });
  var result = await add(state.manager, { id: 42, windowId: 7 });

  assert.deepStrictEqual(result, { ok: true, groupId: 23, created: false });
  assert.deepStrictEqual(state.calls.group, [{ tabIds: [42], groupId: 23 }]);
  assert.deepStrictEqual(state.calls.update, [],
    "reusing the group must preserve the user's color and collapsed state");
});

test("Clay AI groups stay scoped to their browser window", async function () {
  var state = harness({ groups: [{ id: 23, title: "Clay AI", color: "purple",
    windowId: 8 }], windowId: 7 });
  var result = await add(state.manager, { id: 43, windowId: 7 });

  assert.strictEqual(result.created, true);
  assert.strictEqual(result.groupId, 100);
  assert.deepStrictEqual(state.calls.query, [{ windowId: 7 }]);
  assert.deepStrictEqual(state.calls.group, [{ tabIds: [43] }]);
});

test("missing tab-group APIs fail closed without throwing", async function () {
  var manager = tabGroups.create({ runtime: {}, tabs: {} });
  var result = await add(manager, { id: 44, windowId: 7 });

  assert.deepStrictEqual(result, { ok: false, reason: "tab_groups_unavailable" });
});

test("concurrent opens serialize group creation and reuse one group", async function () {
  var state = harness({ windowId: 7, deferQuery: true });
  var first = add(state.manager, { id: 45, windowId: 7 });
  var second = add(state.manager, { id: 46, windowId: 7 });

  assert.strictEqual(state.calls.query.length, 1,
    "the second open must wait while group discovery is in flight");
  state.releaseQuery();
  state.releaseQuery();
  var results = await Promise.all([first, second]);

  assert.deepStrictEqual(results, [
    { ok: true, groupId: 100, created: true },
    { ok: true, groupId: 100, created: false },
  ]);
  assert.deepStrictEqual(state.calls.group, [
    { tabIds: [45] },
    { tabIds: [46], groupId: 100 },
  ]);
  assert.strictEqual(state.calls.update.length, 1,
    "one browser window must create and style only one Clay AI group");
});

test("tab_open returns the created tab only after grouping it", function () {
  var source = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
  var start = source.indexOf("function openTab");
  var end = source.indexOf("function closeTab", start);
  var calls = [];
  var result = null;
  var context = {
    chrome: { tabs: { create: function (options, callback) {
      calls.push(["create", options]);
      callback({ id: 47, windowId: 7 });
    } } },
    clayTabGroups: { add: function (tab, callback) {
      calls.push(["group", tab]);
      callback({ ok: true, groupId: 100 });
    } },
  };
  vm.runInNewContext(source.substring(start, end), context);

  context.openTab({ url: "https://example.com", active: false }, function (value) {
    result = value;
  });

  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [
    ["create", { url: "https://example.com", active: false }],
    ["group", { id: 47, windowId: 7 }],
  ]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { tabId: 47, groupId: 100 });
});

test("manifest grants the tab-group permission used by the runtime", function () {
  var manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  assert.strictEqual(manifest.permissions.indexOf("tabGroups") !== -1, true);
});
