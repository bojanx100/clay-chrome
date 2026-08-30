(function (root) {
  var ACTIONS = {
    "selection.pick": true,
    "selection.clear": true,
    "report.focus": true,
    "report.submit": true,
    "report.dismiss": true,
    "report.showAll": true,
    snapshot: true,
  };

  function safeId(value) {
    return typeof value === "string" ? value.slice(0, 200) : null;
  }

  function safeAttachments(value) {
    var input = value && typeof value === "object" ? value : {};
    var images = [];
    var imageBytes = 0;
    var sourceImages = Array.isArray(input.images) ? input.images : [];
    var allowed = { "image/png": true, "image/jpeg": true,
      "image/gif": true, "image/webp": true };
    for (var i = 0; i < sourceImages.length && images.length < 4; i++) {
      var image = sourceImages[i] || {};
      var data = typeof image.data === "string" ? image.data : "";
      if (!allowed[image.mediaType] || !data || data.length > 7 * 1024 * 1024 ||
          data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) ||
          imageBytes + data.length > 14 * 1024 * 1024) continue;
      imageBytes += data.length;
      images.push({
        mediaType: image.mediaType,
        data: data,
        name: typeof image.name === "string" ? image.name.slice(0, 120) : "pasted-image",
      });
    }
    var pastes = [];
    var pasteChars = 0;
    var sourcePastes = Array.isArray(input.pastes) ? input.pastes : [];
    for (var j = 0; j < sourcePastes.length && pastes.length < 4; j++) {
      var paste = typeof sourcePastes[j] === "string" ? sourcePastes[j] : "";
      if (!paste || paste.length > 64 * 1024 ||
          pasteChars + paste.length > 128 * 1024) continue;
      pasteChars += paste.length;
      pastes.push(paste);
    }
    return { images: images, pastes: pastes };
  }

  function safePayload(action, value) {
    var input = value || {};
    if (action === "report.submit") {
      return {
        text: String(input.text || "").slice(0, 12000),
        reportId: safeId(input.reportId),
        attachments: safeAttachments(input.attachments),
      };
    }
    if (action === "report.focus" || action === "report.dismiss") {
      return { reportId: safeId(input.reportId) };
    }
    if (action === "report.showAll") {
      return { showAll: input.showAll === true };
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
