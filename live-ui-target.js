(function () {
  if (globalThis.__clayLiveUiTargetInstalled) return;
  globalThis.__clayLiveUiTargetInstalled = true;

  var state = {
    pairingId: null,
    host: null,
    label: null,
    selectButton: null,
    chatButton: null,
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
  };

  function nextMessageId() {
    state.sequence += 1;
    return "selection-" + Date.now() + "-" + state.sequence;
  }

  function nextChatId() {
    state.sequence += 1;
    return "chat-" + Date.now() + "-" + state.sequence;
  }

  function sendEvent(event, payload, clientMessageId) {
    if (!state.pairingId) return;
    chrome.runtime.sendMessage({
      type: "live_ui_target_event",
      protocolVersion: 1,
      pairingId: state.pairingId,
      clientMessageId: clientMessageId || null,
      event: event,
      payload: payload || null,
    }, function () {
      void chrome.runtime.lastError;
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
      state.label.textContent = "Reselect required";
      return;
    }
    state.selected = element;
    var restored = selectionPacket(element);
    state.label.textContent = restored.accessibleName || restored.text || restored.tag;
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
    state.outline.style.borderColor = selected ? "#7c3aed" : "#22c55e";
  }

  function stopSelecting() {
    state.selecting = false;
    state.hovered = null;
    if (state.selectButton) {
      state.selectButton.textContent = "Select";
      state.selectButton.setAttribute("aria-pressed", "false");
    }
    if (state.selected) positionOutline(state.selected, true);
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
    state.label.textContent = packet.accessibleName || packet.text || packet.tag;
    positionOutline(state.selected, true);
    stopSelecting();
    sendEvent("selection.update", packet, nextMessageId());
  }

  function styles() {
    return [
      ":host{all:initial}",
      ".shell{position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(380px,calc(100vw - 32px));font:500 13px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff}",
      ".bar{display:flex;align-items:center;gap:8px;padding:8px;background:#17151d;border:1px solid #34303d;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.28)}",
      "button{all:unset;cursor:pointer;padding:8px 11px;border-radius:8px;background:#7c3aed;color:#fff}button:hover{background:#8b5cf6}",
      "button:disabled{cursor:default;opacity:.5}",
      ".label{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d8d4df;font-weight:500}",
      ".exit{background:transparent;color:#bcb6c7}.exit:hover{background:#2a2631}",
      ".chat-toggle{background:#28232f}.chat-toggle:hover{background:#373040}",
      ".drawer{display:none;margin-bottom:8px;overflow:hidden;background:#17151d;border:1px solid #34303d;border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.34)}",
      ".drawer.open{display:block}",
      ".head{padding:12px 14px;border-bottom:1px solid #302b37;font-weight:700}",
      ".transcript{max-height:300px;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}",
      ".empty{color:#9d96a7;padding:14px 4px}",
      ".bubble{max-width:88%;padding:9px 11px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}",
      ".user{align-self:flex-end;background:#7c3aed}.assistant{align-self:flex-start;background:#28232f;color:#e8e3ec}",
      ".status{align-self:flex-start;color:#a9a2b2;font-size:12px}",
      ".composer{display:flex;gap:8px;padding:10px;border-top:1px solid #302b37}",
      "textarea{all:unset;flex:1;min-height:38px;max-height:110px;overflow:auto;box-sizing:border-box;padding:9px 10px;background:#221e28;border-radius:8px;color:#fff;font:500 13px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:pre-wrap}",
      "textarea::placeholder{color:#8f8798}.send{align-self:flex-end}",
      ".outline{position:fixed;z-index:2147483646;left:0;top:0;display:none;box-sizing:border-box;border:2px solid #22c55e;pointer-events:none;border-radius:3px;background:rgba(34,197,94,.08)}",
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
    state.sendButton.disabled = busy;
    state.input.disabled = busy;
    state.sendButton.textContent = busy ? "Working…" : "Send";
  }

  function sendChat() {
    var text = state.input.value.trim();
    if (!text || state.activeOperationId) return;
    appendBubble("user", text);
    state.input.value = "";
    state.assistantBubble = null;
    state.activeOperationId = "pending";
    setBusy(true);
    sendEvent("chat.message", { text: text }, nextChatId());
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
    var shadow = host.attachShadow({ mode: "closed" });
    var style = document.createElement("style");
    style.textContent = styles();
    var outline = document.createElement("div");
    outline.className = "outline";
    var shell = document.createElement("div");
    shell.className = "shell";
    var drawer = document.createElement("section");
    drawer.className = "drawer";
    var head = document.createElement("div");
    head.className = "head";
    head.textContent = "Clay Live UI";
    var transcript = document.createElement("div");
    transcript.className = "transcript";
    var empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Select an element, then describe the change or issue.";
    transcript.appendChild(empty);
    var composer = document.createElement("div");
    composer.className = "composer";
    var input = document.createElement("textarea");
    input.rows = 2;
    input.placeholder = "Ask Clay to change or fix this…";
    var send = document.createElement("button");
    send.type = "button";
    send.className = "send";
    send.textContent = "Send";
    composer.appendChild(input);
    composer.appendChild(send);
    drawer.appendChild(head);
    drawer.appendChild(transcript);
    drawer.appendChild(composer);
    var bar = document.createElement("div");
    bar.className = "bar";
    var select = document.createElement("button");
    select.type = "button";
    select.textContent = "Select";
    select.setAttribute("aria-pressed", "false");
    var label = document.createElement("span");
    label.className = "label";
    label.textContent = "No element selected";
    var chat = document.createElement("button");
    chat.type = "button";
    chat.className = "chat-toggle";
    chat.textContent = "Chat";
    var exit = document.createElement("button");
    exit.type = "button";
    exit.className = "exit";
    exit.textContent = "Exit";
    bar.appendChild(select);
    bar.appendChild(label);
    bar.appendChild(chat);
    bar.appendChild(exit);
    shadow.appendChild(style);
    shadow.appendChild(outline);
    shell.appendChild(drawer);
    shell.appendChild(bar);
    shadow.appendChild(shell);
    document.documentElement.appendChild(host);
    state.host = host;
    state.outline = outline;
    state.label = label;
    state.selectButton = select;
    state.chatButton = chat;
    state.drawer = drawer;
    state.transcript = transcript;
    state.input = input;
    state.sendButton = send;
    select.addEventListener("click", function () {
      if (state.selecting) stopSelecting();
      else startSelecting();
    });
    chat.addEventListener("click", function () {
      drawer.classList.toggle("open");
      if (drawer.classList.contains("open")) input.focus();
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
  }

  function destroy() {
    stopSelecting();
    state.selected = null;
    if (state.host) state.host.remove();
    state.host = null;
    state.outline = null;
    state.drawer = null;
    state.transcript = null;
    state.input = null;
    state.sendButton = null;
    state.activeOperationId = null;
    state.pairingId = null;
  }

  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerdown", onPointerDown, true);
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
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === "live_ui_init") {
      if (new URL(location.href).origin !== message.allowedOrigin) {
        sendResponse({ ok: false, error: "Target origin changed" });
        return;
      }
      state.pairingId = message.pairingId;
      createOverlay();
      if (message.nonce) sendEvent("target.prove", { nonce: message.nonce });
      state.pendingSelection = message.selection || null;
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
          message.envelope.state === "paired" && state.pendingSelection) {
        var pending = state.pendingSelection;
        state.pendingSelection = null;
        restoreSelection(pending);
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
