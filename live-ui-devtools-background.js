(function (root) {
  var ACTIONS = {
    "selection.pick": true,
    "selection.clear": true,
    "report.focus": true,
    "report.submit": true,
    "report.approve": true,
    snapshot: true,
  };

  function safeId(value) {
    return typeof value === "string" ? value.slice(0, 200) : null;
  }

  function safePayload(action, value) {
    var input = value || {};
    if (action === "report.submit") {
      return {
        text: String(input.text || "").slice(0, 12000),
        reportId: safeId(input.reportId),
      };
    }
    if (action === "report.focus" || action === "report.approve") {
      return { reportId: safeId(input.reportId) };
    }
    return {};
  }

  function createBridge(chromeApi, runtime) {
    function pairingFor(message) {
      var pairings = runtime.getPairings();
      for (var i = 0; i < pairings.length; i++) {
        if (Number(pairings[i].targetTabId) === Number(message.targetTabId) &&
            pairings[i].pairingId === message.pairingId) return pairings[i];
      }
      return null;
    }

    function handleMessage(message, sendResponse) {
      if (!message || message.type !== "live_ui_devtools_command") return false;
      if (!ACTIONS[message.action]) {
        sendResponse({ ok: false, error: "Unsupported Live UI action" });
        return true;
      }
      var pairing = pairingFor(message);
      if (!pairing) {
        sendResponse({ ok: false, error: "The inspected page is not paired" });
        return true;
      }
      chromeApi.tabs.sendMessage(pairing.targetTabId, {
        type: "live_ui_devtools_command",
        pairingId: pairing.pairingId,
        action: message.action,
        payload: safePayload(message.action, message.payload),
      }, function (response) {
        var error = chromeApi.runtime.lastError;
        sendResponse(error ? { ok: false, error: error.message } :
          response || { ok: false, error: "The inspected page did not respond" });
      });
      return true;
    }

    return { handleMessage: handleMessage };
  }

  root.ClayLiveUiDevtoolsBackground = { createBridge: createBridge };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiDevtoolsBackground;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
