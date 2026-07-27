(function (root) {
  var STORAGE_KEY = "clayLiveUiPairingsV1";
  var MAX_MASKS = 256;

  function capturePacket(payload) {
    var viewport = payload && payload.viewport;
    if (!viewport) return null;
    var width = Number(viewport.width);
    var height = Number(viewport.height);
    var scrollX = Number(viewport.scrollX);
    var scrollY = Number(viewport.scrollY);
    if (!isFinite(width) || !isFinite(height) || width < 1 || height < 1 ||
        width > 20000 || height > 20000 ||
        !isFinite(scrollX) || !isFinite(scrollY)) return null;
    var masks = [];
    var inputMasks = Array.isArray(payload.masks) ? payload.masks : [];
    for (var i = 0; i < inputMasks.length && masks.length < MAX_MASKS; i++) {
      var mask = inputMasks[i] || {};
      var x = Number(mask.x);
      var y = Number(mask.y);
      var maskWidth = Number(mask.width);
      var maskHeight = Number(mask.height);
      if (!isFinite(x) || !isFinite(y) || !isFinite(maskWidth) ||
          !isFinite(maskHeight) || maskWidth <= 0 || maskHeight <= 0) continue;
      masks.push({ x: x, y: y, width: maskWidth, height: maskHeight });
    }
    return {
      documentGeneration: String(payload.documentGeneration || ""),
      viewport: {
        width: width,
        height: height,
        scrollX: scrollX,
        scrollY: scrollY,
      },
      masks: masks,
    };
  }

  function base64Bytes(data) {
    var binary = atob(data);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function bytesBase64(bytes) {
    var parts = [];
    for (var i = 0; i < bytes.length; i += 32768) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)));
    }
    return btoa(parts.join(""));
  }

  function maskPng(data, packet, callback) {
    if (typeof OffscreenCanvas === "undefined" ||
        typeof createImageBitmap !== "function") {
      callback({ ok: false, error: "Secure screenshot masking is unavailable" });
      return;
    }
    var blob = new Blob([base64Bytes(data)], { type: "image/png" });
    createImageBitmap(blob).then(function (bitmap) {
      var canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      var context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      context.fillStyle = "#17151d";
      var scaleX = bitmap.width / packet.viewport.width;
      var scaleY = bitmap.height / packet.viewport.height;
      for (var i = 0; i < packet.masks.length; i++) {
        var mask = packet.masks[i];
        var x = Math.floor(mask.x * scaleX) - 2;
        var y = Math.floor(mask.y * scaleY) - 2;
        var width = Math.ceil(mask.width * scaleX) + 4;
        var height = Math.ceil(mask.height * scaleY) + 4;
        context.fillRect(x, y, width, height);
      }
      bitmap.close();
      return canvas.convertToBlob({ type: "image/png" });
    }).then(function (maskedBlob) {
      return maskedBlob.arrayBuffer();
    }).then(function (buffer) {
      callback({
        ok: true,
        mediaType: "image/png",
        data: bytesBase64(new Uint8Array(buffer)),
      });
    }).catch(function () {
      callback({ ok: false, error: "Secure screenshot masking failed" });
    });
  }

  function captureMaskedScreenshot(chromeApi, pairing, payload, callback) {
    var packet = capturePacket(payload);
    if (!packet || !packet.documentGeneration) {
      callback({ ok: false, error: "Screenshot context is invalid" });
      return;
    }
    var debuggee = { tabId: pairing.targetTabId };
    chromeApi.debugger.attach(debuggee, "1.3", function () {
      var attachError = chromeApi.runtime.lastError;
      if (attachError) {
        callback({ ok: false, error: attachError.message });
        return;
      }
      chromeApi.debugger.sendCommand(debuggee, "Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      }, function (result) {
        var captureError = chromeApi.runtime.lastError;
        chromeApi.debugger.detach(debuggee, function () {
          void chromeApi.runtime.lastError;
        });
        if (captureError || !result || !result.data) {
          callback({
            ok: false,
            error: captureError ? captureError.message : "Screenshot capture failed",
          });
          return;
        }
        chromeApi.scripting.executeScript({
          target: { tabId: pairing.targetTabId },
          func: function () {
            var host = document.querySelector("clay-live-ui[data-clay-live-ui-overlay]");
            return {
              documentGeneration: host ?
                host.getAttribute("data-clay-live-ui-generation") : "",
              width: window.innerWidth,
              height: window.innerHeight,
              scrollX: window.scrollX,
              scrollY: window.scrollY,
            };
          },
        }, function (results) {
          var current = results && results[0] ? results[0].result : null;
          var viewport = packet.viewport;
          if (!current ||
              current.documentGeneration !== packet.documentGeneration ||
              current.width !== viewport.width ||
              current.height !== viewport.height ||
              current.scrollX !== viewport.scrollX ||
              current.scrollY !== viewport.scrollY) {
            callback({
              ok: false,
              error: "The page moved during capture. Try the screenshot again.",
            });
            return;
          }
          maskPng(result.data, packet, callback);
        });
      });
    });
  }
  function originOf(url) {
    try {
      var parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return parsed.origin;
    } catch (e) {
      return null;
    }
  }
  function createRuntime(chromeApi, clayPortForTab, options) {
    options = options || {};
    var captureScreenshot = options.captureScreenshot || function (pairing, payload, callback) {
      captureMaskedScreenshot(chromeApi, pairing, payload, callback);
    };
    var pairings = {};
    function save() {
      var stored = {};
      var ids = Object.keys(pairings);
      for (var i = 0; i < ids.length; i++) {
        var pairing = pairings[ids[i]];
        stored[ids[i]] = {
          pairingId: pairing.pairingId,
          clayTabId: pairing.clayTabId,
          targetTabId: pairing.targetTabId,
          allowedOrigin: pairing.allowedOrigin,
          protocolVersion: pairing.protocolVersion,
          lastSelection: pairing.lastSelection || null,
          reconnectCredential: pairing.reconnectCredential || null,
          projectLabel: pairing.projectLabel || null,
          sessionLabel: pairing.sessionLabel || null,
          projectSlug: pairing.projectSlug || null,
          sessionId: pairing.sessionId || null,
        };
      }
      var value = {};
      value[STORAGE_KEY] = stored;
      chromeApi.storage.session.set(value);
    }

    function restore() {
      chromeApi.storage.session.get(STORAGE_KEY, function (result) {
        pairings = result && result[STORAGE_KEY] ? result[STORAGE_KEY] : {};
      });
    }

    function sendToControl(pairing, envelope) {
      var port = clayPortForTab(pairing.clayTabId);
      if (!port) return false;
      try {
        port.postMessage({ type: "clay_live_ui_relay", envelope: envelope });
        return true;
      } catch (e) {
        return false;
      }
    }

    function sendToTarget(pairing, message, callback) {
      chromeApi.tabs.sendMessage(pairing.targetTabId, message, function (response) {
        var error = chromeApi.runtime.lastError;
        if (callback) callback(error ? { error: error.message } : response);
      });
    }

    function injectTarget(pairing, callback) {
      chromeApi.scripting.executeScript({
        target: { tabId: pairing.targetTabId },
        files: ["live-ui-target.js"],
      }, function () {
        var error = chromeApi.runtime.lastError;
        if (error) return callback({ ok: false, error: error.message });
        sendToTarget(pairing, {
          type: "live_ui_init",
          protocolVersion: pairing.protocolVersion,
          pairingId: pairing.pairingId,
          allowedOrigin: pairing.allowedOrigin,
          nonce: pairing.nonce || null,
          selection: pairing.lastSelection || null,
          projectLabel: pairing.projectLabel || "Clay project",
          sessionLabel: pairing.sessionLabel || "New chat",
        }, function (response) {
          callback(response && response.ok ? { ok: true } : {
            ok: false,
            error: response && response.error ? response.error : "Target overlay did not initialize",
          });
        });
      });
    }

    function pair(args, callback, source) {
      var targetTabId = Number(args && args.targetTabId);
      if (!args || args.protocolVersion !== 1 || !args.pairingId ||
          !targetTabId || !source || !source.clayTabId) {
        callback({ ok: false, error: "Invalid Live UI pairing request" });
        return;
      }
      chromeApi.tabs.get(targetTabId, function (tab) {
        var error = chromeApi.runtime.lastError;
        if (error || !tab) {
          callback({ ok: false, error: error ? error.message : "Target tab was not found" });
          return;
        }
        if (originOf(tab.url) !== args.allowedOrigin) {
          callback({ ok: false, error: "Target origin does not match the server authorization" });
          return;
        }
        var existingIds = Object.keys(pairings);
        for (var i = 0; i < existingIds.length; i++) {
          var existing = pairings[existingIds[i]];
          if (existing.targetTabId !== targetTabId) continue;
          sendToTarget(existing, {
            type: "live_ui_destroy",
            pairingId: existing.pairingId,
          }, function () {});
          sendToControl(existing,
            lifecycleEnvelope(existing, "target.closed", "pairing_replaced"));
          delete pairings[existing.pairingId];
        }
        var pairing = {
          pairingId: args.pairingId,
          clayTabId: source.clayTabId,
          targetTabId: targetTabId,
          allowedOrigin: args.allowedOrigin,
          protocolVersion: 1,
          nonce: args.nonce,
          reconnectCredential: args.reconnectCredential || null,
          projectLabel: typeof args.projectLabel === "string" ?
            args.projectLabel.slice(0, 160) : "Clay project",
          sessionLabel: typeof args.sessionLabel === "string" ?
            args.sessionLabel.slice(0, 160) : "New chat",
          projectSlug: typeof args.projectSlug === "string" ? args.projectSlug.slice(0, 160) : null,
          sessionId: args.sessionId === undefined ? null : args.sessionId };
        pairings[pairing.pairingId] = pairing;
        save();
        injectTarget(pairing, function (result) {
          if (!result.ok) {
            delete pairings[pairing.pairingId];
            save();
          } else {
            pairing.nonce = null;
          }
          callback(result);
        });
      });
    }

    function unpair(args, callback) {
      var pairing = args && pairings[args.pairingId];
      if (!pairing) return callback({ ok: true, alreadyClosed: true });
      sendToTarget(pairing, {
        type: "live_ui_destroy",
        pairingId: pairing.pairingId,
      }, function () {});
      delete pairings[pairing.pairingId];
      save();
      callback({ ok: true });
    }

    function exitPairing(pairingId, callback) {
      var pairing = pairings[pairingId];
      if (!pairing) return callback({ ok: true, alreadyClosed: true });
      sendToControl(pairing, lifecycleEnvelope(pairing, "target.closed", "extension_exit"));
      sendToTarget(pairing, { type: "live_ui_destroy",
        pairingId: pairing.pairingId }, function () {});
      delete pairings[pairing.pairingId];
      save();
      callback({ ok: true });
    }

    function getPairings() {
      var ids = Object.keys(pairings);
      return ids.map(function (id) {
        var pairing = pairings[id];
        return { pairingId: pairing.pairingId, targetTabId: pairing.targetTabId, allowedOrigin: pairing.allowedOrigin,
          projectSlug: pairing.projectSlug || null,
          projectLabel: pairing.projectLabel || "Clay project",
          sessionId: pairing.sessionId || null,
          sessionLabel: pairing.sessionLabel || "New chat" };
      });
    }

    function handleTargetMessage(message, sender, sendResponse) {
      if (!message || message.type !== "live_ui_target_event" || !sender.tab) return false;
      var pairing = pairings[message.pairingId];
      if (!pairing || pairing.targetTabId !== sender.tab.id ||
          originOf(sender.tab.url) !== pairing.allowedOrigin) {
        sendResponse({ ok: false, error: "Live UI pairing identity mismatch" });
        return true;
      }
      if (message.event === "selection.update" && message.payload) {
        pairing.lastSelection = message.payload;
        save();
      }
      if (message.event === "selection.clear") {
        pairing.lastSelection = null;
        save();
      }
      if (message.event === "screenshot.capture") {
        captureScreenshot(pairing, message.payload, function (result) {
          sendResponse(result && result.ok ? {
            ok: true,
            screenshot: {
              mediaType: result.mediaType,
              data: result.data,
            },
          } : {
            ok: false,
            error: result && result.error ? result.error : "Screenshot capture failed",
          });
        });
        return true;
      }
      var forwarded = sendToControl(pairing, {
        type: "live_ui_relay",
        protocolVersion: 1,
        pairingId: pairing.pairingId,
        clientMessageId: message.clientMessageId || null,
        event: message.event,
        payload: message.payload || null,
      });
      sendResponse({ ok: forwarded });
      return true;
    }

    function handleServerEnvelope(envelope) {
      if (!envelope || envelope.protocolVersion !== 1 || !envelope.pairingId) return false;
      var pairing = pairings[envelope.pairingId];
      if (!pairing) return false;
      if (envelope.reconnectCredential) {
        pairing.reconnectCredential = envelope.reconnectCredential;
        save();
      }
      if (envelope.type === "live_ui_state" && envelope.state === "revoked") {
        sendToTarget(pairing, {
          type: "live_ui_destroy",
          pairingId: pairing.pairingId,
        }, function () {});
        delete pairings[pairing.pairingId];
        save();
        return true;
      }
      sendToTarget(pairing, { type: "live_ui_server_event", envelope: envelope }, function () {});
      return true;
    }

    function lifecycleEnvelope(pairing, event, reason) {
      return {
        type: "live_ui_relay",
        protocolVersion: 1,
        pairingId: pairing.pairingId,
        event: event,
        payload: reason ? { reason: reason } : null,
      };
    }

    function handleTabLoading(tabId) {
      var ids = Object.keys(pairings);
      for (var i = 0; i < ids.length; i++) {
        var pairing = pairings[ids[i]];
        if (pairing.targetTabId === tabId) {
          sendToControl(pairing, lifecycleEnvelope(pairing, "target.disconnect"));
        }
      }
    }

    function handleTabComplete(tabId, tab) {
      var ids = Object.keys(pairings);
      for (var i = 0; i < ids.length; i++) {
        var pairing = pairings[ids[i]];
        if (pairing.targetTabId !== tabId) continue;
        if (!tab || originOf(tab.url) !== pairing.allowedOrigin) {
          sendToControl(pairing, lifecycleEnvelope(pairing, "target.closed", "origin_changed"));
          delete pairings[pairing.pairingId];
          save();
          continue;
        }
        (function (reloadPairing) {
          injectTarget(reloadPairing, function (result) {
            if (result && result.ok) {
              sendToControl(reloadPairing,
                lifecycleEnvelope(reloadPairing, "target.reconnect"));
            }
          });
        })(pairing);
      }
    }

    function handleTabRemoved(tabId) {
      var ids = Object.keys(pairings);
      for (var i = 0; i < ids.length; i++) {
        var pairing = pairings[ids[i]];
        if (pairing.targetTabId !== tabId && pairing.clayTabId !== tabId) continue;
        if (pairing.targetTabId === tabId) {
          sendToControl(pairing, lifecycleEnvelope(pairing, "target.closed", "tab_closed"));
        }
        delete pairings[pairing.pairingId];
      }
      save();
    }

    function handleControlConnected(tabId, port) {
      var ids = Object.keys(pairings);
      for (var i = 0; i < ids.length; i++) {
        var pairing = pairings[ids[i]];
        if (pairing.clayTabId !== tabId || !pairing.reconnectCredential) continue;
        try {
          port.postMessage({
            type: "clay_live_ui_restore",
            pairingId: pairing.pairingId,
            reconnectCredential: pairing.reconnectCredential,
          });
        } catch (e) {}
      }
    }

    function handleControlDisconnected(tabId) {
      var ids = Object.keys(pairings);
      for (var i = 0; i < ids.length; i++) {
        var pairing = pairings[ids[i]];
        if (pairing.clayTabId !== tabId) continue;
        sendToTarget(pairing, {
          type: "live_ui_connection",
          pairingId: pairing.pairingId,
          state: "disconnected",
        }, function () {});
      }
    }

    restore();
    return {
      pair: pair,
      unpair: unpair,
      exitPairing: exitPairing,
      getPairings: getPairings,
      handleTargetMessage: handleTargetMessage,
      handleServerEnvelope: handleServerEnvelope,
      handleTabLoading: handleTabLoading,
      handleTabComplete: handleTabComplete,
      handleTabRemoved: handleTabRemoved,
      handleControlConnected: handleControlConnected,
      handleControlDisconnected: handleControlDisconnected,
    };
  }

  root.ClayLiveUiBackground = { createRuntime: createRuntime, originOf: originOf };
  if (typeof module !== "undefined" && module.exports) module.exports = root.ClayLiveUiBackground;
})(typeof globalThis !== "undefined" ? globalThis : this);
