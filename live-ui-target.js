(function () {
  if (globalThis.__clayLiveUiTargetInstalled) return;
  globalThis.__clayLiveUiTargetInstalled = true;

  var state = {
    pairingId: null,
    host: null,
    documentGeneration: String(Date.now()),
    sequence: 0,
    selecting: false,
    selected: null,
    hovered: null,
    connected: false,
    submitting: false,
    pendingSubmission: null,
    pendingSelection: null,
    connectionTimer: null,
    reports: {},
    projectLabel: "Clay project",
    sessionLabel: "New chat",
  };
  function nextMessageId(prefix) {
    return prefix + "-" + Date.now() + "-" + (++state.sequence);
  }
  function sendEvent(event, payload, clientMessageId, callback) {
    if (!state.pairingId) return;
    chrome.runtime.sendMessage({
      type: "live_ui_target_event",
      protocolVersion: 1,
      pairingId: state.pairingId,
      clientMessageId: clientMessageId || null,
      event: event,
      payload: payload || null,
    }, function (response) {
      var error = chrome.runtime.lastError;
      if (callback) callback(error ? { ok: false, error: error.message } : response);
    });
  }
  function selectionPacket(element) {
    return globalThis.ClayLiveUiTargetContext.selectionPacket(
      element, state.documentGeneration);
  }
  function positionOutline(element, selected) {
    if (!state.outline || !element) return;
    var rect = element.getBoundingClientRect();
    state.outline.style.display = "block";
    state.outline.style.transform = "translate(" + rect.x + "px," + rect.y + "px)";
    state.outline.style.width = rect.width + "px";
    state.outline.style.height = rect.height + "px";
    state.outline.style.borderColor = selected ? "#d29a52" : "#4dae84";
  }
  function setSelectionSummary(packet) {
    var selected = !!state.selected;
    if (state.selectionSummary) state.selectionSummary.hidden = !selected;
    if (state.selectionName) {
      state.selectionName.textContent = selected ?
        String(packet.accessibleName || packet.text || packet.tag || "Selected element")
          .replace(/\s+/g, " ").trim().slice(0, 160) : "";
    }
    if (state.selectionTag) {
      state.selectionTag.textContent = selected && packet.tag ? "<" + packet.tag + ">" : "";
    }
    if (state.selectButton && !state.selecting) {
      state.selectButton.textContent = selected ? "Pick another" : "Pick element";
    }
  }
  function clearSelection(notify) {
    state.selected = null;
    state.hovered = null;
    if (state.outline) state.outline.style.display = "none";
    setSelectionSummary({});
    if (notify) sendEvent("selection.clear", null, nextMessageId("selection"));
  }
  function stopSelecting() {
    state.selecting = false;
    state.hovered = null;
    if (state.selectionShield) state.selectionShield.hidden = true;
    if (state.selectButton) {
      state.selectButton.textContent = state.selected ? "Pick another" : "Pick element";
      state.selectButton.setAttribute("aria-pressed", "false");
    }
    if (state.selected) positionOutline(state.selected, true);
    else if (state.outline) state.outline.style.display = "none";
  }

  function startSelecting() {
    state.selecting = true;
    state.hovered = null;
    state.selectionShield.hidden = false;
    state.selectButton.textContent = "Cancel";
    state.selectButton.setAttribute("aria-pressed", "true");
  }

  function elementUnderShield(event) {
    state.selectionShield.style.pointerEvents = "none";
    var element = document.elementFromPoint(event.clientX, event.clientY);
    state.selectionShield.style.pointerEvents = "";
    if (!element || element === state.host ||
        (state.host && event.composedPath().indexOf(state.host) === -1 &&
         state.host.contains && state.host.contains(element))) return null;
    return element;
  }

  function handleShieldMove(event) {
    if (!state.selecting) return;
    var element = elementUnderShield(event);
    if (!element) return;
    state.hovered = element;
    positionOutline(element, false);
  }

  function handleShieldClick(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!state.selecting) return;
    var element = elementUnderShield(event) || state.hovered;
    if (!element) return;
    state.selected = element;
    var packet = selectionPacket(element);
    setSelectionSummary(packet);
    positionOutline(element, true);
    stopSelecting();
    sendEvent("selection.update", packet, nextMessageId("selection"));
    openPanel();
    state.input.focus();
  }

  function restoreSelection(packet) {
    if (!packet || !Array.isArray(packet.selectors)) return;
    var element = null;
    for (var i = 0; i < packet.selectors.length; i++) {
      try {
        element = document.querySelector(packet.selectors[i]);
      } catch (e) {
        element = null;
      }
      if (element) break;
    }
    if (!element) return;
    state.selected = element;
    var restored = selectionPacket(element);
    setSelectionSummary(restored);
    positionOutline(element, true);
    sendEvent("selection.update", restored, nextMessageId("selection"));
  }

  function reportIcon(status) {
    if (status === "completed") return "✓";
    if (status === "needs_input") return "?";
    if (status === "failed") return "!";
    return "●";
  }

  function renderReports() {
    if (!state.reportList) return;
    var reports = Object.keys(state.reports).map(function (id) {
      return state.reports[id];
    });
    state.reportCount.textContent = String(reports.length);
    state.reportList.innerHTML = "";
    if (!reports.length) {
      var empty = document.createElement("div");
      empty.className = "reports-empty";
      empty.textContent = "No reports yet.";
      state.reportList.appendChild(empty);
    }
    var counts = { working: 0, needs_input: 0, completed: 0, failed: 0 };
    for (var i = 0; i < reports.length; i++) {
      var report = reports[i];
      var status = counts[report.status] === undefined ? "working" : report.status;
      counts[status]++;
      var row = document.createElement("div");
      row.className = "report " + status;
      var icon = document.createElement("span");
      icon.className = "report-icon";
      icon.textContent = reportIcon(status);
      var title = document.createElement("span");
      title.className = "report-title";
      title.textContent = report.title || "Live UI report";
      var message = document.createElement("span");
      message.className = "report-message";
      message.textContent = report.message || "Being worked on.";
      row.appendChild(icon);
      row.appendChild(title);
      row.appendChild(message);
      state.reportList.appendChild(row);
    }
    var parts = [];
    if (counts.working) parts.push(counts.working + " working");
    if (counts.needs_input) parts.push(counts.needs_input + " need input");
    if (counts.failed) parts.push(counts.failed + " failed");
    if (counts.completed) parts.push(counts.completed + " done");
    var aggregate = counts.needs_input ? "needs_input" :
      (counts.failed ? "failed" : (counts.working ? "working" :
        (counts.completed ? "completed" : "")));
    state.aggregateDot.className = "aggregate-dot" + (aggregate ? " " + aggregate : "");
    state.aggregateLabel.textContent = parts.length ? parts.join(" · ") :
      (state.connected ? "Ready" : "Disconnected");
  }

  function setComposeError(message) {
    if (!state.composeError) return;
    state.composeError.textContent = message || "";
    state.composeError.hidden = !message;
  }

  function setSubmitting(submitting, label) {
    state.submitting = submitting;
    if (!state.submitButton || !state.input) return;
    state.submitButton.disabled = submitting || !state.connected;
    state.input.disabled = submitting || !state.connected;
    state.submitButton.textContent = submitting ? (label || "Reporting…") : "Report";
  }

  function setConnected(connected) {
    if (state.connectionTimer) {
      clearTimeout(state.connectionTimer);
      state.connectionTimer = null;
    }
    state.connected = connected;
    if (state.connection) {
      state.connection.textContent = connected ?
        "Connected · each report gets its own worker" : "Disconnected from Clay";
      state.connection.classList.toggle("offline", !connected);
    }
    setSubmitting(state.submitting);
    renderReports();
  }
  function setConnectionError(message) {
    state.connected = false;
    if (state.connection) {
      state.connection.textContent = message || "Disconnected from Clay";
      state.connection.classList.add("offline");
    }
    setComposeError(message || "Live UI is disconnected.");
    setSubmitting(false);
    renderReports();
  }

  function waitForConnection() {
    if (state.connectionTimer) clearTimeout(state.connectionTimer);
    state.connectionTimer = setTimeout(function () {
      if (!state.connected) {
        setConnectionError("Clay did not confirm the connection · reopen Live UI");
      }
    }, 8000);
  }

  function captureEvidence(callback) {
    var generation = state.documentGeneration;
    var viewport = {
      width: innerWidth,
      height: innerHeight,
      scrollX: scrollX,
      scrollY: scrollY,
    };
    state.host.style.visibility = "hidden";
    requestAnimationFrame(function () {
      sendEvent("evidence.capture", {
        documentGeneration: generation,
        viewport: viewport,
        masks: globalThis.ClayLiveUiTargetContext.screenshotMasks(),
      }, nextMessageId("evidence"), function (response) {
        if (state.host) state.host.style.visibility = "";
        var unchanged = generation === state.documentGeneration &&
          viewport.width === innerWidth && viewport.height === innerHeight &&
          viewport.scrollX === scrollX && viewport.scrollY === scrollY;
        if (!response || !response.ok || !response.screenshot || !unchanged) {
          callback(response && response.error ?
            response.error : "The page moved during capture. Try the report again.");
          return;
        }
        callback(null, {
          screenshot: response.screenshot,
          diagnostics: response.diagnostics || { console: [], network: [] },
        });
      });
    });
  }

  function submitReport() {
    var text = state.input.value.trim();
    if (!text || state.submitting || !state.connected) return;
    setComposeError("");
    setSubmitting(true, "Capturing…");
    captureEvidence(function (error, evidence) {
      if (error) {
        setComposeError(error);
        setSubmitting(false);
        return;
      }
      var clientMessageId = nextMessageId("report");
      state.pendingSubmission = {
        clientMessageId: clientMessageId,
        text: text,
      };
      state.submitButton.textContent = "Sending…";
      sendEvent("report.submit", {
        text: text,
        screenshot: evidence.screenshot,
        diagnostics: evidence.diagnostics,
      }, clientMessageId, function (response) {
        if (response && response.ok) return;
        state.pendingSubmission = null;
        setComposeError(response && response.error ?
          response.error : "Clay is disconnected. The report was not sent.");
        setConnected(false);
      });
    });
  }

  function openPanel() {
    state.drawer.classList.add("open");
    state.panelButton.setAttribute("aria-expanded", "true");
    requestAnimationFrame(state.clampPosition);
  }

  function handleReportEvent(envelope) {
    var payload = envelope.payload || {};
    if (envelope.event === "reports.snapshot") {
      state.reports = {};
      var reports = Array.isArray(payload.reports) ? payload.reports : [];
      for (var i = 0; i < reports.length; i++) {
        if (reports[i] && reports[i].reportId) {
          state.reports[reports[i].reportId] = reports[i];
        }
      }
      renderReports();
      return;
    }
    if ((envelope.event === "report.accepted" ||
        envelope.event === "report.status") && payload.reportId) {
      state.reports[payload.reportId] = payload;
      renderReports();
    }
    if (envelope.event === "report.accepted" && state.pendingSubmission) {
      state.pendingSubmission = null;
      state.input.value = "";
      clearSelection(true);
      setSubmitting(false);
      setComposeError("");
    }
  }

  function createOverlay() {
    if (state.host && state.host.isConnected) return;
    var ui = globalThis.ClayLiveUiTargetUi.create({
      documentGeneration: state.documentGeneration,
      projectLabel: state.projectLabel,
      sessionLabel: state.sessionLabel,
    });
    Object.assign(state, ui);
    state.selectButton.addEventListener("click", function () {
      if (state.selecting) stopSelecting();
      else startSelecting();
    });
    state.selectionShield.addEventListener("pointermove", handleShieldMove);
    state.selectionShield.addEventListener("click", handleShieldClick);
    state.clearButton.addEventListener("click", function () { clearSelection(true); });
    state.panelButton.addEventListener("click", function () {
      state.drawer.classList.toggle("open");
      state.panelButton.setAttribute("aria-expanded",
        state.drawer.classList.contains("open") ? "true" : "false");
      requestAnimationFrame(state.clampPosition);
      if (state.drawer.classList.contains("open")) state.input.focus();
    });
    state.submitButton.addEventListener("click", submitReport);
    state.input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitReport();
      }
    });
    state.exitButton.addEventListener("click", function () {
      sendEvent("target.closed", { reason: "user_exit" });
      destroy();
    });
    setSubmitting(false);
    renderReports();
  }

  function destroy() {
    if (state.connectionTimer) clearTimeout(state.connectionTimer);
    stopSelecting();
    clearSelection(false);
    if (state.host) state.host.remove();
    Object.assign(state, {
      pairingId: null,
      host: null,
      shell: null,
      selectionShield: null,
      outline: null,
      selectionSummary: null,
      selectionName: null,
      selectionTag: null,
      clearButton: null,
      selectButton: null,
      panelButton: null,
      aggregateDot: null,
      aggregateLabel: null,
      reportList: null,
      reportCount: null,
      composeError: null,
      connection: null,
      drawer: null,
      input: null,
      submitButton: null,
      exitButton: null,
      clampPosition: null,
      connected: false,
      submitting: false,
      pendingSubmission: null,
      connectionTimer: null,
      reports: {},
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.selecting) {
      event.preventDefault();
      stopSelecting();
    }
  }, true);
  window.addEventListener("scroll", function () {
    if (state.selected) positionOutline(state.selected, true);
  }, true);
  window.addEventListener("resize", function () {
    if (state.selected) positionOutline(state.selected, true);
    if (state.clampPosition) state.clampPosition();
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "live_ui_init") {
      if (new URL(location.href).origin !== message.allowedOrigin) {
        sendResponse({ ok: false, error: "Target origin changed" });
        return;
      }
      if (state.pairingId && state.pairingId !== message.pairingId) destroy();
      state.pairingId = message.pairingId;
      state.projectLabel = message.projectLabel || "Clay project";
      state.sessionLabel = message.sessionLabel || "New chat";
      state.connected = false;
      createOverlay();
      waitForConnection();
      if (message.nonce) {
        sendEvent("target.prove", { nonce: message.nonce }, null, function (response) {
          if (!response || response.ok === false) {
            setConnectionError(response && response.error ?
              response.error : "The connected Clay tab is unavailable");
          }
        });
      }
      state.pendingSelection = message.selection || null;
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "live_ui_connection" &&
        message.pairingId === state.pairingId) {
      setConnected(message.state === "connected");
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "live_ui_destroy" && message.pairingId === state.pairingId) {
      destroy();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "live_ui_server_event" &&
        message.envelope && message.envelope.pairingId === state.pairingId) {
      if (message.envelope.type === "live_ui_state" &&
          message.envelope.state === "paired") {
        setConnected(true);
        if (state.pendingSelection) {
          var pending = state.pendingSelection;
          state.pendingSelection = null;
          restoreSelection(pending);
        }
      }
      if (message.envelope.type === "live_ui_relay") {
        handleReportEvent(message.envelope);
      }
      if (message.envelope.type === "live_ui_state" &&
          message.envelope.state === "error") {
        var errorText = message.envelope.error || "Live UI could not complete the request.";
        if (message.envelope.code === "LIVE_UI_EXTENSION_OFFLINE") {
          setConnectionError(errorText);
        } else {
          state.pendingSubmission = null;
          setComposeError(errorText);
          setSubmitting(false);
        }
      }
      sendResponse({ ok: true });
    }
  });
})();
