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

  function safeSession(value) {
    var session = value || {};
    if (session.id === undefined || session.id === null ||
        String(session.id).length > 200) return null;
    return {
      id: session.id,
      title: String(session.title || "New chat").slice(0, 160),
      active: !!session.active,
      isProcessing: !!session.isProcessing,
      coordinationMode: !!session.coordinationMode,
    };
  }

  function safeProject(value, remainingSessions) {
    var project = value || {};
    var projectSlug = String(project.projectSlug || "");
    if (!/^[a-z0-9_-]+$/.test(projectSlug)) return null;
    var inputSessions = Array.isArray(project.sessions) ? project.sessions : [];
    var sessions = [];
    for (var si = 0; si < inputSessions.length &&
        sessions.length < remainingSessions; si++) {
      var session = safeSession(inputSessions[si]);
      if (session) sessions.push(session);
    }
    if (!sessions.length) return null;
    return {
      projectSlug: projectSlug,
      projectLabel: String(
        project.projectLabel || project.projectTitle || projectSlug).slice(0, 160),
      sessions: sessions,
    };
  }

  function projectBySlug(projects, slug) {
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].projectSlug === slug) return projects[i];
    }
    return null;
  }

  function safeIdentity(value) {
    if (!value || !safeOrigin(value.serverOrigin)) return null;
    var currentProjectSlug = String(
      value.currentProjectSlug || value.projectSlug || "");
    if (!/^[a-z0-9_-]+$/.test(currentProjectSlug)) return null;
    var inputProjects = Array.isArray(value.projects) ? value.projects : [{
      projectSlug: currentProjectSlug,
      projectLabel: value.projectLabel,
      sessions: value.sessions,
    }];
    var projects = [];
    var totalSessions = 0;
    for (var pi = 0; pi < inputProjects.length && projects.length < 100; pi++) {
      var project = safeProject(inputProjects[pi], 500 - totalSessions);
      if (!project) continue;
      projects.push(project);
      totalSessions += project.sessions.length;
      if (totalSessions >= 500) break;
    }
    var currentProject = projectBySlug(projects, currentProjectSlug);
    return {
      serverOrigin: safeOrigin(value.serverOrigin),
      currentProjectSlug: currentProjectSlug,
      projectSlug: currentProjectSlug,
      projectLabel: String(value.projectLabel || currentProjectSlug).slice(0, 160),
      sessions: currentProject ? currentProject.sessions : [],
      projects: projects,
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
    var pendingPairs = {};
    var status = null;
    var counter = 0;

    function findSelection(identity, projectSlug, sessionId) {
      var projects = identity.projects || [];
      for (var pi = 0; pi < projects.length; pi++) {
        if (projects[pi].projectSlug !== projectSlug) continue;
        for (var si = 0; si < projects[pi].sessions.length; si++) {
          if (String(projects[pi].sessions[si].id) === String(sessionId)) {
            return projects[pi].sessions[si];
          }
        }
      }
      return null;
    }

    function clearPending(tabId) {
      var pending = pendingPairs[tabId];
      if (pending && pending.timer) clearTimeout(pending.timer);
      delete pendingPairs[tabId];
    }

    function failPending(tabId, error) {
      var pending = pendingPairs[tabId];
      if (!pending) return;
      status = {
        requestId: pending.requestId,
        pairingId: null,
        state: "error",
        error: error,
      };
      clearPending(tabId);
    }

    function postPairRequest(tabId, pending, identity) {
      var port = getPort(tabId);
      var selected = findSelection(
        identity, pending.projectSlug, pending.sessionId);
      if (!port || identity.currentProjectSlug !== pending.projectSlug || !selected) {
        return false;
      }
      status = {
        requestId: pending.requestId,
        pairingId: null,
        state: "requesting",
        error: null,
      };
      try {
        port.postMessage({
          type: "clay_live_ui_picker_pair_request",
          requestId: pending.requestId,
          projectSlug: pending.projectSlug,
          sessionId: selected.id,
          targetTabId: pending.targetTabId,
          tabs: pending.tabs,
          extensionId: chromeApi.runtime.id,
        });
      } catch (error) {
        failPending(tabId, "The selected Clay tab disconnected.");
        return false;
      }
      clearPending(tabId);
      return true;
    }

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
        if (identity) {
          identities[tabId] = identity;
          if (pendingPairs[tabId]) {
            postPairRequest(tabId, pendingPairs[tabId], identity);
          }
        }
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

    function handleTabUpdated(tabId, changeInfo, tab) {
      var pending = pendingPairs[tabId];
      if (!pending || changeInfo.status !== "complete") return;
      var expected = pending.serverOrigin + "/p/" +
        encodeURIComponent(pending.projectSlug) + "/";
      if (!tab || String(tab.url || "").indexOf(expected) !== 0) return;
      if (getPort(tabId)) {
        requestIdentity(tabId);
        return;
      }
      chromeApi.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"],
      }, function () {
        var error = chromeApi.runtime.lastError;
        if (error) failPending(tabId, "Clay could not reconnect after changing projects.");
      });
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
      var projectSlug = String(message.projectSlug || identity.currentProjectSlug || "");
      var selected = findSelection(identity, projectSlug, message.sessionId);
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
          var pending = {
            requestId: requestId,
            controlTabId: controlTabId,
            serverOrigin: identity.serverOrigin,
            projectSlug: projectSlug,
            sessionId: selected.id,
            targetTabId: target.id,
            tabs: publicTabs,
            timer: null,
          };
          clearPending(controlTabId);
          pendingPairs[controlTabId] = pending;
          pending.timer = setTimeout(function () {
            failPending(controlTabId, "Clay did not finish opening the selected project.");
          }, 20000);
          if (identity.currentProjectSlug === projectSlug) {
            if (!postPairRequest(controlTabId, pending, identity)) {
              sendResponse({ ok: false, error: status.error });
              return;
            }
            sendResponse({ ok: true, requestId: requestId });
            return;
          }
          status = {
            requestId: requestId,
            pairingId: null,
            state: "switching_project",
            error: null,
          };
          chromeApi.tabs.update(controlTabId, {
            url: identity.serverOrigin + "/p/" + encodeURIComponent(projectSlug) + "/",
          }, function () {
            var updateError = chromeApi.runtime.lastError;
            if (updateError) {
              failPending(controlTabId, "Clay could not open the selected project.");
              sendResponse({ ok: false, error: status.error });
              return;
            }
            sendResponse({ ok: true, requestId: requestId });
          });
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
      handleTabUpdated: handleTabUpdated,
      handlePopupMessage: handlePopupMessage,
    };
  }

  root.ClayLiveUiPickerBackground = { createPicker: createPicker };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiPickerBackground;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
