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
  function publicTab(tab) {
    if (!tab || !Number(tab.id) || !safeOrigin(tab.url)) return null;
    return {
      id: Number(tab.id),
      url: String(tab.url || ""),
      title: String(tab.title || "").slice(0, 300),
      favIconUrl: String(tab.favIconUrl || ""),
    };
  }
  function createPicker(chromeApi, runtime, getPort, getPortIds, discoveryModule,
      targetModule, catalogModule, workspaceModule, recoveryModule) {
    var identities = {};
    var pendingPairs = {};
    var pendingConnections = {};
    var status = null;
    var counter = 0;
    var catalog = catalogModule || root.ClayLiveUiPickerCatalog;
    var projectBySlug = catalog.projectBySlug;
    var safeIdentity = catalog.safeIdentity;
    var safeSession = catalog.safeSession;
    var targetResolver = targetModule || root.ClayLiveUiPickerTarget;
    var recoveryApi = recoveryModule || root.ClayLiveUiPickerRecovery;
    if (!recoveryApi && typeof require === "function") {
      recoveryApi = require("./live-ui-picker-recovery");
    }
    var workspaceProbe = workspaceModule.createProbe(chromeApi, getPort);
    var discovery = discoveryModule && discoveryModule.createDiscovery(
      chromeApi, getPort, requestIdentity);
    var recovery = recoveryApi.createRecovery({
      getIdentity: function (tabId) { return identities[tabId] || null; },
      getPort: getPort,
      projectBySlug: projectBySlug,
      findSelection: findSelection,
      requestIdentity: requestIdentity,
      loadProject: loadProject,
      startPair: pair,
      onFailure: function (error) {
        status = {
          requestId: null,
          pairingId: null,
          state: "error",
          error: error,
          code: "LIVE_UI_AUTO_RECOVERY_FAILED",
        };
      },
    });
    function mergeIdentity(previous, next) {
      if (!previous || previous.serverOrigin !== next.serverOrigin) return next;
      for (var i = 0; i < next.projects.length; i++) {
        var oldProject = projectBySlug(previous.projects, next.projects[i].projectSlug);
        if (!oldProject || next.projects[i].sessionsLoaded) continue;
        if (oldProject.sessionsLoaded) {
          next.projects[i].sessions = oldProject.sessions;
          next.projects[i].sessionsLoaded = true;
        }
        next.projects[i].sessionsLoading = oldProject.sessionsLoading;
        next.projects[i].sessionsError = oldProject.sessionsError;
      }
      var currentProject = projectBySlug(next.projects, next.currentProjectSlug);
      next.sessions = currentProject ? currentProject.sessions : [];
      return next;
    }
    function finishConnection(tabId, result) {
      var pending = pendingConnections[tabId];
      if (!pending) return;
      if (pending.timer) clearTimeout(pending.timer);
      delete pendingConnections[tabId];
      pending.sendResponse(result);
    }
    function waitForIdentity(tabId, sendResponse) {
      if (identities[tabId]) {
        sendResponse({ ok: true, alreadyConnected: true });
        return;
      }
      if (pendingConnections[tabId]) {
        sendResponse({ ok: false, error: "Clay connection is already being checked." });
        return;
      }
      pendingConnections[tabId] = {
        sendResponse: sendResponse,
        timer: setTimeout(function () {
          finishConnection(tabId, {
            ok: false,
            error: "This tab did not identify itself as Clay.",
          });
        }, 2500),
      };
      requestIdentity(tabId);
    }
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
      var selected = pending.createSession ? null : findSelection(
        identity, pending.projectSlug, pending.sessionId);
      if (!port || identity.currentProjectSlug !== pending.projectSlug ||
          (!pending.createSession && !selected)) {
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
          type: pending.createSession ?
            "clay_live_ui_picker_create_request" :
            "clay_live_ui_picker_pair_request",
          requestId: pending.requestId,
          projectSlug: pending.projectSlug,
          sessionId: selected ? selected.id : null,
          targetTabId: pending.targetTabId,
          attachWorkspace: pending.attachWorkspace === true,
          reconnectServer: pending.reconnectServer === true,
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
      if (discovery) discovery.handlePortConnected(tabId);
      requestIdentity(tabId);
    }
    function handlePortDisconnected(tabId) {
      if (discovery) discovery.handlePortDisconnected(tabId);
      delete identities[tabId];
      finishConnection(tabId, {
        ok: false,
        error: "Clay disconnected before it could be verified.",
      });
    }
    function updateProjectSessions(tabId, message) {
      var identity = identities[tabId];
      var projectSlug = String(message.projectSlug || "");
      var project = identity && projectBySlug(identity.projects, projectSlug);
      if (!project) return;
      project.sessionsLoading = false;
      project.sessionsError = message.error ?
        String(message.error).slice(0, 500) : null;
      if (!project.sessionsError && Array.isArray(message.sessions)) {
        var sessions = [];
        for (var i = 0; i < message.sessions.length && sessions.length < 500; i++) {
          var session = safeSession(message.sessions[i]);
          if (session) sessions.push(session);
        }
        project.sessions = sessions;
        project.sessionsLoaded = true;
        if (identity.currentProjectSlug === projectSlug) identity.sessions = sessions;
      }
    }
    function handlePortMessage(tabId, message) {
      if (!message) return false;
      if (workspaceProbe.handleMessage(message)) return true;
      if (message.type === "clay_live_ui_identity") {
        var identity = safeIdentity(message.identity);
        if (identity) {
          identity = mergeIdentity(identities[tabId], identity);
          identities[tabId] = identity;
          finishConnection(tabId, { ok: true });
          if (pendingPairs[tabId]) {
            postPairRequest(tabId, pendingPairs[tabId], identity);
          }
          recovery.retry();
        }
        return true;
      }
      if (message.type === "clay_live_ui_project_sessions") {
        updateProjectSessions(tabId, message);
        recovery.retry();
        return true;
      }
      if (message.type === "clay_live_ui_picker_state") {
        status = {
          requestId: message.requestId || null,
          pairingId: message.pairingId || null,
          state: String(message.state || "error"),
          error: message.error ? String(message.error).slice(0, 500) : null,
          code: message.code ? String(message.code).slice(0, 100) : null,
        };
        return true;
      }
      return false;
    }
    function handleTabUpdated(tabId, changeInfo, tab) {
      if (discovery) discovery.handleTabUpdated(tabId, changeInfo);
      if (changeInfo.status === "loading") workspaceProbe.clear(tabId);
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
    function pickerState(message, sendResponse) {
      targetResolver.resolve(chromeApi, message, publicTab, function (activeTab) {
        var connectedControls = controls();
        function respond(discoveryState) {
          var targetWorkspace = workspaceProbe.ensure(
            activeTab, connectedControls, activeTab ? [activeTab] : []);
          sendResponse({
            ok: true,
            activeTab: activeTab,
            controls: connectedControls,
            pairings: runtime.getPairings(), recentPairings: runtime.getRecentPairings(),
            status: status,
            targetWorkspace: targetWorkspace,
            discoveringClay: !!(discoveryState &&
              discoveryState.candidateCount),
          });
        }
        if (!connectedControls.length && discovery) {
          discovery.discover(respond);
          return;
        }
        respond(null);
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
      var project = projectBySlug(identity.projects, projectSlug);
      var selected = message.createSession ? null :
        findSelection(identity, projectSlug, message.sessionId);
      if (!project || (!message.createSession && !selected)) {
        sendResponse({ ok: false, error: "The selected session is no longer available." });
        return;
      }
      chromeApi.tabs.query({}, function (tabs) {
        targetResolver.resolve(chromeApi, message, publicTab, function (target) {
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
            sessionId: selected ? selected.id : null,
            targetTabId: target.id,
            createSession: message.createSession === true,
            attachWorkspace: message.attachWorkspace === true,
            reconnectServer: message.reconnectServer === true,
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
    function loadProject(message, sendResponse) {
      var controlTabId = Number(message.controlTabId);
      var identity = identities[controlTabId];
      var projectSlug = String(message.projectSlug || "");
      var project = identity && projectBySlug(identity.projects, projectSlug);
      var port = getPort(controlTabId);
      if (!project || !port) {
        sendResponse({ ok: false, error: "That Clay project is unavailable." });
        return;
      }
      if (project.sessionsLoaded || project.sessionsLoading) {
        sendResponse({ ok: true });
        return;
      }
      project.sessionsLoading = true;
      project.sessionsError = null;
      try {
        port.postMessage({
          type: "clay_live_ui_project_sessions_request",
          requestId: "project-sessions-" + Date.now() + "-" + (++counter),
          projectSlug: projectSlug,
        });
        sendResponse({ ok: true });
      } catch (error) {
        project.sessionsLoading = false;
        project.sessionsError = "Clay disconnected while loading chats.";
        sendResponse({ ok: false, error: project.sessionsError });
      }
    }
    function connectCurrent(sendResponse) {
      chromeApi.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0] ? publicTab(tabs[0]) : null;
        if (!tab || !discoveryModule ||
            !discoveryModule.isClayProjectUrl(tab.url)) {
          sendResponse({
            ok: false,
            error: "Open Clay to a project in this tab first, then connect it.",
          });
          return;
        }
        if (identities[tab.id]) {
          sendResponse({ ok: true, alreadyConnected: true });
          return;
        }
        if (getPort(tab.id)) {
          waitForIdentity(tab.id, sendResponse);
          return;
        }
        chromeApi.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        }, function () {
          var error = chromeApi.runtime.lastError;
          if (error) {
            sendResponse({ ok: false, error: error.message });
            return;
          }
          waitForIdentity(tab.id, sendResponse);
        });
      });
    }
    function exitPairing(message, sendResponse) {
      runtime.exitPairing(message.pairingId, function (result) {
        if (result && result.ok) status = null;
        sendResponse(result);
      });
    }
    function recoverPairing(metadata) {
      return recovery.recover(metadata);
    }
    function handlePopupMessage(message, sendResponse) {
      if (!message) return false;
      if (message.type === "live_ui_picker_get_state") {
        pickerState(message, sendResponse);
        return true;
      }
      if (message.type === "live_ui_picker_pair") {
        pair(message, sendResponse);
        return true;
      }
      if (message.type === "live_ui_picker_create") {
        pair(Object.assign({}, message, { createSession: true }), sendResponse);
        return true;
      }
      if (message.type === "live_ui_picker_load_project") {
        loadProject(message, sendResponse);
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
      handlePortConnected: handlePortConnected, handlePortDisconnected: handlePortDisconnected,
      handlePortMessage: handlePortMessage, handleTabUpdated: handleTabUpdated,
      handlePopupMessage: handlePopupMessage, recoverPairing: recoverPairing,
    };
  }
  root.ClayLiveUiPickerBackground = { createPicker: createPicker };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.ClayLiveUiPickerBackground;
})(typeof globalThis !== "undefined" ? globalThis : this);
