(function () {
  if (globalThis.__clayLiveUiTargetInstalled) return;
  globalThis.__clayLiveUiTargetInstalled = true;

  var context = globalThis.ClayLiveUiTargetContext;
  var state = {
    pairingId: null,
    host: null,
    documentGeneration: String(Date.now()),
    sequence: 0,
    selecting: false,
    selected: null,
    selectedPacket: null,
    hovered: null,
    connected: false,
    submitting: false,
    pendingSubmission: null,
    pendingSelection: null,
    connectionTimer: null,
    reportManager: null,
    mutationObserver: null,
    refreshFrame: null,
    composeErrorMessage: "",
    acceptedSequence: 0,
    projectLabel: "Clay project",
    sessionLabel: "New chat",
  };

  function nextMessageId(prefix) {
    return prefix + "-" + Date.now() + "-" + (++state.sequence);
  }

  function sendEvent(event, payload, clientMessageId, callback) {
    if (!state.pairingId) {
      if (callback) callback({ ok: false, error: "Live UI is disconnected." });
      return;
    }
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

  function positionSelection(element, selected) {
    if (!state.selectionOutline || !element) return;
    var rect = element.getBoundingClientRect();
    state.selectionOutline.style.display = "block";
    state.selectionOutline.style.transform =
      "translate(" + rect.left + "px," + rect.top + "px)";
    state.selectionOutline.style.width = rect.width + "px";
    state.selectionOutline.style.height = rect.height + "px";
    state.selectionOutline.style.borderColor = selected ? "#8fe388" : "#55a7ff";
  }

  function componentTitle(packet) {
    if (packet && packet.component && packet.component.name) return packet.component.name;
    return String(packet && (packet.accessibleName || packet.text || packet.tag) ||
      "Selected element").replace(/\s+/g, " ").trim().slice(0, 160);
  }

  function clearSelection(notify) {
    state.selected = null;
    state.selectedPacket = null;
    state.hovered = null;
    if (state.selectionOutline) state.selectionOutline.style.display = "none";
    if (notify) sendEvent("selection.clear", null, nextMessageId("selection"));
  }

  function stopSelecting() {
    state.selecting = false;
    state.hovered = null;
    if (state.selectionShield) state.selectionShield.hidden = true;
    if (state.selected) positionSelection(state.selected, true);
    else if (state.selectionOutline) state.selectionOutline.style.display = "none";
  }

  function startSelecting() {
    if (!state.connected || !state.selectionShield) return false;
    state.selecting = true;
    state.hovered = null;
    state.selectionShield.hidden = false;
    return true;
  }

  function elementUnderShield(event) {
    state.selectionShield.style.pointerEvents = "none";
    var element = document.elementFromPoint(event.clientX, event.clientY);
    state.selectionShield.style.pointerEvents = "";
    if (!element || element === state.host) return null;
    return element;
  }

  function handleShieldMove(event) {
    if (!state.selecting) return;
    var element = elementUnderShield(event);
    if (!element) return;
    state.hovered = element;
    positionSelection(element, false);
  }

  function publishSelection(element, packet) {
    if (state.selected !== element) return;
    state.selectedPacket = packet;
    positionSelection(element, true);
    sendEvent("selection.update", packet, nextMessageId("selection"));
  }

  function inspectSelection(element, packet) {
    sendEvent("component.inspect", { selectors: packet.selectors },
      nextMessageId("component"), function (response) {
        if (response && response.ok && response.component) packet.component = response.component;
        publishSelection(element, packet);
      });
  }

  function handleShieldClick(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!state.selecting) return;
    var element = elementUnderShield(event) || state.hovered;
    if (!element) return;
    state.selected = element;
    var packet = context.selectionPacket(element, state.documentGeneration);
    state.selectedPacket = packet;
    stopSelecting();
    positionSelection(element, true);
    inspectSelection(element, packet);
  }

  function restoreSelection(packet, notify) {
    var element = context.resolveElement(packet);
    if (!element) return false;
    state.selected = element;
    state.selectedPacket = Object.assign(
      context.selectionPacket(element, state.documentGeneration), {
        component: packet.component || null,
      });
    positionSelection(element, true);
    if (notify) sendEvent("selection.update", state.selectedPacket,
      nextMessageId("selection"));
    return true;
  }

  function scheduleRefresh() {
    if (state.refreshFrame) return;
    state.refreshFrame = requestAnimationFrame(function () {
      state.refreshFrame = null;
      if (state.selectedPacket && (!state.selected || !state.selected.isConnected)) {
        restoreSelection(state.selectedPacket, true);
      } else if (state.selected) {
        positionSelection(state.selected, true);
      }
      if (state.reportManager) state.reportManager.refreshHighlights();
    });
  }

  function setComposeError(message) {
    state.composeErrorMessage = String(message || "").slice(0, 500);
  }

  function setSubmitting(submitting) {
    state.submitting = submitting;
  }

  function setConnected(connected) {
    if (state.connectionTimer) {
      clearTimeout(state.connectionTimer);
      state.connectionTimer = null;
    }
    state.connected = connected;
  }

  function setConnectionError(message) {
    state.connected = false;
    setComposeError(message || "Live UI is disconnected.");
    setSubmitting(false);
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
    var host = state.host;
    if (!host) return callback("Live UI is disconnected.");
    var generation = state.documentGeneration;
    var viewport = {
      width: innerWidth,
      height: innerHeight,
      scrollX: scrollX,
      scrollY: scrollY,
    };
    host.style.visibility = "hidden";
    requestAnimationFrame(function () {
      if (!host.isConnected) return callback("Live UI is disconnected.");
      sendEvent("evidence.capture", {
        documentGeneration: generation,
        viewport: viewport,
        masks: context.screenshotMasks(),
      }, nextMessageId("evidence"), function (response) {
        host.style.visibility = "";
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

  function submitReport(text, reportId, callback) {
    var reportText = String(text || "").trim().slice(0, 12000);
    if (!reportText || state.submitting || !state.connected) {
      callback({ ok: false, error: state.connected ?
        "Describe the issue or change first." : "Live UI is disconnected." });
      return;
    }
    if (reportId) {
      if (!state.reportManager.get(reportId)) {
        callback({ ok: false, error: "That worker change is no longer available." });
        return;
      }
      state.reportManager.focus(reportId);
    }
    setComposeError("");
    setSubmitting(true);
    captureEvidence(function (error, evidence) {
      if (error) {
        setComposeError(error);
        setSubmitting(false);
        callback({ ok: false, error: error });
        return;
      }
      var clientMessageId = nextMessageId("report");
      var focusedReport = state.reportManager && state.reportManager.focused();
      state.pendingSubmission = {
        clientMessageId: clientMessageId,
        reportId: focusedReport ? focusedReport.reportId : null,
      };
      sendEvent("report.submit", Object.assign({
        text: reportText,
        screenshot: evidence.screenshot,
        diagnostics: evidence.diagnostics,
      }, focusedReport ? { reportId: focusedReport.reportId } : {}),
      clientMessageId, function (response) {
        if (response && response.ok) {
          callback({ ok: true });
          return;
        }
        state.pendingSubmission = null;
        var message = response && response.error ?
          response.error : "Clay is disconnected. The report was not sent.";
        setConnectionError(message);
        callback({ ok: false, error: message });
      });
    });
  }

  function focusReport(report) {
    if (report && report.locator) restoreSelection(report.locator, true);
  }

  function approveReport(report, callback) {
    if (!report || state.submitting || !state.connected) {
      callback({ ok: false, error: "That worker change cannot be approved now." });
      return;
    }
    setComposeError("");
    sendEvent("report.approve", { reportId: report.reportId },
      nextMessageId("approve"), function (response) {
        if (!response || response.ok === false) {
          var message = response && response.error ?
            response.error : "Clay could not approve this worker change.";
          setComposeError(message);
          callback({ ok: false, error: message });
          return;
        }
        callback({ ok: true });
      });
  }

  function handleReportEvent(envelope) {
    var payload = envelope.payload || {};
    if (envelope.event === "reports.snapshot") {
      state.reportManager.replace(payload.reports);
      return;
    }
    if ((envelope.event === "report.accepted" ||
        envelope.event === "report.status") && payload.reportId) {
      state.reportManager.upsert(payload);
    }
    if (envelope.event === "report.removed") state.reportManager.remove(payload.reportId);
    if (envelope.event === "report.accepted" && state.pendingSubmission) {
      state.pendingSubmission = null;
      state.acceptedSequence++;
      clearSelection(true);
      state.reportManager.focus(null);
      setSubmitting(false);
      setComposeError("");
    }
  }

  function canvasSnapshot() {
    return globalThis.ClayLiveUiTargetSnapshot.build(state, componentTitle);
  }

  function handleDevtoolsCommand(message, sendResponse) {
    if (message.pairingId !== state.pairingId || !state.reportManager) {
      sendResponse({ ok: false, error: "Live UI is not active on this page." });
      return false;
    }
    var payload = message.payload || {};
    if (message.action === "snapshot") {
      sendResponse(canvasSnapshot());
      return false;
    }
    if (message.action === "selection.pick") {
      if (state.selecting) stopSelecting();
      else if (!startSelecting()) {
        sendResponse({ ok: false, error: "Live UI is disconnected." });
        return false;
      }
      sendResponse(canvasSnapshot());
      return false;
    }
    if (message.action === "selection.clear") {
      stopSelecting();
      clearSelection(true);
      sendResponse(canvasSnapshot());
      return false;
    }
    if (message.action === "report.focus") {
      state.reportManager.focus(payload.reportId);
      sendResponse(canvasSnapshot());
      return false;
    }
    if (message.action === "report.submit") {
      submitReport(payload.text, payload.reportId, sendResponse);
      return true;
    }
    if (message.action === "report.approve") {
      approveReport(state.reportManager.get(payload.reportId), sendResponse);
      return true;
    }
    sendResponse({ ok: false, error: "Unsupported Live UI action." });
    return false;
  }

  function createCanvas() {
    if (state.host && state.host.isConnected) return;
    var ui = globalThis.ClayLiveUiTargetUi.create({
      documentGeneration: state.documentGeneration,
    });
    Object.assign(state, ui);
    state.reportManager = globalThis.ClayLiveUiTargetReports.create({
      highlightLayer: state.highlightLayer,
      onFocus: focusReport,
      resolveElement: context.resolveElement,
    });
    state.selectionShield.addEventListener("pointermove", handleShieldMove);
    state.selectionShield.addEventListener("click", handleShieldClick);
    state.mutationObserver = new MutationObserver(scheduleRefresh);
    state.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    var initialHmr = document.documentElement.getAttribute("data-clay-live-ui-hmr");
    if (initialHmr) state.reportManager.handleHmr(initialHmr, { engine: "vite" });
  }

  function destroy() {
    if (state.connectionTimer) clearTimeout(state.connectionTimer);
    if (state.refreshFrame) cancelAnimationFrame(state.refreshFrame);
    if (state.mutationObserver) state.mutationObserver.disconnect();
    stopSelecting();
    clearSelection(false);
    if (state.reportManager) state.reportManager.clear();
    if (state.host) state.host.remove();
    Object.assign(state, {
      pairingId: null,
      host: null,
      connected: false,
      submitting: false,
      pendingSubmission: null,
      connectionTimer: null,
      reportManager: null,
      mutationObserver: null,
      refreshFrame: null,
      composeErrorMessage: "",
      acceptedSequence: 0,
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.selecting) {
      event.preventDefault();
      stopSelecting();
    }
  }, true);
  window.addEventListener("scroll", scheduleRefresh, true);
  window.addEventListener("resize", scheduleRefresh);
  window.addEventListener("message", function (event) {
    if (event.source !== window || !event.data ||
        event.data.source !== "clay-live-ui-hmr" || !state.reportManager) return;
    state.reportManager.handleHmr(event.data.status, event.data.payload || {});
    scheduleRefresh();
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "live_ui_devtools_command") {
      return handleDevtoolsCommand(message, sendResponse);
    }
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
      createCanvas();
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
    if (message.type === "live_ui_destroy" &&
        message.pairingId === state.pairingId) {
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
          restoreSelection(pending, true);
        }
      }
      if (message.envelope.type === "live_ui_relay") {
        handleReportEvent(message.envelope);
      }
      if (message.envelope.type === "live_ui_state" &&
          message.envelope.state === "error") {
        var errorText = message.envelope.error ||
          "Live UI could not complete the request.";
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
