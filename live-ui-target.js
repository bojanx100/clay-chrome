(function () {
  if (globalThis.__clayLiveUiTargetInstalled) return;
  globalThis.__clayLiveUiTargetInstalled = true;
  var state = {
    pairingId: null,
    host: null,
    shell: null,
    label: null,
    selectedMark: null,
    selectionSummary: null,
    selectionName: null,
    selectionTag: null,
    emptyHint: null,
    clearButton: null,
    selectButton: null,
    chatButton: null,
    captureButton: null,
    attachment: null,
    connection: null,
    drawer: null,
    transcript: null,
    input: null,
    sendButton: null,
    selecting: false,
    hovered: null,
    selected: null,
    outline: null,
    documentGeneration: String(Date.now()),
    sequence: 0,
    pendingSelection: null,
    activeOperationId: null,
    assistantBubble: null,
    screenshot: null,
    connected: false,
    connectionTimer: null,
    clampPosition: null,
    projectLabel: "Clay project",
    sessionLabel: "New chat",
  };
  function nextMessageId() {
    return "selection-" + Date.now() + "-" + (++state.sequence);
  }
  function nextChatId() {
    return "chat-" + Date.now() + "-" + (++state.sequence);
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
    if (!element) {
      setSelectionLabel("Selection lost — pick it again", null, false);
      return;
    }
    state.selected = element;
    var restored = selectionPacket(element);
    setSelectionLabel(restored.accessibleName || restored.text || restored.tag,
      restored.tag);
    positionOutline(element, true);
    sendEvent("selection.update", restored, nextMessageId());
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
  function stopSelecting() {
    state.selecting = false;
    state.hovered = null;
    if (state.selectButton) {
      state.selectButton.textContent = state.selected ? "Pick another" : "Pick element";
      state.selectButton.setAttribute("aria-pressed", "false");
    }
    if (state.selected) positionOutline(state.selected, true);
    else if (state.outline) state.outline.style.display = "none";
  }
  function setSelectionLabel(value, tag, selectedOverride) {
    var selected = selectedOverride === undefined ? !!state.selected : selectedOverride;
    var name = String(value || "Selected element").replace(/\s+/g, " ").trim().slice(0, 160);
    if (state.label) {
      state.label.textContent = selected ? "Selected: " + name : (value || "No element selected");
    }
    if (state.selectedMark) state.selectedMark.hidden = !selected;
    if (state.selectionSummary) state.selectionSummary.hidden = !selected;
    if (state.selectionName) state.selectionName.textContent = selected ? name : "";
    if (state.selectionTag) state.selectionTag.textContent = selected && tag ? "<" + tag + ">" : "";
    if (state.clearButton) state.clearButton.hidden = !selected;
    if (state.selectButton && !state.selecting) {
      state.selectButton.textContent = selected ? "Pick another" : "Pick element";
    }
    if (state.emptyHint) {
      state.emptyHint.textContent = selected ?
        "Selected “" + name + "”. Describe what Clay should change or fix." :
        "Select an element, or describe a page-wide change.";
    }
  }
  function clearSelection(notify) {
    state.selected = null;
    state.hovered = null;
    if (state.outline) state.outline.style.display = "none";
    setSelectionLabel(null);
    if (notify) sendEvent("selection.clear", null, nextMessageId());
  }
  function startSelecting() {
    state.selecting = true;
    state.selectButton.textContent = "Cancel";
    state.selectButton.setAttribute("aria-pressed", "true");
  }
  function onPointerMove(event) {
    if (!state.selecting || !state.host) return;
    if (event.composedPath().indexOf(state.host) !== -1) {
      state.hovered = null;
      if (state.selected) positionOutline(state.selected, true);
      else if (state.outline) state.outline.style.display = "none";
      return;
    }
    var element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element || element === state.host) return;
    state.hovered = element;
    positionOutline(element, false);
  }
  function onPointerDown(event) {
    if (state.host && event.composedPath().indexOf(state.host) !== -1) {
      state.hovered = null;
      return;
    }
    if (!state.selecting || !state.hovered) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    state.selected = state.hovered;
    var packet = selectionPacket(state.selected);
    setSelectionLabel(packet.accessibleName || packet.text || packet.tag, packet.tag);
    positionOutline(state.selected, true);
    stopSelecting();
    sendEvent("selection.update", packet, nextMessageId());
  }
  function appendBubble(kind, text) {
    var empty = state.transcript.querySelector(".empty");
    if (empty) empty.remove();
    var bubble = document.createElement("div");
    bubble.className = "bubble " + kind;
    bubble.textContent = text;
    state.transcript.appendChild(bubble);
    state.transcript.scrollTop = state.transcript.scrollHeight;
    return bubble;
  }

  function appendStatus(text) {
    var status = document.createElement("div");
    status.className = "status";
    status.textContent = text;
    state.transcript.appendChild(status);
    state.transcript.scrollTop = state.transcript.scrollHeight;
  }

  function setBusy(busy) {
    if (!state.sendButton || !state.input) return;
    state.sendButton.disabled = busy || !state.connected;
    state.input.disabled = busy || !state.connected;
    if (state.captureButton) state.captureButton.disabled = busy || !state.connected;
    state.sendButton.textContent = busy ? "Working…" : "Send";
  }

  function setConnected(connected) {
    if (state.connectionTimer) {
      clearTimeout(state.connectionTimer);
      state.connectionTimer = null;
    }
    state.connected = connected;
    if (state.connection) {
      state.connection.textContent = connected ?
        "Connected · messages go to this chat" : "Disconnected from Clay";
      state.connection.classList.toggle("offline", !connected);
    }
    setBusy(!!state.activeOperationId);
  }

  function setConnectionError(message) {
    if (state.connectionTimer) {
      clearTimeout(state.connectionTimer);
      state.connectionTimer = null;
    }
    state.connected = false;
    if (state.connection) {
      state.connection.textContent = message || "Disconnected from Clay";
      state.connection.classList.add("offline");
    }
    setBusy(!!state.activeOperationId);
  }

  function waitForConnection() {
    if (state.connectionTimer) clearTimeout(state.connectionTimer);
    state.connectionTimer = setTimeout(function () {
      if (!state.connected) {
        setConnectionError("Clay did not confirm the connection · reopen Live UI");
        appendStatus("The Live UI connection timed out. Exit and start it again.");
      }
    }, 8000);
  }

  function renderAttachment() {
    if (!state.attachment) return;
    state.attachment.classList.toggle("ready", !!state.screenshot);
  }

  function captureScreenshot() {
    if (!state.connected || !state.captureButton) return;
    var generation = state.documentGeneration;
    var viewport = {
      width: innerWidth,
      height: innerHeight,
      scrollX: scrollX,
      scrollY: scrollY,
    };
    state.captureButton.disabled = true;
    state.captureButton.textContent = "Capturing…";
    state.host.style.visibility = "hidden";
    requestAnimationFrame(function () {
      sendEvent("screenshot.capture", {
        documentGeneration: generation,
        viewport: viewport,
        masks: globalThis.ClayLiveUiTargetContext.screenshotMasks(),
      }, nextMessageId(), function (response) {
        if (state.host) state.host.style.visibility = "";
        state.captureButton.textContent = "Add screenshot";
        setBusy(!!state.activeOperationId);
        var unchanged = generation === state.documentGeneration &&
          viewport.width === innerWidth && viewport.height === innerHeight &&
          viewport.scrollX === scrollX && viewport.scrollY === scrollY;
        if (!response || !response.ok || !response.screenshot || !unchanged) {
          appendStatus(response && response.error ?
            response.error : "The page moved during capture. Try again.");
          return;
        }
        state.screenshot = response.screenshot;
        renderAttachment();
      });
    });
  }

  function sendChat() {
    var text = state.input.value.trim();
    if (!text || state.activeOperationId || !state.connected) return;
    var screenshot = state.screenshot;
    appendBubble("user", text);
    state.input.value = "";
    state.screenshot = null;
    renderAttachment();
    state.assistantBubble = null;
    state.activeOperationId = "pending";
    setBusy(true);
    sendEvent("chat.message", {
      text: text,
      screenshot: screenshot,
    }, nextChatId(), function (response) {
      if (response && response.ok) return;
      state.activeOperationId = null;
      state.screenshot = screenshot;
      renderAttachment();
      appendStatus("Clay is disconnected. Your message was not sent.");
      setConnected(false);
    });
  }

  function handleChatEvent(envelope) {
    var payload = envelope.payload || {};
    if (envelope.event === "chat.accepted") {
      state.activeOperationId = payload.operationId || state.activeOperationId;
      return;
    }
    if (envelope.event !== "chat.stream") return;
    if (state.activeOperationId && payload.operationId !== state.activeOperationId) return;
    state.activeOperationId = payload.operationId || state.activeOperationId;
    if (payload.type === "delta") {
      if (!state.assistantBubble) state.assistantBubble = appendBubble("assistant", "");
      state.assistantBubble.textContent += payload.text || "";
      state.transcript.scrollTop = state.transcript.scrollHeight;
    } else if (payload.type === "tool_start" || payload.type === "tool_executing") {
      appendStatus((payload.tool || "Working") + "…");
    } else if (payload.type === "needs_input") {
      appendStatus(payload.text || "Input required in Clay.");
    } else if (payload.type === "error") {
      appendStatus(payload.text || "The turn failed.");
      state.activeOperationId = null;
      state.assistantBubble = null;
      setBusy(false);
    } else if (payload.type === "done") {
      appendStatus(payload.code ? "Turn ended with an error." : "Ready for your review.");
      state.activeOperationId = null;
      state.assistantBubble = null;
      setBusy(false);
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
    state.clearButton.addEventListener("click", function () { clearSelection(true); });
    state.chatButton.addEventListener("click", function () {
      state.drawer.classList.toggle("open");
      state.chatButton.setAttribute("aria-expanded",
        state.drawer.classList.contains("open") ? "true" : "false");
      requestAnimationFrame(state.clampPosition);
      if (state.drawer.classList.contains("open")) state.input.focus();
    });
    state.captureButton.addEventListener("click", captureScreenshot);
    state.removeShotButton.addEventListener("click", function () {
      state.screenshot = null;
      renderAttachment();
    });
    state.sendButton.addEventListener("click", sendChat);
    state.input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChat();
      }
    });
    state.exitButton.addEventListener("click", function () {
      sendEvent("target.closed", { reason: "user_exit" });
      destroy();
    });
    setBusy(false);
  }

  function destroy() {
    if (state.connectionTimer) clearTimeout(state.connectionTimer);
    stopSelecting();
    clearSelection(false);
    if (state.host) state.host.remove();
    Object.assign(state, {
      host: null, shell: null, outline: null, label: null, selectedMark: null,
      selectionSummary: null, selectionName: null, selectionTag: null,
      emptyHint: null, clearButton: null,
      selectButton: null, chatButton: null, captureButton: null,
      attachment: null, connection: null, drawer: null, transcript: null,
      input: null, sendButton: null, activeOperationId: null, screenshot: null,
      removeShotButton: null, exitButton: null, clampPosition: null,
      connected: false, connectionTimer: null, pairingId: null,
    });
  }

  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && state.selecting) {
      event.preventDefault();
      stopSelecting();
    } else if (state.selecting && event.key === "Enter" &&
        document.activeElement && document.activeElement !== document.body &&
        document.activeElement !== state.host) {
      state.hovered = document.activeElement;
      onPointerDown(event);
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
        handleChatEvent(message.envelope);
      }
      if (message.envelope.type === "live_ui_state" &&
          message.envelope.state === "error") {
        appendStatus(message.envelope.error || "Live UI could not complete the request.");
        setConnectionError(message.envelope.error || "Live UI could not connect");
        state.activeOperationId = null;
        state.assistantBubble = null;
        setBusy(false);
      }
      sendResponse({ ok: true });
    }
  });
})();
