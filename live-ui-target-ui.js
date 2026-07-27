(function (root) {
  function styles() {
    return [
      ":host{all:initial}",
      ".shell{position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(410px,calc(100vw - 32px));font:500 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f6f1e9}",
      ".shell.dragging{user-select:none}.bar{display:flex;align-items:center;gap:7px;padding:8px;background:#211e1b;border:1px solid #464039;border-radius:13px;box-shadow:0 12px 32px rgba(0,0,0,.28)}",
      "button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:44px;cursor:pointer;padding:9px 12px;border-radius:9px;background:#b87836;color:#fff}button:hover{background:#c78743}button:focus-visible,textarea:focus-visible{outline:2px solid #f1bd75;outline-offset:2px}",
      "button:disabled{cursor:default;opacity:.45}button[hidden],[hidden]{display:none!important}.pick[aria-pressed=true]{background:#d29a52}",
      ".move{min-width:28px;min-height:40px;padding:0;cursor:grab;touch-action:none;background:transparent;color:#9f9488;font-size:17px;letter-spacing:-3px}.move:hover{background:#37312c;color:#eee5db}.move:active{cursor:grabbing}",
      ".selection{min-width:0;display:flex;align-items:center;flex:1;padding-left:2px;color:#ddd4c9}.selected-mark{flex:none;margin-right:5px;color:#70c992;font-weight:800}.label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.clear{min-height:36px;padding:7px 8px;margin-left:2px;background:transparent;color:#bfb5aa}.clear:hover,.exit:hover{background:#37312c}",
      ".exit{background:transparent;color:#bfb5aa}.chat-toggle{background:#38322d}.chat-toggle:hover{background:#49413a}",
      ".drawer{display:none;margin-bottom:8px;overflow:hidden;background:#211e1b;border:1px solid #464039;border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.34)}.drawer.open{display:block}",
      ".head{padding:13px 14px;border-bottom:1px solid #3c3630}.title{font-size:14px;font-weight:750}.identity{margin-top:2px;color:#c6b9aa;font-size:12px}.connection{margin-top:5px;color:#9bc5a6;font-size:11px}.connection.offline{color:#e3a09a}",
      ".selection-summary{display:flex;align-items:center;gap:10px;margin:10px 10px 0;padding:10px;border:1px solid #365744;border-radius:10px;background:#26352c}.selection-check{display:flex;align-items:center;justify-content:center;width:24px;height:24px;flex:none;border-radius:50%;background:#70c992;color:#17241b;font-weight:900}.selection-copy{display:grid;min-width:0;grid-template-columns:minmax(0,1fr) auto;gap:1px 8px}.selection-kicker{grid-column:1/-1;color:#9bc5a6;font-size:10px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.selection-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f6f1e9}.selection-tag{align-self:center;color:#a8bbae;font-size:10px}",
      ".transcript{max-height:300px;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}.empty{color:#a99d90;padding:12px 4px}",
      ".bubble{max-width:88%;padding:9px 11px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}.user{align-self:flex-end;background:#a9682e}.assistant{align-self:flex-start;background:#38322d}.status{align-self:flex-start;color:#b7aa9c;font-size:12px}",
      ".attachment{display:none;align-items:center;gap:7px;margin:0 10px 8px;padding:8px 9px;border-radius:8px;background:#302b26;color:#d8cec2}.attachment.ready{display:flex}.attachment span{flex:1}.remove-shot{min-height:34px;padding:5px 8px;background:transparent;color:#c9bdae}.composer{display:flex;gap:8px;padding:10px;border-top:1px solid #3c3630}.compose-main{display:flex;flex:1;flex-direction:column;gap:7px}",
      "textarea{all:unset;min-height:44px;max-height:110px;overflow:auto;box-sizing:border-box;padding:10px;background:#302b26;border-radius:8px;color:#fff;font:500 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:pre-wrap}textarea::placeholder{color:#9b8f82}.capture{align-self:flex-start;min-height:36px;padding:7px 9px;background:transparent;color:#d2c6b8}.capture:hover{background:#3b342e}.send{align-self:flex-end}",
      ".outline{position:fixed;z-index:2147483646;left:0;top:0;display:none;box-sizing:border-box;border:2px solid #4dae84;pointer-events:none;border-radius:4px;background:rgba(77,174,132,.08)}",
      "@media(max-width:520px){.shell{right:8px;bottom:8px;width:calc(100vw - 16px)}.bar{gap:4px;padding:6px}.move{min-width:24px}.pick,.chat-toggle,.exit{padding-left:9px;padding-right:9px}}",
    ].join("");
  }

  function isolateEvents(shadow) {
    var eventNames = [
      "pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick",
      "contextmenu", "touchstart", "touchend", "keydown", "keyup", "input",
      "change", "focusin", "focusout", "wheel",
    ];
    function isolate(event) {
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    for (var i = 0; i < eventNames.length; i++) {
      shadow.addEventListener(eventNames[i], isolate);
    }
  }

  function makeDraggable(shell, handle) {
    var drag = null;
    function clamp(left, top) {
      var margin = 8;
      var rect = shell.getBoundingClientRect();
      var maxLeft = Math.max(margin, innerWidth - rect.width - margin);
      var maxTop = Math.max(margin, innerHeight - rect.height - margin);
      return {
        left: Math.min(maxLeft, Math.max(margin, left)),
        top: Math.min(maxTop, Math.max(margin, top)),
      };
    }
    function place(left, top) {
      var next = clamp(left, top);
      shell.style.left = next.left + "px";
      shell.style.top = next.top + "px";
      shell.style.right = "auto";
      shell.style.bottom = "auto";
    }
    handle.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      event.preventDefault();
      var rect = shell.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top,
      };
      place(rect.left, rect.top);
      shell.classList.add("dragging");
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", function (event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      place(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
    });
    function stopDrag(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag = null;
      shell.classList.remove("dragging");
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    }
    handle.addEventListener("pointerup", stopDrag);
    handle.addEventListener("pointercancel", stopDrag);
    return function () {
      if (!shell.style.left) return;
      var rect = shell.getBoundingClientRect();
      place(rect.left, rect.top);
    };
  }

  function create(options) {
    var host = document.createElement("clay-live-ui");
    host.setAttribute("data-clay-live-ui-overlay", "");
    host.setAttribute("data-clay-live-ui-generation", options.documentGeneration);
    var shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = "<style>" + styles() + "</style>" +
      '<div class="outline"></div><div class="shell">' +
      '<section class="drawer"><div class="head"><div class="title">Live UI</div>' +
      '<div class="identity"></div><div class="connection offline">Connecting to Clay…</div></div>' +
      '<div class="selection-summary" role="status" aria-live="polite" hidden>' +
      '<span class="selection-check">✓</span><span class="selection-copy">' +
      '<span class="selection-kicker">Selected element</span>' +
      '<strong class="selection-name"></strong><code class="selection-tag"></code></span></div>' +
      '<div class="transcript" aria-live="polite"><div class="empty">' +
      'Select an element, or describe a page-wide change.</div></div>' +
      '<div class="attachment"><span>Masked screenshot attached</span>' +
      '<button type="button" class="remove-shot">Remove</button></div>' +
      '<div class="composer"><div class="compose-main">' +
      '<textarea rows="2" placeholder="Ask Clay to change or fix this…"></textarea>' +
      '<button type="button" class="capture" title="Sensitive controls, canvases, and frames are hidden">Add screenshot</button>' +
      '</div><button type="button" class="send">Send</button></div></section>' +
      '<div class="bar"><button type="button" class="move" aria-label="Move Live UI" title="Drag Live UI">⠿</button>' +
      '<button type="button" class="pick" aria-pressed="false">Pick element</button>' +
      '<span class="selection"><span class="selected-mark" hidden>✓</span>' +
      '<span class="label">No element selected</span>' +
      '<button type="button" class="clear" hidden>Clear</button></span>' +
      '<button type="button" class="chat-toggle" aria-expanded="false">Chat</button>' +
      '<button type="button" class="exit">Exit</button></div></div>';
    function find(selector) { return shadow.querySelector(selector); }
    find(".identity").textContent =
      "Sending to “" + options.sessionLabel + "” · " + options.projectLabel;
    find("textarea").setAttribute("aria-label", "Message to " + options.sessionLabel);
    isolateEvents(shadow);
    document.documentElement.appendChild(host);
    var shell = find(".shell");
    return {
      host: host,
      shell: shell,
      outline: find(".outline"),
      label: find(".label"),
      selectedMark: find(".selected-mark"),
      selectionSummary: find(".selection-summary"),
      selectionName: find(".selection-name"),
      selectionTag: find(".selection-tag"),
      emptyHint: find(".empty"),
      clearButton: find(".clear"),
      selectButton: find(".pick"),
      moveButton: find(".move"),
      chatButton: find(".chat-toggle"),
      captureButton: find(".capture"),
      removeShotButton: find(".remove-shot"),
      attachment: find(".attachment"),
      connection: find(".connection"),
      drawer: find(".drawer"),
      transcript: find(".transcript"),
      input: find("textarea"),
      sendButton: find(".send"),
      exitButton: find(".exit"),
      clampPosition: makeDraggable(shell, find(".move")),
    };
  }

  root.ClayLiveUiTargetUi = { create: create };
})(typeof globalThis !== "undefined" ? globalThis : this);
