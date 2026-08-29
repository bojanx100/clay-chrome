var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

// broadcastTabList runs inside a vm realm, so the arrays and objects it builds
// do not share prototypes with this realm and would fail deepStrictEqual even
// when structurally identical. Normalize before comparing.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadBroadcastTabList(options) {
  options = options || {};
  var source = fs.readFileSync(
    path.join(__dirname, "..", "background.js"), "utf8");
  var start = source.indexOf("function broadcastTabList");
  var end = source.indexOf("// --- Injection ---", start);
  assert.notStrictEqual(start, -1, "broadcastTabList must exist");
  assert.notStrictEqual(end, -1, "injection section marker must exist");

  var provideTabs = typeof options.tabs === "function"
    ? options.tabs
    : function () { return options.tabs || []; };

  var context = {
    allTabs: [],
    clayPorts: options.clayPorts || {},
    chrome: {
      runtime: { id: "test-extension-id" },
      tabs: {
        query: function (_criteria, callback) { callback(provideTabs()); },
      },
    },
  };
  vm.runInNewContext(source.substring(start, end), context);
  return context;
}

function recordingPort(sent) {
  return {
    postMessage: function (message) { sent.push(message); },
  };
}

function idsOf(tabs) {
  return plain(tabs).map(function (tab) { return tab.id; });
}

test("tab list keeps only http and https tabs", function () {
  var context = loadBroadcastTabList({
    tabs: [
      { id: 1, url: "https://example.com/", title: "Example" },
      { id: 2, url: "http://localhost:3000/", title: "Dev" },
      { id: 3, url: "chrome://extensions", title: "Extensions" },
      { id: 4, url: "file:///tmp/page.html", title: "Local file" },
      { id: 5, url: "about:blank", title: "Blank" },
      { id: 6, url: "", title: "Pending" },
    ],
    clayPorts: { "99": recordingPort([]) },
  });
  context.broadcastTabList();

  assert.deepStrictEqual(idsOf(context.allTabs), [1, 2],
    "non-http schemes are not scriptable and must be filtered out");
});

test("tab list includes Clay tabs so Live UI can reuse them", function () {
  var context = loadBroadcastTabList({
    tabs: [
      { id: 7, url: "https://clay.studio/chat", title: "Clay" },
      { id: 8, url: "https://example.com/", title: "Example" },
    ],
    clayPorts: { "99": recordingPort([]) },
  });
  context.broadcastTabList();

  // Upstream chadbyte/clay-chrome excluded every Clay tab globally via
  // isClayTab(). Live UI must be able to see and reuse an existing Clay tab,
  // so that global exclusion was intentionally removed in a8034a5.
  assert.deepStrictEqual(idsOf(context.allTabs), [7, 8]);
});

test("each Clay port receives the list without its own tab", function () {
  var firstSent = [];
  var secondSent = [];
  var context = loadBroadcastTabList({
    tabs: [
      { id: 10, url: "https://clay.studio/a", title: "Clay A" },
      { id: 20, url: "https://clay.studio/b", title: "Clay B" },
      { id: 30, url: "https://example.com/", title: "Example" },
    ],
    clayPorts: {
      "10": recordingPort(firstSent),
      "20": recordingPort(secondSent),
    },
  });
  context.broadcastTabList();

  assert.strictEqual(firstSent.length, 1);
  assert.deepStrictEqual(idsOf(firstSent[0].tabs), [20, 30],
    "a Clay tab must not see itself but must still see the other Clay tab");
  assert.deepStrictEqual(idsOf(secondSent[0].tabs), [10, 30]);
});

test("broadcast carries the message type and extension id", function () {
  var sent = [];
  var context = loadBroadcastTabList({
    tabs: [{ id: 1, url: "https://example.com/", title: "Example" }],
    clayPorts: { "99": recordingPort(sent) },
  });
  context.broadcastTabList();

  assert.strictEqual(sent[0].type, "clay_ext_tab_list");
  assert.strictEqual(sent[0].extensionId, "test-extension-id");
});

test("missing tab fields are normalized to empty strings", function () {
  var context = loadBroadcastTabList({
    tabs: [{ id: 1, url: "https://example.com/" }],
    clayPorts: { "99": recordingPort([]) },
  });
  context.broadcastTabList();

  assert.deepStrictEqual(plain(context.allTabs)[0], {
    id: 1,
    url: "https://example.com/",
    title: "",
    favIconUrl: "",
  });
});

test("ports that fail to receive are dropped", function () {
  var liveSent = [];
  var clayPorts = {
    "11": {
      postMessage: function () { throw new Error("port closed"); },
    },
    "22": recordingPort(liveSent),
  };
  var context = loadBroadcastTabList({
    tabs: [{ id: 33, url: "https://example.com/", title: "Example" }],
    clayPorts: clayPorts,
  });
  context.broadcastTabList();

  assert.deepStrictEqual(Object.keys(clayPorts), ["22"],
    "a disconnected port must be removed rather than retried forever");
  assert.strictEqual(liveSent.length, 1,
    "one failing port must not stop delivery to the others");
});

test("repeated broadcasts do not accumulate stale tabs", function () {
  var currentTabs = [
    { id: 1, url: "https://example.com/", title: "Example" },
    { id: 2, url: "https://other.com/", title: "Other" },
  ];
  var context = loadBroadcastTabList({
    tabs: function () { return currentTabs; },
    clayPorts: { "99": recordingPort([]) },
  });

  context.broadcastTabList();
  assert.deepStrictEqual(idsOf(context.allTabs), [1, 2]);

  currentTabs = [{ id: 1, url: "https://example.com/", title: "Example" }];
  context.broadcastTabList();

  assert.deepStrictEqual(idsOf(context.allTabs), [1],
    "allTabs must be rebuilt each broadcast, not appended to");
});
