var connectionBadge = document.getElementById("connectionBadge");
var connectionLabel = document.getElementById("connectionLabel");
var targetTitle = document.getElementById("targetTitle");
var targetUrl = document.getElementById("targetUrl");
var tabNumber = document.getElementById("tabNumber");
var projectSelect = document.getElementById("projectSelect");
var sessionSelect = document.getElementById("sessionSelect");
var startButton = document.getElementById("startButton");
var exitButton = document.getElementById("exitButton");
var panelStatus = document.getElementById("panelStatus");
var inactiveView = document.getElementById("inactiveView");
var activeView = document.getElementById("activeView");
var activeSession = document.getElementById("activeSession");
var activeProject = document.getElementById("activeProject");
var activeRouteLabel = document.getElementById("activeRouteLabel");
var inspectedTabId = chrome.devtools.inspectedWindow.tabId;
var panelState = null;
var projects = [];
var sessions = [];
var requestedProjects = {};
var optionsSignature = null;
var pollTimer = null;
var loadingState = false;

function setBadge(label, kind) {
  connectionLabel.textContent = label;
  connectionBadge.className = "connection-badge " + kind;
}

function setStatus(message, kind) {
  panelStatus.textContent = message || "";
  panelStatus.className = "panel-status" + (kind ? " " + kind : "");
}

function errorText(error) {
  if (error === "Start the session's local development server before opening Live UI") {
    return "This chat does not own the development server for the inspected page. " +
      "Choose the chat that started it, or start its server.";
  }
  return error || "Live UI could not start.";
}

function send(message, callback) {
  var payload = Object.assign({}, message, { targetTabId: inspectedTabId });
  chrome.runtime.sendMessage(payload, function (response) {
    if (chrome.runtime.lastError) {
      callback({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }
    callback(response || { ok: false, error: "The extension background is unavailable." });
  });
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

function collectProjects(controls) {
  var byKey = {};
  for (var ci = 0; ci < controls.length; ci++) {
    var control = controls[ci];
    var controlProjects = control.projects || [];
    for (var pi = 0; pi < controlProjects.length; pi++) {
      var value = controlProjects[pi];
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
  if (document.activeElement === sessionSelect) return;
  var previousProject = selectedProject();
  var previousSession = selectedSession();
  var nextProjects = collectProjects(controls);
  var signature = JSON.stringify({ projects: nextProjects, preferred: preferred });
  if (signature === optionsSignature) return;
  var projectActive = document.activeElement === projectSelect;
  projects = nextProjects;
  if (!projectActive) {
    projectSelect.innerHTML = "";
    for (var i = 0; i < projects.length; i++) {
      var option = document.createElement("option");
      option.value = String(i);
      option.textContent = projects[i].projectLabel;
      projectSelect.appendChild(option);
    }
  }
  var index = projectIndex(previousProject ? previousProject.key : null, preferred);
  if (!projectActive) projectSelect.value = String(index);
  projectSelect.disabled = projects.length === 0;
  var desiredSession = previousSession ? previousSession.sessionId :
    preferred ? preferred.sessionId : null;
  renderSessions(projects[index] || null, desiredSession);
  requestSessions(projects[index] || null);
  if (!projectActive) optionsSignature = signature;
}

function renderTarget(tab) {
  tabNumber.textContent = "TAB " + inspectedTabId;
  targetTitle.textContent = tab ? tab.title || "Inspected page" : "Page unavailable";
  targetUrl.textContent = tab ? tab.url : "Chrome did not expose this tab.";
}

function renderActive(pairing) {
  setBadge("Live", "live");
  inactiveView.classList.add("hidden");
  activeView.classList.remove("hidden");
  activeSession.textContent = pairing.sessionLabel || "New chat";
  activeProject.textContent = pairing.projectLabel || pairing.projectSlug || "Clay project";
  activeRouteLabel.textContent = activeProject.textContent + " · " + activeSession.textContent;
  projectSelect.disabled = true;
  sessionSelect.disabled = true;
  startButton.disabled = true;
  setStatus("");
}

function renderPickerStatus(status) {
  if (!status) return;
  if (status.state === "error") {
    setStatus(errorText(status.error), "error");
  } else if (status.state === "switching_project") {
    setStatus("Opening the selected project in Clay…");
  } else if (status.state === "requesting" || status.state === "pairing") {
    setStatus("Connecting the inspected page to Clay…");
  }
}

function renderSetup(state) {
  activeView.classList.add("hidden");
  inactiveView.classList.remove("hidden");
  var controls = state.controls || [];
  var preferred = recentPairing(state);
  renderOptions(controls, preferred);
  if (!controls.length) {
    setBadge(state.discoveringClay ? "Finding Clay" : "Needs Clay", "checking");
    projectSelect.disabled = true;
    sessionSelect.disabled = true;
    startButton.disabled = true;
    setStatus(state.discoveringClay ?
      "Connecting to an open Clay project tab…" :
      "Open Clay in another browser tab. It will be discovered automatically.");
  } else if (!projects.length) {
    setBadge("Clay connected", "ready");
    startButton.disabled = true;
    setStatus("No available projects were found in Clay.");
  } else {
    setBadge("Ready", "ready");
    startButton.disabled = sessions.length === 0;
    if (!state.status) {
      var project = selectedProject();
      if (project && project.sessionsLoading) {
        setStatus("Reading only this project's visible chats…");
      } else if (project && project.sessionsError) {
        setStatus(project.sessionsError, "error");
      } else {
        setStatus(sessions.length ?
          "Choose a chat, then start Live UI on this inspected page." :
          "This project has no visible top-level chats.");
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
  if (loadingState) return;
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
});

startButton.addEventListener("click", function () {
  var selected = selectedSession();
  if (!selected) return;
  startButton.disabled = true;
  setStatus("Connecting the inspected page to Clay…");
  send({
    type: "live_ui_picker_pair",
    controlTabId: selected.controlTabId,
    projectSlug: selected.projectSlug,
    sessionId: selected.sessionId,
  }, function (response) {
    if (!response.ok) {
      setStatus(errorText(response.error), "error");
      startButton.disabled = false;
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

loadState();
pollTimer = setInterval(loadState, 750);
window.addEventListener("unload", function () {
  if (pollTimer) clearInterval(pollTimer);
});
