var connectionBadge = document.getElementById("connectionBadge");
var connectionLabel = document.getElementById("connectionLabel");
var targetTitle = document.getElementById("targetTitle");
var targetUrl = document.getElementById("targetUrl");
var tabNumber = document.getElementById("tabNumber");
var projectSelect = document.getElementById("projectSelect");
var sessionSelect = document.getElementById("sessionSelect");
var startButton = document.getElementById("startButton");
var newSessionButton = document.getElementById("newSessionButton");
var exitButton = document.getElementById("exitButton");
var panelStatus = document.getElementById("panelStatus");
var setupWorkspace = document.getElementById("setupWorkspace");
var liveWorkspace = document.getElementById("liveWorkspace");
var liveSession = document.getElementById("liveSession");
var liveProject = document.getElementById("liveProject");
var inspectedTabId = chrome.devtools.inspectedWindow.tabId;
var panelState = null;
var projects = [];
var sessions = [];
var requestedProjects = {};
var optionsSignature = null;
var pollTimer = null;
var loadingState = false;
var loadingTarget = false;
var liveUiWorkspace = null;
var extensionContextLost = false;

function setBadge(label, kind) {
  connectionLabel.textContent = label;
  connectionBadge.className = "connection-badge " + kind;
}

function setStatus(message, kind) {
  panelStatus.textContent = message || "";
  panelStatus.className = "panel-status" + (kind ? " " + kind : "");
}

function errorText(error, code) {
  if (code === "LIVE_UI_TARGET_PROJECT_MISMATCH") {
    return "That chat belongs to a different project than the inspected server.";
  }
  return error || "Live UI could not start.";
}

function recoverExtensionContext(error) {
  var message = error && error.message || String(error || "");
  if (!/extension context invalidated/i.test(message)) return false;
  if (extensionContextLost) return true;
  extensionContextLost = true;
  loadingState = loadingTarget = false;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  setupWorkspace.classList.remove("hidden");
  liveWorkspace.classList.add("hidden");
  projectSelect.disabled = sessionSelect.disabled = true;
  startButton.disabled = newSessionButton.disabled = exitButton.disabled = true;
  setBadge("Reloading", "checking");
  setStatus("The extension was updated. Reloading the Clay panel…");
  setTimeout(function () { window.location.reload(); }, 50);
  return true;
}

function send(message, callback) {
  if (extensionContextLost) return;
  var payload = Object.assign({}, message, { targetTabId: inspectedTabId });
  try {
    chrome.runtime.sendMessage(payload, function (response) {
      var lastError = null;
      try {
        lastError = chrome.runtime.lastError;
      } catch (error) {
        if (recoverExtensionContext(error)) return;
        lastError = error;
      }
      if (lastError) {
        if (recoverExtensionContext(lastError)) return;
        callback({ ok: false, error: lastError.message || String(lastError) });
        return;
      }
      callback(response || { ok: false, error: "The extension background is unavailable." });
    });
  } catch (error) {
    if (recoverExtensionContext(error)) return;
    callback({ ok: false, error: error.message || String(error) });
  }
}

function sendTarget(action, payload, callback) {
  var pairing = activePairing(panelState);
  if (!pairing) {
    callback({ ok: false, error: "The inspected page is not paired." });
    return;
  }
  send({
    type: "live_ui_devtools_command",
    pairingId: pairing.pairingId,
    action: action,
    payload: payload || {},
  }, callback);
}

function activePairing(state) {
  var pairings = state && state.pairings || [];
  for (var i = 0; i < pairings.length; i++) {
    if (Number(pairings[i].targetTabId) === Number(inspectedTabId)) return pairings[i];
  }
  return null;
}

function recentPairing(state) {
  var recent = state && state.recentPairings || [];
  for (var i = 0; i < recent.length; i++) {
    if (Number(recent[i].targetTabId) === Number(inspectedTabId)) return recent[i];
  }
  return null;
}

