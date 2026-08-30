var test = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

function fakeElement(tag, text) {
  return {
    tagName: String(tag).toUpperCase(),
    innerText: text === undefined ? "" : text,
    textContent: text === undefined ? "" : text,
    getAttribute: function () { return null; },
  };
}

function contextApi(pathname, matches, hash) {
  function all(selector) {
    if (!Object.prototype.hasOwnProperty.call(matches, selector)) return [];
    var value = matches[selector];
    return [].concat(value);
  }
  var context = {
    globalThis: {},
    location: { pathname: pathname, hash: hash || "" },
    document: {
      querySelector: function (selector) { return all(selector)[0] || null; },
      querySelectorAll: function (selector) { return all(selector); },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(
    __dirname, "..", "live-ui-target-context.js"), "utf8"), context);
  return context.globalThis.ClayLiveUiTargetContext;
}

test("a picked component resolves on the route it was picked on", function () {
  var target = fakeElement("button", "Save changes");
  var api = contextApi("/settings", { "#save": target });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), target);
});

test("a picked component does not resolve on a different screen", function () {
  var stranger = fakeElement("button", "Save changes");
  var api = contextApi("/hearing-room", { "#save": stranger });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), null);
});

test("query string and hash changes do not hide a same-screen component", function () {
  var target = fakeElement("button", "Save changes");
  var api = contextApi("/settings", { "#save": target });
  assert.strictEqual(api.resolveElement({
    route: "/settings?tab=2#panel",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), target);
});

test("a structural selector that lands on the wrong tag is rejected", function () {
  var wrong = fakeElement("select", "");
  var api = contextApi("/settings", { "div > div:nth-of-type(2) > span": wrong });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "span",
    text: "Render dimension low",
    selectors: ["div > div:nth-of-type(2) > span"],
  }), null);
});

test("a structural selector that lands on unrelated text is rejected", function () {
  var wrong = fakeElement("span", "Enable screen share");
  var api = contextApi("/settings", { "div > span:nth-of-type(3)": wrong });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "span",
    text: "Render dimension low",
    selectors: ["div > span:nth-of-type(3)"],
  }), null);
});

test("resolution falls through to a later selector when the first fails verification", function () {
  var wrong = fakeElement("span", "Enable screen share");
  var right = fakeElement("span", "Render dimension low");
  var api = contextApi("/settings", {
    "div > span:nth-of-type(3)": wrong,
    "#renderLow": right,
  });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "span",
    text: "Render dimension low",
    selectors: ["div > span:nth-of-type(3)", "#renderLow"],
  }), right);
});

test("truncated recorded text still matches the live element", function () {
  // Must use a structural selector: a stable selector skips text verification
  // entirely, so this would pass no matter how the prefix logic behaved.
  var target = fakeElement("p", "Only show documents when participant is in room");
  var api = contextApi("/settings", { "div > p": target });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "p",
    text: "Only show documents when participant",
    selectors: ["div > p"],
  }), target);
});

test("inputs carry no recorded text and verify on tag alone", function () {
  var target = fakeElement("input");
  var api = contextApi("/settings", { "#realTimeLink": target });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "input",
    text: null,
    selectors: ["#realTimeLink"],
  }), target);
});

test("locators recorded before route tracking still resolve", function () {
  var target = fakeElement("button", "Save changes");
  var api = contextApi("/anywhere", { "#save": target });
  assert.strictEqual(api.resolveElement({ selectors: ["#save"] }), target);
});

test("an id-anchored component survives its own text changing under HMR", function () {
  var target = fakeElement("button", "Saved!");
  var api = contextApi("/settings", { "#save": target });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), target);
});

test("a test-id anchored component survives its own text changing", function () {
  var target = fakeElement("span", "5 items");
  var api = contextApi("/settings", { '[data-testid="count"]': target });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "span",
    text: "3 items",
    selectors: ['[data-testid="count"]'],
  }), target);
});

test("a named field anchored component is not text verified", function () {
  var target = fakeElement("select", "");
  var api = contextApi("/settings", { 'select[name="renderLow"]': target });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "select",
    text: "Low (160 x 90)",
    selectors: ['select[name="renderLow"]'],
  }), target);
});

