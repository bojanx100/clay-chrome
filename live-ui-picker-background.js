(function (root) {
  function safeOrigin(value) {
    try {
      var parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return parsed.origin;
    } catch (error) {
      return null;
    }
  }

  function safeIdentity(value) {
    if (!value || !safeOrigin(value.serverOrigin) ||
        !/^[a-z0-9_-]+$/.test(String(value.projectSlug || ""))) return null;
    var sessions = [];
    var inputSessions = Array.isArray(value.sessions) ? value.sessions : [];
    for (var i = 0; i < inputSessions.length && sessions.length < 500; i++) {
      var session = inputSessions[i] || {};
      if (session.id === undefined || session.id === null ||
          String(session.id).length > 200) continue;
      sessions.push({
        id: session.id,
        title: String(session.title || "New chat").slice(0, 160),
        active: !!session.active,
        isProcessing: !!session.isProcessing,
      });
    }
    return {
      serverOrigin: safeOrigin(value.serverOrigin),
      projectSlug: String(value.projectSlug),
      projectLabel: String(value.projectLabel || value.projectSlug).slice(0, 160),
      sessions: sessions,
    };
  }

  function publicTab(tab) {
    if (!tab || !Number(tab.id) || !safeOrigin(tab.url)) return null;
    return {
      id: Number(tab.id),
      url: String(tab.url || ""),
      title: String(tab.title || "").slice(0, 300),
      favIconUrl: String(tab.favIconUrl || ""),
    };
  }

  function createPicker(chromeApi, runtime, getPort, getPortIds) {
    var identities = {};
    var status = null;
    var counter = 0;

    function requestIdentity(tabId) {
      var port = getPort(tabId);
      if (!port) return;
      try {
        port.postMessage({
          type: "clay_live_ui_identity_request",
          requestId: "identity-" + Date.now() + "-" + tabId,
        });
      } catch (error) {}
    }

    function handlePortConnected(tabId) {
      requestIdentity(tabId);
    }

    function handlePortDisconnected(tabId) {
      delete identities[tabId];
    }

    function handlePortMessage(tabId, message) {
      if (!message) return false;
      if (message.type === "clay_live_ui_identity") {
        var identity = safeIdentity(message.identity);
        if (identity) identities[tabId] = identity;
        return true;
      }
      if (message.type === "clay_live_ui_picker_state") {
        status = {
          requestId: message.requestId || null,
          pairingId: message.pairingId || null,
          state: String(message.state || "error"),
          error: message.error ? String(message.error).slice(0, 500) : null,
        };
        return true;
      }
      return false;
    }

    function controls() {
      var ids = getPortIds();
      var result = [];
      for (var i = 0; i < ids.length; i++) {
        var tabId = Number(ids[i]);
        requestIdentity(tabId);
        if (!identities[tabId]) continue;
        result.push(Object.assign({ controlTabId: tabId }, identities[tabId]));
      }
      return result;
    }

    function pickerState(sendResponse) {
      chromeApi.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var activeTab = tabs && tabs[0] ? publicTab(tabs[0]) : null;
        sendResponse({
          ok: true,
          activeTab: activeTab,
          controls: controls(),
          pairings: runtime.getPairings(),
          status: status,
        });
      });
    }

    function pair(message, sendResponse) {
      var controlTabId = Number(message.controlTabId);
      var identity = identities[controlTabId];
      var port = getPort(controlTabId);
      if (!identity || !port) {
        sendResponse({ ok: false, error: "The selected Clay tab is disconnected." });
        return;
      }
      var selected = null;
      for (var i = 0; i < identity.sessions.length; i++) {
        if (String(identity.sessions[i].id) === String(message.sessionId)) {
          selected = identity.sessions[i];
          break;
        }
      }
      if (!selected) {
        sendResponse({ ok: false, error: "The selected session is no longer available." });
        return;
      }
      chromeApi.tabs.query({}, function (tabs) {
        chromeApi.tabs.query({ active: true, currentWindow: true }, function (activeTabs) {
          var target = activeTabs && activeTabs[0] ? publicTab(activeTabs[0]) : null;
          if (!target || target.id === controlTabId) {
            sendResponse({
              ok: false,
              error: target ? "Open the web app tab, then start Live UI." :
                "The active web app tab is unavailable.",
            });
            return;
          }
          var requestId = "live-ui-picker-" + Date.now() + "-" + (++counter);
          var publicTabs = [];
          for (var ti = 0; ti < tabs.length; ti++) {
            var tab = publicTab(tabs[ti]);
            if (tab && tab.id !== controlTabId) publicTabs.push(tab);
          }
          status = {
            requestId: requestId,
            pairingId: null,
            state: "requesting",
            error: null,
          };
          try {
            port.postMessage({
              type: "clay_live_ui_picker_pair_request",
              requestId: requestId,
              sessionId: selected.id,
              targetTabId: target.id,
              tabs: publicTabs,
              extensionId: chromeApi.runtime.id,
            });
          } catch (error) {
            status.state = "error";
            status.error = "The selected Clay tab disconnected.";
            sendResponse({ ok: false, error: status.error });
            return;
          }
          sendResponse({ ok: true, requestId: requestId });
        });
      });
    }

    function connectCurrent(sendResponse) {
      chromeApi.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0] ? publicTab(tabs[0]) : null;
        if (!tab) {
          sendResponse({ ok: false, error: "Open Clay in this tab first." });
          return;
        }
        if (getPort(tab.id)) {
          requestIdentity(tab.id);
          sendResponse({ ok: true, alreadyConnected: true });
          return;
        }
        chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        }, function () {
          var error = chromeApi.runtime.lastError;
          sendResponse(error ? { ok: false, error: error.message } : { ok: true });
        });
      });
    }

    function exitPairing(message, sendResponse) {
      runtime.exitPairing(message.pairingId, function (result) {
        if (result && result.ok) status = null;
        sendResponse(result);
      });
    }

    function handlePopupMessage(message, sendResponse) {
      if (!message) return false;
      if (message.type === "live_ui_picker_get_state") {
        pickerState(sendResponse);
        return true;
      }
      if (message.type === "live_ui_picker_pair") {
        pair(message, sendResponse);
        return true;
      }
      if (message.type === "live_ui_picker_connect_current") {
        connectCurrent(sendResponse);
        return true;
      }
      if (message.type === "live_ui_picker_exit") {
        exitPairing(message, sendResponse);
        return true;
      }
      return false;
    }

    return {
      handlePortConnected: handlePortConnected,
      handlePortDisconnected: handlePortDisconnected,
      handlePortMessage: handlePortMessage,
      handlePopupMessage: handlePopupMessage,
    };
  }

  root.ClayLiveUiPickerBackground = { createPicker: createPicker };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiPickerBackground;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
