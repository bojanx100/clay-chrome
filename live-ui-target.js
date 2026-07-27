(function () {
  if (globalThis.__clayLiveUiTargetInstalled) return;
  globalThis.__clayLiveUiTargetInstalled = true;
  var state = {
    pairingId: null,
    host: null,
    label: null,
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
  function selectorCandidates(element) {
    var selectors = [];
    if (element.id) selectors.push("#" + CSS.escape(element.id));
    var testId = element.getAttribute("data-testid");
    if (testId) selectors.push('[data-testid="' + CSS.escape(testId) + '"]');
    var name = element.getAttribute("name");
    if (name) selectors.push(element.tagName.toLowerCase() + '[name="' + CSS.escape(name) + '"]');
    var path = [];
    var current = element;
    while (current && current.nodeType === 1 && current !== document.documentElement && path.length < 5) {
      var part = current.tagName.toLowerCase();
      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (child) {
          return child.tagName === current.tagName;
        });
        if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
      }
      path.unshift(part);
      current = parent;
    }
    if (path.length) selectors.push(path.join(" > "));
    return selectors.slice(0, 8);
  }
  function safeText(element) {
    var tag = element && element.tagName ? element.tagName.toLowerCase() : "";
    if (!element || tag === "input" || tag === "textarea" || tag === "select") return null;
    var text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 500) : null;
  }
  function selectionPacket(element) {
    var rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || null,
      text: safeText(element),
      accessibleName: (element.getAttribute("aria-label") || element.getAttribute("title") || "").slice(0, 300) || null,
      route: location.pathname + location.search + location.hash,
      documentGeneration: state.documentGeneration,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      selectors: selectorCandidates(element),
    };
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
      setSelectionLabel("Reselect required");
      if (state.clearButton) state.clearButton.hidden = false;
      return;
    }
    state.selected = element;
    var restored = selectionPacket(element);
    setSelectionLabel(restored.accessibleName || restored.text || restored.tag);
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
      state.selectButton.textContent = "Pick element";
      state.selectButton.setAttribute("aria-pressed", "false");
    }
    if (state.selected) positionOutline(state.selected, true);
  }
  function setSelectionLabel(value) {
    if (state.label) state.label.textContent = value || "No element selected";
    if (state.clearButton) state.clearButton.hidden = !state.selected;
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
    var element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element || element === state.host || state.host.contains(element)) return;
    state.hovered = element;
    positionOutline(element, false);
  }
  function onPointerDown(event) {
    if (!state.selecting || !state.hovered) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    state.selected = state.hovered;
    var packet = selectionPacket(state.selected);
    setSelectionLabel(packet.accessibleName || packet.text || packet.tag);
    positionOutline(state.selected, true);
    stopSelecting();
    sendEvent("selection.update", packet, nextMessageId());
  }
  function styles() {
    return [
      ":host{all:initial}",
      ".shell{position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(400px,calc(100vw - 32px));font:500 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f6f1e9}",
      ".bar{display:flex;align-items:center;gap:7px;padding:8px;background:#211e1b;border:1px solid #464039;border-radius:13px;box-shadow:0 12px 32px rgba(0,0,0,.28)}",
      "button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:44px;cursor:pointer;padding:9px 12px;border-radius:9px;background:#b87836;color:#fff}button:hover{background:#c78743}button:focus-visible,textarea:focus-visible{outline:2px solid #f1bd75;outline-offset:2px}",
      "button:disabled{cursor:default;opacity:.45}button[hidden]{display:none!important}.pick[aria-pressed=true]{background:#d29a52}",
      ".selection{min-width:0;display:flex;align-items:center;flex:1;padding-left:4px;color:#ddd4c9}.label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.clear{min-height:36px;padding:7px 9px;margin-left:2px;background:transparent;color:#bfb5aa}.clear:hover,.exit:hover{background:#37312c}",
      ".exit{background:transparent;color:#bfb5aa}.chat-toggle{background:#38322d}.chat-toggle:hover{background:#49413a}",
      ".drawer{display:none;margin-bottom:8px;overflow:hidden;background:#211e1b;border:1px solid #464039;border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.34)}",
      ".drawer.open{display:block}",
      ".head{padding:13px 14px;border-bottom:1px solid #3c3630}.title{font-size:14px;font-weight:750}.identity{margin-top:2px;color:#c6b9aa;font-size:12px}.connection{margin-top:5px;color:#9bc5a6;font-size:11px}.connection.offline{color:#e3a09a}",
      ".transcript{max-height:300px;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}",
      ".empty{color:#a99d90;padding:14px 4px}",
      ".bubble{max-width:88%;padding:9px 11px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}",
      ".user{align-self:flex-end;background:#a9682e}.assistant{align-self:flex-start;background:#38322d}.status{align-self:flex-start;color:#b7aa9c;font-size:12px}",
      ".attachment{display:none;align-items:center;gap:7px;margin:0 10px 8px;padding:8px 9px;border-radius:8px;background:#302b26;color:#d8cec2}.attachment.ready{display:flex}.attachment span{flex:1}.remove-shot{min-height:34px;padding:5px 8px;background:transparent;color:#c9bdae}.composer{display:flex;gap:8px;padding:10px;border-top:1px solid #3c3630}.compose-main{display:flex;flex:1;flex-direction:column;gap:7px}",
      "textarea{all:unset;min-height:44px;max-height:110px;overflow:auto;box-sizing:border-box;padding:10px;background:#302b26;border-radius:8px;color:#fff;font:500 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:pre-wrap}textarea::placeholder{color:#9b8f82}.capture{align-self:flex-start;min-height:36px;padding:7px 9px;background:transparent;color:#d2c6b8}.capture:hover{background:#3b342e}.send{align-self:flex-end}",
      ".outline{position:fixed;z-index:2147483646;left:0;top:0;display:none;box-sizing:border-box;border:2px solid #4dae84;pointer-events:none;border-radius:4px;background:rgba(77,174,132,.08)}",
    ].join("");
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
    state.connected = connected;
    if (state.connection) {
      state.connection.textContent = connected ?
        "Connected · messages go to this chat" : "Disconnected from Clay";
      state.connection.classList.toggle("offline", !connected);
    }
    setBusy(!!state.activeOperationId);
  }

  function screenshotMasks() {
    var selector = "input,textarea,select,[contenteditable]:not([contenteditable=false])," +
      "video,canvas,iframe,embed,object,[data-live-ui-never-capture]";
    var nodes = document.querySelectorAll(selector);
    var masks = [];
    for (var i = 0; i < nodes.length && masks.length < 256; i++) {
      var rect = nodes[i].getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 ||
          rect.bottom <= 0 || rect.right <= 0 ||
          rect.top >= innerHeight || rect.left >= innerWidth) continue;
      masks.push({
        x: Math.max(0, rect.left),
        y: Math.max(0, rect.top),
        width: Math.min(innerWidth, rect.right) - Math.max(0, rect.left),
        height: Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top),
      });
    }
    return masks;
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
        masks: screenshotMasks(),
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
    var host = document.createElement("clay-live-ui");
    host.setAttribute("data-clay-live-ui-overlay", "");
    host.setAttribute("data-clay-live-ui-generation", state.documentGeneration);
    var shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = "<style>" + styles() + "</style>" +
      '<div class="outline"></div><div class="shell">' +
      '<section class="drawer"><div class="head"><div class="title">Live UI</div>' +
      '<div class="identity"></div><div class="connection offline">Connecting to Clay…</div></div>' +
      '<div class="transcript" aria-live="polite"><div class="empty">' +
      'Pick an element, then describe the change or issue.</div></div>' +
      '<div class="attachment"><span>Masked screenshot attached</span>' +
      '<button type="button" class="remove-shot">Remove</button></div>' +
      '<div class="composer"><div class="compose-main">' +
      '<textarea rows="2" placeholder="Ask Clay to change or fix this…"></textarea>' +
      '<button type="button" class="capture" title="Sensitive controls, canvases, and frames are hidden">Add screenshot</button>' +
      '</div><button type="button" class="send">Send</button></div></section>' +
      '<div class="bar"><button type="button" class="pick" aria-pressed="false">Pick element</button>' +
      '<span class="selection"><span class="label">No element selected</span>' +
      '<button type="button" class="clear" hidden>Clear</button></span>' +
      '<button type="button" class="chat-toggle" aria-expanded="false">Chat</button>' +
      '<button type="button" class="exit">Exit</button></div></div>';
    function find(selector) { return shadow.querySelector(selector); }
    var outline = find(".outline");
    var drawer = find(".drawer"), transcript = find(".transcript");
    var input = find("textarea"), capture = find(".capture");
    var attachment = find(".attachment"), removeShot = find(".remove-shot");
    var send = find(".send"), select = find(".pick");
    var label = find(".label"), clear = find(".clear");
    var chat = find(".chat-toggle"), exit = find(".exit");
    find(".identity").textContent =
      "Sending to “" + state.sessionLabel + "” · " + state.projectLabel;
    input.setAttribute("aria-label", "Message to " + state.sessionLabel);
    document.documentElement.appendChild(host);
    Object.assign(state, {
      host: host, outline: outline, label: label, clearButton: clear,
      selectButton: select, chatButton: chat, captureButton: capture,
      attachment: attachment, connection: find(".connection"), drawer: drawer,
      transcript: transcript, input: input, sendButton: send,
    });
    select.addEventListener("click", function () {
      if (state.selecting) stopSelecting();
      else startSelecting();
    });
    clear.addEventListener("click", function () { clearSelection(true); });
    chat.addEventListener("click", function () {
      drawer.classList.toggle("open");
      chat.setAttribute("aria-expanded", drawer.classList.contains("open") ? "true" : "false");
      if (drawer.classList.contains("open")) input.focus();
    });
    capture.addEventListener("click", captureScreenshot);
    removeShot.addEventListener("click", function () {
      state.screenshot = null;
      renderAttachment();
    });
    send.addEventListener("click", sendChat);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChat();
      }
    });
    exit.addEventListener("click", function () {
      sendEvent("target.closed", { reason: "user_exit" });
      destroy();
    });
    setBusy(false);
  }

  function destroy() {
    stopSelecting();
    clearSelection(false);
    if (state.host) state.host.remove();
    Object.assign(state, {
      host: null, outline: null, label: null, clearButton: null,
      selectButton: null, chatButton: null, captureButton: null,
      attachment: null, connection: null, drawer: null, transcript: null,
      input: null, sendButton: null, activeOperationId: null, screenshot: null,
      connected: false, pairingId: null,
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
      if (message.nonce) sendEvent("target.prove", { nonce: message.nonce });
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
        state.activeOperationId = null;
        state.assistantBubble = null;
        setBusy(false);
      }
      sendResponse({ ok: true });
    }
  });
})();