function collectProjects(controls, targetWorkspace) {
  var byKey = {};
  var targetSlug = targetWorkspace && targetWorkspace.state === "matched" ?
    targetWorkspace.projectSlug : null;
  var manual = targetWorkspace && targetWorkspace.state === "manual";
  if (!targetSlug && !manual) return [];
  for (var ci = 0; ci < controls.length; ci++) {
    var control = controls[ci];
    var controlProjects = control.projects || [];
    for (var pi = 0; pi < controlProjects.length; pi++) {
      var value = controlProjects[pi];
      if (!manual && value.projectSlug !== targetSlug) continue;
      var key = control.serverOrigin + "|" + value.projectSlug;
      var candidate = {
        key: key,
        controlTabId: control.controlTabId,
        serverOrigin: control.serverOrigin,
        projectSlug: value.projectSlug,
        projectLabel: value.projectLabel || value.projectSlug,
        sessions: value.sessions || [],
        sessionsLoaded: !!value.sessionsLoaded,
        sessionsLoading: !!value.sessionsLoading,
        sessionsError: value.sessionsError || null,
        current: control.currentProjectSlug === value.projectSlug,
      };
      var existing = byKey[key];
      if (!existing || (!existing.sessionsLoaded && candidate.sessionsLoaded) ||
          (existing.sessionsLoaded === candidate.sessionsLoaded &&
           !existing.current && candidate.current)) {
        byKey[key] = candidate;
      }
    }
  }
  var result = Object.keys(byKey).map(function (key) { return byKey[key]; });
  result.sort(function (a, b) {
    return String(a.projectLabel).localeCompare(String(b.projectLabel));
  });
  return result;
}

function selectedProject() {
  return projects[Number(projectSelect.value)] || null;
}

function selectedSession() {
  return sessions[Number(sessionSelect.value)] || null;
}

function projectIndex(previousKey, preferred) {
  var currentIndex = -1;
  var preferredIndex = -1;
  var exactIndex = -1;
  for (var i = 0; i < projects.length; i++) {
    if (projects[i].key === previousKey) return i;
    if (currentIndex < 0 && projects[i].current) currentIndex = i;
    if (!preferred || projects[i].projectSlug !== preferred.projectSlug) continue;
    if (preferredIndex < 0) preferredIndex = i;
    if (Number(projects[i].controlTabId) === Number(preferred.clayTabId)) exactIndex = i;
  }
  if (exactIndex >= 0) return exactIndex;
  if (preferredIndex >= 0) return preferredIndex;
  return currentIndex >= 0 ? currentIndex : 0;
}

function renderSessions(project, preferredSessionId) {
  sessionSelect.innerHTML = "";
  sessions = [];
  if (!project || !project.sessionsLoaded) {
    var pending = document.createElement("option");
    pending.textContent = project && project.sessionsError ?
      "Chats unavailable" : "Loading chats…";
    sessionSelect.appendChild(pending);
    sessionSelect.disabled = true;
    return;
  }
  if (!project.sessions.length) {
    var empty = document.createElement("option");
    empty.textContent = "No top-level chats";
    sessionSelect.appendChild(empty);
    sessionSelect.disabled = true;
    return;
  }
  for (var i = 0; i < project.sessions.length; i++) {
    var value = project.sessions[i];
    var session = {
      controlTabId: project.controlTabId,
      projectSlug: project.projectSlug,
      sessionId: value.id,
    };
    var option = document.createElement("option");
    option.value = String(sessions.length);
    option.textContent = (value.active ? "Current · " : "") +
      (value.coordinationMode ? "Coordinator · " : "") + value.title +
      (value.isProcessing ? " · working" : "");
    sessions.push(session);
    sessionSelect.appendChild(option);
    if (preferredSessionId !== null &&
        String(preferredSessionId) === String(value.id)) {
      sessionSelect.value = option.value;
    }
  }
  sessionSelect.disabled = false;
}

function requestSessions(project) {
  if (!project || project.sessionsLoaded || project.sessionsLoading ||
      project.sessionsError || requestedProjects[project.key]) return;
  requestedProjects[project.key] = true;
  setStatus("Reading visible chats from " + project.projectLabel + "…");
  send({
    type: "live_ui_picker_load_project",
    controlTabId: project.controlTabId,
    projectSlug: project.projectSlug,
  }, function (response) {
    if (!response.ok) {
      delete requestedProjects[project.key];
      setStatus(response.error || "Clay could not load this project's chats.", "error");
      return;
    }
    setTimeout(loadState, 80);
  });
}

