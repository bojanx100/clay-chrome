(function (root) {
  var STORAGE_KEY = "clayLiveUiPairingsV1";
  var RECENT_KEY = "clayLiveUiRecentPairingsV1";
  var evidence = root.ClayLiveUiEvidence;
  if (!evidence && typeof require === "function") evidence = require("./live-ui-evidence");
  var reactBridge = root.ClayLiveUiReactBackground;
  if (!reactBridge && typeof require === "function") {
    reactBridge = require("./live-ui-react-background");
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
    var recoverPairing = options.recoverPairing || function () {};
    var captureScreenshot = options.captureScreenshot || function (pairing, payload, callback) {
      evidence.captureMaskedScreenshot(chromeApi, pairing, payload, callback);
    };
    var captureEvidence = options.captureEvidence || function (pairing, payload, callback) {
      captureScreenshot(pairing, payload, function (screenshot) {
        if (!screenshot || !screenshot.ok) return callback(screenshot);
        evidence.captureDiagnostics(chromeApi, pairing, function (diagnostics) {
          if (!diagnostics || !diagnostics.ok) return callback(diagnostics);
          callback({
            ok: true,
            mediaType: screenshot.mediaType,
            data: screenshot.data,
            diagnostics: diagnostics.diagnostics,
          });
        });
      });
    };
    var inspectComponent = options.inspectComponent || function (pairing, payload, callback) {
      reactBridge.inspectReactComponent(chromeApi, pairing, payload, callback);
    };
    var pairings = {};
    var recentPairings = {};
    function recoveryMetadata(pairing) {
      return {
        clayTabId: pairing.clayTabId,
        targetTabId: pairing.targetTabId,
        allowedOrigin: pairing.allowedOrigin,
        projectLabel: pairing.projectLabel || null,
        sessionLabel: pairing.sessionLabel || null,
        projectSlug: pairing.projectSlug || null,
        sessionId: pairing.sessionId || null,
      };
    }
    function remember(pairing) {
      recentPairings[String(pairing.targetTabId)] = recoveryMetadata(pairing);
    }
    function forget(pairing) {
      delete recentPairings[String(pairing.targetTabId)];
    }
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
      value[RECENT_KEY] = recentPairings;
      chromeApi.storage.session.set(value);
    }

    function restore() {
      chromeApi.storage.session.get([STORAGE_KEY, RECENT_KEY], function (result) {
        pairings = result && result[STORAGE_KEY] ? result[STORAGE_KEY] : {};
        recentPairings = result && result[RECENT_KEY] ? result[RECENT_KEY] : {};
        var ids = Object.keys(pairings);
        for (var i = 0; i < ids.length; i++) {
          var pairing = pairings[ids[i]];
          if (!recentPairings[String(pairing.targetTabId)]) remember(pairing);
        }
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
        files: ["inject.js"],
        world: "MAIN",
      }, function () {
        var error = chromeApi.runtime.lastError;
        if (error) return callback({ ok: false, error: error.message });
        chromeApi.scripting.executeScript({
          target: { tabId: pairing.targetTabId },
          files: ["live-ui-target-context.js", "live-ui-target-selection.js",
            "live-ui-target-reports.js", "live-ui-target-ui.js",
            "live-ui-target-snapshot.js", "live-ui-target.js"],
        }, function () {
          var targetError = chromeApi.runtime.lastError;
          if (targetError) return callback({ ok: false, error: targetError.message });
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
              error: response && response.error ?
                response.error : "Target overlay did not initialize",
            });
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
            lifecycleEnvelope(existing, "target.closed", {
              reason: "pairing_replaced",
            }));
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
            remember(pairing);
            save();
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
      forget(pairing);
      save();
      callback({ ok: true });
    }

    function exitPairing(pairingId, callback) {
      var pairing = pairings[pairingId];
      if (!pairing) return callback({ ok: true, alreadyClosed: true });
      sendToControl(pairing, lifecycleEnvelope(pairing, "target.closed", {
        reason: "extension_exit",
      }));
      sendToTarget(pairing, { type: "live_ui_destroy",
        pairingId: pairing.pairingId }, function () {});
      delete pairings[pairing.pairingId];
      forget(pairing);
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

    function getRecentPairings() {
      return Object.keys(recentPairings).map(function (id) {
        return recoveryMetadata(recentPairings[id]);
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
      if (message.event === "evidence.capture") {
        captureEvidence(pairing, message.payload, function (result) {
          sendResponse(result && result.ok ? {
            ok: true,
            screenshot: {
              mediaType: result.mediaType,
              data: result.data,
            },
            diagnostics: result.diagnostics || { console: [], network: [] },
          } : {
            ok: false,
            error: result && result.error ? result.error : "Evidence capture failed",
          });
        });
        return true;
      }
      if (message.event === "component.inspect") {
        inspectComponent(pairing, message.payload, function (result) {
          sendResponse(result && result.ok ? {
            ok: true,
            component: result.component || null,
          } : {
            ok: false,
            error: result && result.error ?
              result.error : "React component inspection failed",
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
      sendResponse(forwarded ? { ok: true } : {
        ok: false, error: "The connected Clay tab is unavailable",
      });
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
      var staleServerPairing = envelope.type === "live_ui_state" && (
        envelope.code === "LIVE_UI_NOT_FOUND" ||
        envelope.code === "LIVE_UI_REVOKED" ||
        (envelope.state === "revoked" && envelope.reason === "server_restart"));
      if (envelope.type === "live_ui_state" &&
          (envelope.state === "revoked" || staleServerPairing)) {
        var metadata = recoveryMetadata(pairing);
        sendToTarget(pairing, {
          type: "live_ui_destroy",
          pairingId: pairing.pairingId,
        }, function () {});
        delete pairings[pairing.pairingId];
        save();
        if (staleServerPairing) recoverPairing(metadata);
        return true;
      }
      if (envelope.type === "live_ui_relay" &&
          envelope.event === "reports.snapshot") {
        sendToTarget(pairing, {
          type: "live_ui_connection",
          pairingId: pairing.pairingId,
          state: "connected",
        }, function () {});
      }
      sendToTarget(pairing, { type: "live_ui_server_event", envelope: envelope }, function () {});
      return true;
    }

    function lifecycleEnvelope(pairing, event, payload) {
      return {
        type: "live_ui_relay",
        protocolVersion: 1,
        pairingId: pairing.pairingId,
        event: event,
        payload: payload || null,
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
          sendToControl(pairing, lifecycleEnvelope(pairing, "target.closed", {
            reason: "origin_changed",
          }));
          delete pairings[pairing.pairingId];
          forget(pairing);
          save();
          continue;
        }
        (function (reloadPairing) {
          injectTarget(reloadPairing, function (result) {
            if (result && result.ok) {
              sendToControl(reloadPairing,
                lifecycleEnvelope(reloadPairing, "target.reconnect", {
                  targetUrl: tab.url,
                }));
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
          sendToControl(pairing, lifecycleEnvelope(pairing, "target.closed", {
            reason: "tab_closed",
          }));
          forget(pairing);
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
      getRecentPairings: getRecentPairings,
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
