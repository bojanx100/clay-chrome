(function (root) {
  function styles() {
    return [
      ":host{all:initial}",
      ".selection-shield{position:fixed;z-index:2147483644;inset:0;cursor:crosshair;background:rgba(184,120,54,.025)}",
      ".outline{position:fixed;z-index:2147483646;left:0;top:0;display:none;box-sizing:border-box;border:2px solid #4dae84;pointer-events:none;border-radius:4px;background:rgba(77,174,132,.08)}",
      ".shell{position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(390px,calc(100vw - 32px));font:500 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f6f1e9}",
      ".shell.dragging{user-select:none}.bar{display:flex;align-items:center;gap:7px;padding:7px;background:#211e1b;border:1px solid #464039;border-radius:13px;box-shadow:0 12px 32px rgba(0,0,0,.28)}",
      "button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:42px;cursor:pointer;padding:8px 11px;border-radius:9px;background:#b87836;color:#fff}button:hover{background:#c78743}button:focus-visible,textarea:focus-visible{outline:2px solid #f1bd75;outline-offset:2px}",
      "button:disabled{cursor:default;opacity:.45}button[hidden],[hidden]{display:none!important}.pick[aria-pressed=true]{background:#d29a52}",
      ".move{min-width:28px;min-height:38px;padding:0;cursor:grab;touch-action:none;background:transparent;color:#9f9488;font-size:17px;letter-spacing:-3px}.move:hover{background:#37312c;color:#eee5db}.move:active{cursor:grabbing}",
      ".panel-toggle{min-width:0;flex:1;justify-content:flex-start;gap:7px;background:#38322d;color:#e8dfd5}.panel-toggle:hover{background:#49413a}.aggregate-dot{width:9px;height:9px;flex:none;border-radius:50%;background:#777}.aggregate-dot.working{background:#dfad4f;box-shadow:0 0 0 3px rgba(223,173,79,.15);animation:pulse 1.4s ease-in-out infinite}.aggregate-dot.needs_input{background:#dfad4f}.aggregate-dot.completed{background:#58b985}.aggregate-dot.failed{background:#df6c64}.aggregate-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".exit{background:transparent;color:#bfb5aa}.exit:hover{background:#37312c}.selected-mark{color:#70c992;font-weight:800}",
      ".drawer{display:none;margin-bottom:8px;overflow:hidden;background:#211e1b;border:1px solid #464039;border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.34)}.drawer.open{display:block}",
      ".head{padding:12px 14px;border-bottom:1px solid #3c3630}.title{font-size:14px;font-weight:750}.identity{margin-top:2px;color:#c6b9aa;font-size:12px}.connection{margin-top:5px;color:#9bc5a6;font-size:11px}.connection.offline{color:#e3a09a}",
      ".selection-summary{display:flex;align-items:center;gap:9px;margin:10px 10px 0;padding:9px;border:1px solid #365744;border-radius:10px;background:#26352c}.selection-check{display:flex;align-items:center;justify-content:center;width:22px;height:22px;flex:none;border-radius:50%;background:#70c992;color:#17241b;font-weight:900}.selection-copy{display:grid;min-width:0;grid-template-columns:minmax(0,1fr) auto;gap:1px 8px}.selection-kicker{grid-column:1/-1;color:#9bc5a6;font-size:10px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.selection-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.selection-tag{align-self:center;color:#a8bbae;font-size:10px}.clear{min-height:32px;padding:5px 7px;background:transparent;color:#c9bdae}.clear:hover{background:#3b342e}",
      ".composer{padding:10px}.compose-row{display:flex;gap:8px;align-items:flex-end}textarea{all:unset;min-height:48px;max-height:110px;flex:1;overflow:auto;box-sizing:border-box;padding:10px;background:#302b26;border-radius:8px;color:#fff;font:500 13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:pre-wrap}textarea::placeholder{color:#9b8f82}.submit{flex:none}.evidence{margin-top:7px;color:#9f9488;font-size:11px}.compose-error{margin-top:7px;color:#e3a09a;font-size:11px}",
      ".reports-head{display:flex;justify-content:space-between;padding:9px 12px;border-top:1px solid #3c3630;color:#bfb5aa;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.report-list{max-height:220px;overflow:auto;padding:0 8px 8px}.reports-empty{padding:10px 5px;color:#8f8479;font-size:12px}.report{display:grid;grid-template-columns:18px minmax(0,1fr);gap:1px 7px;padding:8px;border-radius:8px}.report+.report{border-top:1px solid #332e29}.report-icon{grid-row:1/3;align-self:center;font-size:13px}.report-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.report-message{color:#9f9488;font-size:11px}.report.working .report-icon,.report.needs_input .report-icon{color:#dfad4f}.report.completed .report-icon{color:#58b985}.report.failed .report-icon{color:#df6c64}",
      "@keyframes pulse{0%,100%{opacity:.55;transform:scale(.9)}50%{opacity:1;transform:scale(1.08)}}",
      "@media(max-width:520px){.shell{right:8px;bottom:8px;width:calc(100vw - 16px)}.bar{gap:4px;padding:6px}.move{min-width:24px}.pick,.exit{padding-left:9px;padding-right:9px}}",
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
    function place(left, top) {
      var margin = 8;
      var rect = shell.getBoundingClientRect();
      var maxLeft = Math.max(margin, innerWidth - rect.width - margin);
      var maxTop = Math.max(margin, innerHeight - rect.height - margin);
      shell.style.left = Math.min(maxLeft, Math.max(margin, left)) + "px";
      shell.style.top = Math.min(maxTop, Math.max(margin, top)) + "px";
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
      '<div class="selection-shield" hidden></div><div class="outline"></div>' +
      '<div class="shell"><section class="drawer"><div class="head">' +
      '<div class="title">Report issues</div><div class="identity"></div>' +
      '<div class="connection offline">Connecting to Clay…</div></div>' +
      '<div class="selection-summary" role="status" aria-live="polite" hidden>' +
      '<span class="selection-check">✓</span><span class="selection-copy">' +
      '<span class="selection-kicker">Selected element</span>' +
      '<strong class="selection-name"></strong><code class="selection-tag"></code></span>' +
      '<button type="button" class="clear">Clear</button></div>' +
      '<div class="composer"><div class="compose-row">' +
      '<textarea rows="2" placeholder="Describe the issue or change…"></textarea>' +
      '<button type="button" class="submit">Report</button></div>' +
      '<div class="evidence">Masked screenshot, console, and network context are attached automatically.</div>' +
      '<div class="compose-error" hidden></div></div>' +
      '<div class="reports-head"><span>Reports</span><span class="report-count">0</span></div>' +
      '<div class="report-list" aria-live="polite"><div class="reports-empty">No reports yet.</div></div>' +
      '</section><div class="bar">' +
      '<button type="button" class="move" aria-label="Move Live UI" title="Drag Live UI">⠿</button>' +
      '<button type="button" class="panel-toggle" aria-expanded="false">' +
      '<span class="aggregate-dot"></span><span class="aggregate-label">Ready</span></button>' +
      '<button type="button" class="pick" aria-pressed="false">Pick element</button>' +
      '<button type="button" class="exit">Exit</button></div></div>';
    function find(selector) { return shadow.querySelector(selector); }
    find(".identity").textContent =
      "Coordinator “" + options.sessionLabel + "” · " + options.projectLabel;
    find("textarea").setAttribute("aria-label", "Report issue to " + options.sessionLabel);
    isolateEvents(shadow);
    document.documentElement.appendChild(host);
    var shell = find(".shell");
    return {
      host: host,
      shell: shell,
      selectionShield: find(".selection-shield"),
      outline: find(".outline"),
      selectionSummary: find(".selection-summary"),
      selectionName: find(".selection-name"),
      selectionTag: find(".selection-tag"),
      clearButton: find(".clear"),
      selectButton: find(".pick"),
      panelButton: find(".panel-toggle"),
      aggregateDot: find(".aggregate-dot"),
      aggregateLabel: find(".aggregate-label"),
      reportList: find(".report-list"),
      reportCount: find(".report-count"),
      composeError: find(".compose-error"),
      connection: find(".connection"),
      drawer: find(".drawer"),
      input: find("textarea"),
      submitButton: find(".submit"),
      exitButton: find(".exit"),
      clampPosition: makeDraggable(shell, find(".move")),
    };
  }

  root.ClayLiveUiTargetUi = { create: create };
})(typeof globalThis !== "undefined" ? globalThis : this);
