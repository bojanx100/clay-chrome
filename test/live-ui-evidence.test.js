var test = require("node:test");
var assert = require("node:assert");
var evidenceModule = require("../live-ui-evidence");

test("screenshot capture avoids debugger resize and rejects genuine movement", async function () {
  var previousCanvas = global.OffscreenCanvas;
  var previousImageBitmap = global.createImageBitmap;
  var debuggerAttached = false;
  var debuggerAttachCount = 0;
  var visibleCaptureCount = 0;
  var currentHeight = 800;
  global.OffscreenCanvas = function () {
    this.getContext = function () {
      return {
        drawImage: function () {},
        fillRect: function () {},
      };
    };
    this.convertToBlob = function () {
      return Promise.resolve({
        arrayBuffer: function () {
          return Promise.resolve(Buffer.from("masked-png"));
        },
      });
    };
  };
  global.createImageBitmap = function () {
    return Promise.resolve({
      width: 1200,
      height: 800,
      close: function () {},
    });
  };
  try {
    var chromeApi = {
      runtime: { lastError: null },
      tabs: {
        get: function (tabId, callback) {
          callback({ id: tabId, windowId: 9 });
        },
        query: function (query, callback) {
          callback([{ id: 42, windowId: query.windowId }]);
        },
        captureVisibleTab: function (windowId, options, callback) {
          visibleCaptureCount++;
          callback("data:image/png;base64," +
            Buffer.from("raw-png").toString("base64"));
        },
      },
      debugger: {
        attach: function (debuggee, version, callback) {
          debuggerAttachCount++;
          debuggerAttached = true;
          callback();
        },
        sendCommand: function (debuggee, method, options, callback) {
          callback({ data: Buffer.from("raw-png").toString("base64") });
        },
        detach: function (debuggee, callback) {
          debuggerAttached = false;
          callback();
        },
      },
      scripting: {
        executeScript: function (options, callback) {
          callback([{ result: {
            documentGeneration: "document-1",
            width: 1200,
            height: debuggerAttached ? 760 : currentHeight,
            scrollX: 0,
            scrollY: 0,
          } }]);
        },
      },
    };
    function capture() {
      return new Promise(function (resolve) {
        evidenceModule.captureMaskedScreenshot(chromeApi, {
          targetTabId: 42,
        }, {
          documentGeneration: "document-1",
          viewport: { width: 1200, height: 800, scrollX: 0, scrollY: 0 },
          masks: [],
        }, resolve);
      });
    }
    var result = await capture();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(debuggerAttachCount, 0);
    assert.strictEqual(visibleCaptureCount, 1);
    currentHeight = 799;
    var movedResult = await capture();
    assert.strictEqual(movedResult.ok, false);
    assert.match(movedResult.error, /page moved/);
  } finally {
    global.OffscreenCanvas = previousCanvas;
    global.createImageBitmap = previousImageBitmap;
  }
});