function renderOptions(controls, preferred) {
  if (document.activeElement === sessionSelect ||
      document.activeElement === projectSelect) return;
  var previousProject = selectedProject();
  var previousSession = selectedSession();
  var nextProjects = collectProjects(controls, panelState && panelState.targetWorkspace);
  var signature = JSON.stringify({ projects: nextProjects, preferred: preferred });
  if (signature === optionsSignature) return;
  projects = nextProjects;
  projectSelect.innerHTML = "";
  for (var i = 0; i < projects.length; i++) {
    var option = document.createElement("option");
    option.value = String(i);
    option.textContent = projects[i].projectLabel;
    projectSelect.appendChild(option);
  }
  var index = projectIndex(previousProject ? previousProject.key : null, preferred);
  projectSelect.value = String(index);
  projectSelect.disabled = projects.length === 0;
  var desiredSession = previousSession ? previousSession.sessionId :
    preferred ? preferred.sessionId : null;
  renderSessions(projects[index] || null, desiredSession);
  requestSessions(projects[index] || null);
  optionsSignature = signature;
}

function renderTarget(tab) {
  tabNumber.textContent = "TAB " + inspectedTabId;
  targetTitle.textContent = tab ? tab.title || "Inspected page" : "Page unavailable";
  targetUrl.textContent = tab ? tab.url : "Chrome did not expose this tab.";
}

function renderActive(pairing) {
  setBadge("Live", "live");
  setupWorkspace.classList.add("hidden");
  liveWorkspace.classList.remove("hidden");
  liveSession.textContent = pairing.sessionLabel || "New chat";
  liveProject.textContent = pairing.projectLabel || pairing.projectSlug || "Clay project";
  projectSelect.disabled = true;
  sessionSelect.disabled = true;
  startButton.disabled = true;
  newSessionButton.disabled = true;
  setStatus("");
  loadTargetState(pairing);
}

function loadTargetState(pairing) {
  if (loadingTarget) return;
  loadingTarget = true;
  send({
    type: "live_ui_devtools_command",
    pairingId: pairing.pairingId,
    action: "snapshot",
  }, function (response) {
    loadingTarget = false;
    var currentPairing = activePairing(panelState);
    if (!currentPairing || currentPairing.pairingId !== pairing.pairingId) return;
    if (response && response.ok) {
      liveUiWorkspace.render(response);
      return;
    }
    liveUiWorkspace.render({
      ok: true,
      pairingId: pairing.pairingId,
      projectLabel: pairing.projectLabel || pairing.projectSlug || "Clay project",
      sessionLabel: pairing.sessionLabel || "Connected chat",
      connected: false,
      selecting: false,
      submitting: false,
      selection: null,
      composeError: response && response.error || "The inspected page is not responding.",
      reports: [],
      counts: {},
      aggregateStatus: "",
      hmr: {},
    });
  });
}

function renderPickerStatus(status) {
  if (!status) return;
  if (status.state === "error") {
    setStatus(errorText(status.error, status.code), "error");
  } else if (status.state === "switching_project") {
    setStatus("Opening the selected project in Clay…");
  } else if (status.state === "requesting" || status.state === "pairing") {
    setStatus("Connecting the inspected page to Clay…");
  }
}

function renderSetup(state) {
  liveWorkspace.classList.add("hidden");
  setupWorkspace.classList.remove("hidden");
  liveUiWorkspace.reset();
  var controls = state.controls || [];
  var preferred = recentPairing(state);
  renderOptions(controls, preferred);
  var targetWorkspace = state.targetWorkspace;
  if (!controls.length) {
    setBadge(state.discoveringClay ? "Finding Clay" : "Needs Clay", "checking");
    projectSelect.disabled = true;
    sessionSelect.disabled = true;
    startButton.disabled = true;
    newSessionButton.disabled = true;
    setStatus(state.discoveringClay ?
      "Connecting to an open Clay project tab…" :
      "Open Clay in another browser tab. It will be discovered automatically.");
  } else if (!targetWorkspace || targetWorkspace.state === "checking") {
    setBadge("Matching page", "checking");
    projectSelect.disabled = true;
    sessionSelect.disabled = true;
    startButton.disabled = true;
    newSessionButton.disabled = true;
    setStatus("Identifying which registered Clay project contains this server…");
  } else if (targetWorkspace.state !== "matched" &&
      targetWorkspace.state !== "manual") {
    setBadge("No project match", "error");
    projectSelect.disabled = true;
    sessionSelect.disabled = true;
    startButton.disabled = true;
    newSessionButton.disabled = true;
    setStatus(targetWorkspace.error ||
      "This server is not inside a registered Clay project.", "error");
  } else if (!projects.length) {
    setBadge("Clay connected", "ready");
    startButton.disabled = true;
    newSessionButton.disabled = true;
    setStatus("The matching project is not available to this Clay user.", "error");
  } else {
    setBadge("Ready", "ready");
    startButton.disabled = sessions.length === 0;
    newSessionButton.disabled = targetWorkspace.state !== "matched";
    if (!state.status) {
      var project = selectedProject();
      var workspaceLabel = targetWorkspace.worktreeLabel || "Main workspace";
      if (project && project.sessionsLoading) {
        setStatus(targetWorkspace.state === "manual" ?
          "Remote preview detected. Reading this project's visible chats…" :
          "Matched " + project.projectLabel + " · " + workspaceLabel +
            ". Reading its visible chats…");
      } else if (project && project.sessionsError) {
        setStatus(project.sessionsError, "error");
      } else {
        setStatus(targetWorkspace.state === "manual" ?
          "Choose the project and chat for this remote preview. Clay will verify its exact origin." :
          sessions.length ?
          "Matched " + project.projectLabel + " · " + workspaceLabel +
            ". Choose a chat or create a new coordinator." :
          "No visible top-level chats. Create a coordinator for this workspace.");
      }
    }
  }
  renderPickerStatus(state.status);
}

