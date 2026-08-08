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
var liveUiRecovery = null;
var liveUiOptionsSignature = null;

function setLiveUiStatus(text, kind) {
  liveUiStatus.textContent = text || "";
  liveUiStatus.className = "live-ui-status" + (kind ? " " + kind : "");
}

function liveUiErrorText(error) {
  return error || "Live UI could not start.";
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

function recentPairing(state) {
  if (!state || !state.activeTab) return null;
  var recent = state.recentPairings || [];
  for (var i = 0; i < recent.length; i++) {
    if (Number(recent[i].targetTabId) === Number(state.activeTab.id)) return recent[i];
  }
  return null;
}

function collectLiveUiProjects(controls, targetWorkspace) {
  var byKey = {};
  var targetSlug = targetWorkspace && targetWorkspace.state === "matched" ?
    targetWorkspace.projectSlug : null;
  var manual = targetWorkspace && targetWorkspace.state === "manual";
  if (!targetSlug && !manual) return [];
  for (var ci = 0; ci < controls.length; ci++) {
    var control = controls[ci];
    var projects = control.projects || [];
    for (var pi = 0; pi < projects.length; pi++) {
      var project = projects[pi];
      if (!manual && project.projectSlug !== targetSlug) continue;
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

function projectIndexForSelection(previousKey, preferredPairing) {
  var currentIndex = -1;
  var preferredIndex = -1;
  var preferredExactIndex = -1;
  for (var pi = 0; pi < liveUiProjects.length; pi++) {
    var project = liveUiProjects[pi];
    if (project.key === previousKey) return pi;
    if (currentIndex < 0 && project.current) currentIndex = pi;
    if (!preferredPairing || project.projectSlug !== preferredPairing.projectSlug) continue;
    if (preferredIndex < 0) preferredIndex = pi;
    if (Number(project.controlTabId) === Number(preferredPairing.clayTabId)) {
      preferredExactIndex = pi;
    }
  }
  if (preferredExactIndex >= 0) return preferredExactIndex;
  if (preferredIndex >= 0) return preferredIndex;
  return currentIndex >= 0 ? currentIndex : 0;
}

function sessionIdForSelection(previousSessionId, preferredPairing) {
  if (previousSessionId !== null) return previousSessionId;
  return preferredPairing ? preferredPairing.sessionId : null;
}

function optionsSignature(projects, preferredPairing) {
  return JSON.stringify({
    projects: projects,
    preferred: preferredPairing ? {
      clayTabId: preferredPairing.clayTabId,
      projectSlug: preferredPairing.projectSlug,
      sessionId: preferredPairing.sessionId,
    } : null,
  });
}

function renderLiveUiOptions(controls, preferredPairing, targetWorkspace) {
  if (document.activeElement === liveUiSessionSelect ||
      document.activeElement === liveUiProjectSelect) return;
  var previousProject = liveUiProjects[Number(liveUiProjectSelect.value)] || null;
  var previousSession = liveUiOptions[Number(liveUiSessionSelect.value)] || null;
  var previousKey = previousProject ? previousProject.key : null;
  var previousSessionId = previousSession ? previousSession.sessionId : null;
  var nextProjects = collectLiveUiProjects(controls, targetWorkspace);
  var nextSignature = optionsSignature(nextProjects, preferredPairing);
  if (nextSignature === liveUiOptionsSignature) return;
  var projectActive = document.activeElement === liveUiProjectSelect;
  liveUiProjects = nextProjects;
  if (!projectActive) {
    liveUiProjectSelect.innerHTML = "";
    for (var pi = 0; pi < liveUiProjects.length; pi++) {
      var project = liveUiProjects[pi];
      var option = document.createElement("option");
      option.value = String(pi);
      option.textContent = project.projectLabel;
      liveUiProjectSelect.appendChild(option);
    }
  }
  var selectedProjectIndex = projectIndexForSelection(previousKey, preferredPairing);
  if (!projectActive) liveUiProjectSelect.value = String(selectedProjectIndex);
  var selectedProject = liveUiProjects[selectedProjectIndex] || null;
  var desiredSessionId = sessionIdForSelection(previousSessionId, preferredPairing);
  renderSessionOptions(selectedProject, desiredSessionId);
  requestProjectSessions(selectedProject);
  if (!projectActive) liveUiOptionsSignature = nextSignature;
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
      var selected = liveUiOptions[Number(liveUiSessionSelect.value)] || null;
      var restored = selected && liveUiRecovery &&
        selected.projectSlug === liveUiRecovery.projectSlug &&
        String(selected.sessionId) === String(liveUiRecovery.sessionId);
      liveUiHint.textContent = restored ?
        "Previous Live UI chat restored. Start to reconnect." :
        liveUiOptions.length ?
          "Choose a visible top-level chat. Workers are intentionally omitted." :
          "This project has no visible top-level chats.";
    }
  }
}

function renderSetupState(activeTab, controls, discoveringClay, targetWorkspace) {
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
  if (!targetWorkspace || targetWorkspace.state === "checking") {
    liveUiBadge.textContent = "Matching page";
    liveUiBadge.className = "live-ui-badge";
    liveUiProjectSelect.disabled = true;
    liveUiSessionSelect.disabled = true;
    liveUiStartBtn.disabled = true;
    liveUiConnectBtn.classList.add("hidden");
    liveUiHint.textContent = "Identifying the registered project for this server…";
    return;
  }
  if (targetWorkspace.state !== "matched" &&
      targetWorkspace.state !== "manual") {
    liveUiBadge.textContent = "No project match";
    liveUiBadge.className = "live-ui-badge";
    liveUiProjectSelect.disabled = true;
    liveUiSessionSelect.disabled = true;
    liveUiStartBtn.disabled = true;
    liveUiConnectBtn.classList.add("hidden");
    liveUiHint.textContent = targetWorkspace.error ||
      "This server is not inside a registered Clay project.";
    return;
  }
  renderConnectedSetup(activeTab, controls);
  if (targetWorkspace.state === "manual") {
    liveUiHint.textContent =
      "Choose the project and chat for this remote preview; Clay will verify its exact origin.";
  }
}

function renderPickerStatus(pickerStatus) {
  if (!pickerStatus) return;
  if (pickerStatus.state === "error") {
    setLiveUiStatus(liveUiErrorText(pickerStatus.error), "error");
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
  liveUiRecovery = recentPairing(state);
  renderLiveUiOptions(controls, liveUiRecovery, state.targetWorkspace);
  renderSetupState(
    activeTab, controls, state.discoveringClay, state.targetWorkspace);
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
    attachWorkspace: true,
  }, function (response) {
    if (chrome.runtime.lastError || !response || !response.ok) {
      setLiveUiStatus(liveUiErrorText(response && response.error), "error");
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
