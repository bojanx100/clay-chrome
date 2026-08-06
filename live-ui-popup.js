var liveUiBadge = document.getElementById("liveUiBadge");
var liveUiTargetTitle = document.getElementById("liveUiTargetTitle");
var liveUiTargetUrl = document.getElementById("liveUiTargetUrl");
var liveUiSetup = document.getElementById("liveUiSetup");
var liveUiActive = document.getElementById("liveUiActive");
var liveUiActiveSession = document.getElementById("liveUiActiveSession");
var liveUiActiveProject = document.getElementById("liveUiActiveProject");
var liveUiProjectSelect = document.getElementById("liveUiProjectSelect");
var liveUiSessionSelect = document.getElementById("liveUiSessionSelect");
var liveUiStartBtn = document.getElementById("liveUiStartBtn");
var liveUiConnectBtn = document.getElementById("liveUiConnectBtn");
var liveUiExitBtn = document.getElementById("liveUiExitBtn");
var liveUiHint = document.getElementById("liveUiHint");
var liveUiStatus = document.getElementById("liveUiStatus");
var liveUiOptions = [];
var liveUiProjects = [];
var liveUiState = null;
var liveUiPoll = null;
var liveUiRequestedProjects = {};

function setLiveUiStatus(text, kind) {
  liveUiStatus.textContent = text || "";
  liveUiStatus.className = "live-ui-status" + (kind ? " " + kind : "");
}

function activePairing(state) {
  if (!state || !state.activeTab) return null;
  var pairings = state.pairings || [];
  for (var i = 0; i < pairings.length; i++) {
    if (Number(pairings[i].targetTabId) === Number(state.activeTab.id)) {
      return pairings[i];
    }
  }
  return null;
}