function renderState(state) {
  panelState = state;
  renderTarget(state.activeTab);
  var pairing = activePairing(state);
  if (pairing) {
    renderActive(pairing);
    return;
  }
  renderSetup(state);
}

function loadState() {
  if (extensionContextLost || loadingState) return;
  loadingState = true;
  send({ type: "live_ui_picker_get_state" }, function (response) {
    loadingState = false;
    if (!response.ok) {
      setBadge("Unavailable", "error");
      setStatus(response.error, "error");
      return;
    }
    renderState(response);
  });
}

projectSelect.addEventListener("change", function () {
  var project = selectedProject();
  renderSessions(project, null);
  requestSessions(project);
  startButton.disabled = sessions.length === 0;
  newSessionButton.disabled = !project || !panelState ||
    !panelState.targetWorkspace ||
    panelState.targetWorkspace.state !== "matched";
});

function requestPair() {
  var selected = selectedSession();
  if (!selected) return;
  startButton.disabled = true;
  newSessionButton.disabled = true;
  setStatus("Attaching this chat to the inspected workspace…");
  send({
    type: "live_ui_picker_pair",
    controlTabId: selected.controlTabId,
    projectSlug: selected.projectSlug,
    sessionId: selected.sessionId,
    attachWorkspace: true,
  }, function (response) {
    if (!response.ok) {
      setStatus(errorText(response.error, response.code), "error");
      startButton.disabled = false;
      newSessionButton.disabled = !panelState || !panelState.targetWorkspace ||
        panelState.targetWorkspace.state !== "matched";
      return;
    }
    setTimeout(loadState, 150);
  });
}

startButton.addEventListener("click", function () {
  requestPair();
});

newSessionButton.addEventListener("click", function () {
  var project = selectedProject();
  if (!project) return;
  startButton.disabled = true;
  newSessionButton.disabled = true;
  setStatus("Creating a coordinator chat for this inspected workspace…");
  send({
    type: "live_ui_picker_create",
    controlTabId: project.controlTabId,
    projectSlug: project.projectSlug,
    attachWorkspace: true,
  }, function (response) {
    if (!response.ok) {
      setStatus(errorText(response.error, response.code), "error");
      newSessionButton.disabled = false;
      startButton.disabled = sessions.length === 0;
      return;
    }
    setTimeout(loadState, 150);
  });
});

exitButton.addEventListener("click", function () {
  var pairing = activePairing(panelState);
  if (!pairing) return;
  exitButton.disabled = true;
  send({ type: "live_ui_picker_exit", pairingId: pairing.pairingId }, function (response) {
    exitButton.disabled = false;
    if (!response.ok) setStatus(response.error || "Live UI could not exit.", "error");
    loadState();
  });
});

liveUiWorkspace = ClayLiveUiDevtoolsWorkspace.create({ command: sendTarget });
loadState();
if (!extensionContextLost) pollTimer = setInterval(loadState, 750);
window.addEventListener("unload", function () {
  if (pollTimer) clearInterval(pollTimer);
});
