var liveUiBadge = document.getElementById("liveUiBadge");
var liveUiTargetTitle = document.getElementById("liveUiTargetTitle");
var liveUiTargetUrl = document.getElementById("liveUiTargetUrl");
var liveUiSetup = document.getElementById("liveUiSetup");
var liveUiActive = document.getElementById("liveUiActive");
var liveUiActiveSession = document.getElementById("liveUiActiveSession");
var liveUiActiveProject = document.getElementById("liveUiActiveProject");
var liveUiSessionSelect = document.getElementById("liveUiSessionSelect");
var liveUiStartBtn = document.getElementById("liveUiStartBtn");
var liveUiConnectBtn = document.getElementById("liveUiConnectBtn");
var liveUiExitBtn = document.getElementById("liveUiExitBtn");
var liveUiHint = document.getElementById("liveUiHint");
var liveUiStatus = document.getElementById("liveUiStatus");
var liveUiOptions = [];
var liveUiState = null;
var liveUiPoll = null;

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

function renderLiveUiOptions(controls) {
  var previous = liveUiSessionSelect.value;
  liveUiSessionSelect.innerHTML = "";
  liveUiOptions = [];
  for (var ci = 0; ci < controls.length; ci++) {
    var control = controls[ci];
    var group = document.createElement("optgroup");
    group.label = control.projectLabel + " · " + control.serverOrigin;
    var sessions = (control.sessions || []).slice().sort(function (a, b) {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return String(a.title).localeCompare(String(b.title));
    });
    for (var si = 0; si < sessions.length; si++) {
      var optionData = {
        controlTabId: control.controlTabId,
        sessionId: sessions[si].id,
      };
      var option = document.createElement("option");
      option.value = String(liveUiOptions.length);
      option.textContent = (sessions[si].active ? "Current · " : "") +
        sessions[si].title + (sessions[si].isProcessing ? " · working" : "");
      liveUiOptions.push(optionData);
      group.appendChild(option);
    }
    if (group.children.length) liveUiSessionSelect.appendChild(group);
  }
  if (previous && liveUiOptions[Number(previous)]) {
    liveUiSessionSelect.value = previous;
  }
}

function renderLiveUi(state) {
  liveUiState = state;
  var activeTab = state.activeTab;
  liveUiTargetTitle.textContent = activeTab ? activeTab.title || "Current tab" : "No web tab";
  liveUiTargetUrl.textContent = activeTab ? activeTab.url : "Open an http or https page.";

  var pairing = activePairing(state);
  if (pairing) {
    liveUiBadge.textContent = "Live";
    liveUiBadge.className = "live-ui-badge active";
    liveUiSetup.classList.add("hidden");
    liveUiActive.classList.remove("hidden");
    liveUiActiveSession.textContent = pairing.sessionLabel || "New chat";
    liveUiActiveProject.textContent =
      (pairing.projectLabel || pairing.projectSlug || "Clay project") +
      " · messages stay pinned here until Exit";
    setLiveUiStatus("");
    return;
  }

  liveUiActive.classList.add("hidden");
  liveUiSetup.classList.remove("hidden");
  var controls = state.controls || [];
  var activeIsClay = false;
  for (var i = 0; i < controls.length; i++) {
    if (activeTab && Number(controls[i].controlTabId) === Number(activeTab.id)) {
      activeIsClay = true;
      break;
    }
  }
  renderLiveUiOptions(controls);

  if (activeIsClay) {
    liveUiBadge.textContent = "Connected";
    liveUiBadge.className = "live-ui-badge connected";
    liveUiSessionSelect.disabled = true;
    liveUiStartBtn.disabled = true;
    liveUiConnectBtn.classList.add("hidden");
    liveUiHint.textContent =
      "Clay is connected. Open the web app tab, then click the extension again.";
  } else if (!controls.length) {
    liveUiBadge.textContent = "Needs Clay";
    liveUiBadge.className = "live-ui-badge";
    liveUiSessionSelect.disabled = true;
    liveUiStartBtn.disabled = true;
    liveUiConnectBtn.classList.remove("hidden");
    liveUiHint.textContent =
      "On this laptop, open Clay in a tab and click “Connect this tab as Clay” once.";
  } else {
    liveUiBadge.textContent = controls.length + " Clay tab" +
      (controls.length === 1 ? "" : "s");
    liveUiBadge.className = "live-ui-badge connected";
    liveUiSessionSelect.disabled = liveUiOptions.length === 0;
    liveUiStartBtn.disabled = !activeTab || liveUiOptions.length === 0;
    liveUiConnectBtn.classList.add("hidden");
    liveUiHint.textContent = liveUiOptions.length
      ? "Clay opens the selected chat and keeps this web app tab pinned to it."
      : "The connected Clay project has no available chats.";
  }

  var pickerStatus = state.status;
  if (pickerStatus && pickerStatus.state === "error") {
    setLiveUiStatus(pickerStatus.error || "Live UI could not start.", "error");
  } else if (pickerStatus && (pickerStatus.state === "requesting" ||
      pickerStatus.state === "pairing")) {
    setLiveUiStatus("Connecting the tab to Clay…");
  }
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

liveUiStartBtn.addEventListener("click", function () {
  var selected = liveUiOptions[Number(liveUiSessionSelect.value)];
  if (!selected) return;
  liveUiStartBtn.disabled = true;
  setLiveUiStatus("Connecting the tab to Clay…");
  chrome.runtime.sendMessage({
    type: "live_ui_picker_pair",
    controlTabId: selected.controlTabId,
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
    setLiveUiStatus("Connected. Reading Clay sessions…", "success");
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