function collectLiveUiProjects(controls) {
  var byKey = {};
  for (var ci = 0; ci < controls.length; ci++) {
    var control = controls[ci];
    var projects = control.projects || [];
    for (var pi = 0; pi < projects.length; pi++) {
      var project = projects[pi];
      var key = control.serverOrigin + "|" + project.projectSlug;
      var candidate = {
        key: key,
        controlTabId: control.controlTabId,
        serverOrigin: control.serverOrigin,
        projectSlug: project.projectSlug,
        projectLabel: project.projectLabel || project.projectSlug,
        sessions: project.sessions || [],
        sessionsLoaded: !!project.sessionsLoaded,
        sessionsLoading: !!project.sessionsLoading,
        sessionsError: project.sessionsError || null,
        current: control.currentProjectSlug === project.projectSlug,
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

function renderSessionOptions(project, previousSessionId) {
  liveUiSessionSelect.innerHTML = "";
  liveUiOptions = [];
  if (!project) return;
  if (!project.sessionsLoaded) {
    var pendingOption = document.createElement("option");
    pendingOption.textContent = project.sessionsError ?
      "Chats unavailable" : "Loading chats…";
    liveUiSessionSelect.appendChild(pendingOption);
    return;
  }
  var sessions = project.sessions.slice();
  if (!sessions.length) {
    var emptyOption = document.createElement("option");
    emptyOption.textContent = "No top-level chats";
    liveUiSessionSelect.appendChild(emptyOption);
    return;
  }
  for (var si = 0; si < sessions.length; si++) {
    var optionData = {
      controlTabId: project.controlTabId,
      projectSlug: project.projectSlug,
      sessionId: sessions[si].id,
    };
    var option = document.createElement("option");
    option.value = String(liveUiOptions.length);
    option.textContent = (sessions[si].active ? "Current · " : "") +
      (sessions[si].coordinationMode ? "Coordinator · " : "") +
      sessions[si].title + (sessions[si].isProcessing ? " · working" : "");
    liveUiOptions.push(optionData);
    liveUiSessionSelect.appendChild(option);
    if (previousSessionId !== null &&
        String(previousSessionId) === String(sessions[si].id)) {
      liveUiSessionSelect.value = option.value;
    }
  }
}

function requestProjectSessions(project) {
  if (!project || project.sessionsLoaded || project.sessionsLoading ||
      project.sessionsError || liveUiRequestedProjects[project.key]) return;
  liveUiRequestedProjects[project.key] = true;
  setLiveUiStatus("Loading chats for " + project.projectLabel + "…");
  chrome.runtime.sendMessage({
    type: "live_ui_picker_load_project",
    controlTabId: project.controlTabId,
    projectSlug: project.projectSlug,
  }, function (response) {
    if (chrome.runtime.lastError || !response || !response.ok) {
      delete liveUiRequestedProjects[project.key];
      setLiveUiStatus(response && response.error ?
        response.error : "Clay could not load this project's chats.", "error");
      return;
    }
    setTimeout(loadLiveUiState, 80);
  });
}

function renderLiveUiOptions(controls) {
  var previousProject = liveUiProjects[Number(liveUiProjectSelect.value)] || null;
  var previousSession = liveUiOptions[Number(liveUiSessionSelect.value)] || null;
  var previousKey = previousProject ? previousProject.key : null;
  var previousSessionId = previousSession ? previousSession.sessionId : null;
  liveUiProjects = collectLiveUiProjects(controls);
  liveUiProjectSelect.innerHTML = "";
  var selectedProjectIndex = 0;
  var hasPreviousProject = false;
  for (var pi = 0; pi < liveUiProjects.length; pi++) {
    var project = liveUiProjects[pi];
    var option = document.createElement("option");
    option.value = String(pi);
    option.textContent = project.projectLabel;
    liveUiProjectSelect.appendChild(option);
    if (project.key === previousKey) {
      selectedProjectIndex = pi;
      hasPreviousProject = true;
    }
  }
  if (!hasPreviousProject) {
    for (var ci = 0; ci < liveUiProjects.length; ci++) {
      if (liveUiProjects[ci].current) {
        selectedProjectIndex = ci;
        break;
      }
    }
  }
  liveUiProjectSelect.value = String(selectedProjectIndex);
  var selectedProject = liveUiProjects[selectedProjectIndex] || null;
  renderSessionOptions(selectedProject, previousSessionId);
  requestProjectSessions(selectedProject);
}

function renderActivePairing(pairing) {
  liveUiBadge.textContent = "Live";
  liveUiBadge.className = "live-ui-badge active";
  liveUiSetup.classList.add("hidden");
  liveUiActive.classList.remove("hidden");
  liveUiActiveSession.textContent = pairing.sessionLabel || "New chat";
  liveUiActiveProject.textContent =
    (pairing.projectLabel || pairing.projectSlug || "Clay project") +
    " · messages stay pinned here until Exit";
  setLiveUiStatus("");
}

function activeTabIsClay(activeTab, controls) {
  for (var i = 0; i < controls.length; i++) {
    if (activeTab && Number(controls[i].controlTabId) === Number(activeTab.id)) {
      return true;
    }
  }
  return false;
}

function looksLikeClayPage(activeTab) {
  if (!activeTab || !activeTab.url) return false;
  try {
    var parsed = new URL(activeTab.url);
    return /^\/p\/[a-z0-9_-]+\/?$/.test(parsed.pathname);
  } catch (error) {
    return false;
  }
}

function renderConnectedSetup(activeTab, controls) {
  liveUiBadge.textContent = controls.length + " Clay tab" +
    (controls.length === 1 ? "" : "s");
  liveUiBadge.className = "live-ui-badge connected";
  liveUiProjectSelect.disabled = liveUiProjects.length === 0;
  liveUiSessionSelect.disabled = liveUiOptions.length === 0;
  liveUiStartBtn.disabled = !activeTab || liveUiOptions.length === 0;
  liveUiConnectBtn.classList.add("hidden");
  if (!liveUiProjects.length) {
    liveUiHint.textContent = "No available projects were found in Clay.";
  } else {
    var project = liveUiProjects[Number(liveUiProjectSelect.value)] || null;
    if (project && project.sessionsLoading) {
      liveUiHint.textContent = "Reading only this project's visible chats…";
    } else if (project && project.sessionsError) {
      liveUiHint.textContent = project.sessionsError;
    } else {
      liveUiHint.textContent = liveUiOptions.length
        ? "Choose a visible top-level chat. Workers are intentionally omitted."
        : "This project has no visible top-level chats.";
    }
  }
}

function renderSetupState(activeTab, controls, discoveringClay) {
  if (activeTabIsClay(activeTab, controls)) {
    liveUiBadge.textContent = "Connected";
    liveUiBadge.className = "live-ui-badge connected";
    liveUiProjectSelect.disabled = true;
    liveUiSessionSelect.disabled = true;
    liveUiStartBtn.disabled = true;
    liveUiConnectBtn.classList.add("hidden");
    liveUiHint.textContent =
      "Clay is connected. Open the web app tab, then click the extension again.";
    return;
  }
  if (!controls.length) {
    liveUiBadge.textContent = discoveringClay ? "Finding Clay" : "Needs Clay";
    liveUiBadge.className = "live-ui-badge";
    liveUiProjectSelect.disabled = true;
    liveUiSessionSelect.disabled = true;
    liveUiStartBtn.disabled = true;
    if (discoveringClay) {
      liveUiConnectBtn.classList.add("hidden");
      liveUiHint.textContent =
        "Connecting to the open Clay project tab automatically…";
    } else if (looksLikeClayPage(activeTab)) {
      liveUiConnectBtn.classList.remove("hidden");
      liveUiHint.textContent =
        "Clay should connect automatically. Use this only if discovery stalls.";
    } else {
      liveUiConnectBtn.classList.add("hidden");
      liveUiHint.textContent =
        "Open a Clay project in another tab; the extension will connect automatically.";
    }
    return;
  }
  renderConnectedSetup(activeTab, controls);
}

function renderPickerStatus(pickerStatus) {
  if (!pickerStatus) return;
  if (pickerStatus.state === "error") {
    setLiveUiStatus(pickerStatus.error || "Live UI could not start.", "error");
    return;
  }
  if (pickerStatus.state === "switching_project") {
    setLiveUiStatus("Opening the selected project in Clay…");
    return;
  }
  if (pickerStatus.state === "requesting" || pickerStatus.state === "pairing") {
    setLiveUiStatus("Connecting the tab to Clay…");
  }
}

function renderLiveUi(state) {
  liveUiState = state;
  if (!state.status) setLiveUiStatus("");
  var activeTab = state.activeTab;
  liveUiTargetTitle.textContent = activeTab ? activeTab.title || "Current tab" : "No web tab";
  liveUiTargetUrl.textContent = activeTab ? activeTab.url : "Open an http or https page.";

  var pairing = activePairing(state);
  if (pairing) {
    renderActivePairing(pairing);
    return;
  }

  liveUiActive.classList.add("hidden");
  liveUiSetup.classList.remove("hidden");
  var controls = state.controls || [];
  renderLiveUiOptions(controls);
  renderSetupState(activeTab, controls, state.discoveringClay);
  renderPickerStatus(state.status);
}

function loadLiveUiState() {
  chrome.runtime.sendMessage({ type: "live_ui_picker_get_state" }, function (response) {
    if (chrome.runtime.lastError || !response || !response.ok) {
      setLiveUiStatus("The extension background is unavailable.", "error");
      return;
    }
    renderLiveUi(response);
  });
}

liveUiProjectSelect.addEventListener("change", function () {
  var project = liveUiProjects[Number(liveUiProjectSelect.value)] || null;
  renderSessionOptions(project, null);
  requestProjectSessions(project);
  liveUiSessionSelect.disabled = liveUiOptions.length === 0;
  liveUiStartBtn.disabled = !liveUiState || !liveUiState.activeTab ||
    liveUiOptions.length === 0;
});

liveUiStartBtn.addEventListener("click", function () {
  var selected = liveUiOptions[Number(liveUiSessionSelect.value)];
  if (!selected) return;
  liveUiStartBtn.disabled = true;
  setLiveUiStatus("Connecting the tab to Clay…");
  chrome.runtime.sendMessage({
    type: "live_ui_picker_pair",
    controlTabId: selected.controlTabId,
    projectSlug: selected.projectSlug,
    sessionId: selected.sessionId,
  }, function (response) {
    if (chrome.runtime.lastError || !response || !response.ok) {
      setLiveUiStatus(response && response.error ?
        response.error : "Live UI could not start.", "error");
      liveUiStartBtn.disabled = false;
      return;
    }
    setTimeout(loadLiveUiState, 150);
  });
});

liveUiConnectBtn.addEventListener("click", function () {
  liveUiConnectBtn.disabled = true;
  setLiveUiStatus("Connecting this tab to the extension…");
  chrome.runtime.sendMessage({ type: "live_ui_picker_connect_current" }, function (response) {
    if (chrome.runtime.lastError || !response || !response.ok) {
      setLiveUiStatus(response && response.error ?
        response.error : "This tab could not be connected.", "error");
      liveUiConnectBtn.disabled = false;
      return;
    }
    setLiveUiStatus("Clay connected. Return to the web app tab.", "success");
    setTimeout(loadLiveUiState, 350);
  });
});

liveUiExitBtn.addEventListener("click", function () {
  var pairing = activePairing(liveUiState);
  if (!pairing) return;
  liveUiExitBtn.disabled = true;
  chrome.runtime.sendMessage({
    type: "live_ui_picker_exit",
    pairingId: pairing.pairingId,
  }, function () {
    loadLiveUiState();
  });
});

loadLiveUiState();
liveUiPoll = setInterval(loadLiveUiState, 750);
window.addEventListener("unload", function () {
  if (liveUiPoll) clearInterval(liveUiPoll);
});