test("a bare tag fallback is still text verified", function () {
  var wrong = fakeElement("span", "Enable screen share");
  var api = contextApi("/settings", { span: wrong });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "span",
    text: "Render dimension low",
    selectors: ["span"],
  }), null);
});

test("a hash router does not leak a component across its screens", function () {
  var stranger = fakeElement("button", "Save changes");
  var api = contextApi("/", { "#save": stranger }, "#/hearing-room");
  assert.strictEqual(api.resolveElement({
    route: "/#/settings",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), null);
});

test("a hash router resolves a component on its own screen", function () {
  var target = fakeElement("button", "Save changes");
  var api = contextApi("/", { "#save": target }, "#/settings");
  assert.strictEqual(api.resolveElement({
    route: "/#/settings",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), target);
});

test("a plain anchor fragment is not treated as a screen change", function () {
  var target = fakeElement("button", "Save changes");
  var api = contextApi("/settings", { "#save": target }, "#realtime");
  assert.strictEqual(api.resolveElement({
    route: "/settings#hearing",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), target);
});

test("a trailing slash does not hide a same-screen component", function () {
  var target = fakeElement("button", "Save changes");
  var api = contextApi("/settings", { "#save": target });
  assert.strictEqual(api.resolveElement({
    route: "/settings/",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), target);
});

test("a shared name attribute does not resolve to the wrong control", function () {
  // Radio groups share a name by design, so `input[name="x"]` is ambiguous
  // even though it looks stable.
  var cancel = fakeElement("button", "Cancel changes");
  var save = fakeElement("button", "Save changes");
  var api = contextApi("/settings", { 'button[name="act"]': [cancel, save] });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "button",
    text: "Save changes",
    selectors: ['button[name="act"]'],
  }), save);
});

test("an ambiguous selector with no verifiable match resolves to nothing", function () {
  var first = fakeElement("button", "Cancel changes");
  var second = fakeElement("button", "Delete everything");
  var api = contextApi("/settings", { 'button[name="act"]': [first, second] });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "button",
    text: "Save changes",
    selectors: ['button[name="act"]'],
  }), null);
});

test("a duplicated id is treated as ambiguous rather than trusted", function () {
  var wrong = fakeElement("span", "Enable screen share");
  var right = fakeElement("span", "Render dimension low");
  var api = contextApi("/settings", { "#row": [wrong, right] });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "span",
    text: "Render dimension low",
    selectors: ["#row"],
  }), right);
});

test("a hashbang router does not leak a component across its screens", function () {
  var stranger = fakeElement("button", "Save changes");
  var api = contextApi("/", { "#save": stranger }, "#!/hearing-room");
  assert.strictEqual(api.resolveElement({
    route: "/#!/settings",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), null);
});

test("a hashbang router resolves a component on its own screen", function () {
  var target = fakeElement("button", "Save changes");
  var api = contextApi("/", { "#save": target }, "#!/settings");
  assert.strictEqual(api.resolveElement({
    route: "/#!/settings",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), target);
});

test("a trailing slash inside a hash route does not hide a component", function () {
  var target = fakeElement("button", "Save changes");
  var api = contextApi("/", { "#save": target }, "#/settings");
  assert.strictEqual(api.resolveElement({
    route: "/#/settings/",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), target);
});

test("a query string inside a hash route does not hide a component", function () {
  var target = fakeElement("button", "Save changes");
  var api = contextApi("/", { "#save": target }, "#/settings?tab=2");
  assert.strictEqual(api.resolveElement({
    route: "/#/settings?tab=5",
    tag: "button",
    text: "Save changes",
    selectors: ["#save"],
  }), target);
});

test("an unrecognized selector shape is text verified rather than trusted", function () {
  // Custom element names may contain "_" and non-ASCII characters. An
  // unrecognized shape must fail closed, not skip verification.
  var wrong = fakeElement("x-foo_bar", "Enable screen share");
  var api = contextApi("/settings", { "div > x-foo_bar:nth-of-type(2)": wrong });
  assert.strictEqual(api.resolveElement({
    route: "/settings",
    tag: "x-foo_bar",
    text: "Render dimension low",
    selectors: ["div > x-foo_bar:nth-of-type(2)"],
  }), null);
});
