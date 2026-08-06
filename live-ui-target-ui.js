(function (root) {
  function styles() {
    return [
      ":host{all:initial;--ink:#17191d;--panel:#202329;--surface:#292d34;--surface-2:#30353d;--line:#3a3f47;--text:#f1f3f5;--muted:#9ca3ad;--selection:#8fe388}",
      "[hidden]{display:none!important}.selection-shield{position:fixed;z-index:2147483644;inset:0;cursor:crosshair;background:rgba(143,227,136,.025)}",
      ".selection-outline,.worker-outline{position:fixed;z-index:2147483646;left:0;top:0;box-sizing:border-box;pointer-events:none;border-radius:5px}.selection-outline{display:none;border:2px solid var(--selection);background:rgba(143,227,136,.07)}",
      ".highlight-layer{position:fixed;z-index:2147483645;inset:0;pointer-events:none}.worker-outline{border:2px solid var(--worker-color);background:color-mix(in srgb,var(--worker-color) 7%,transparent);box-shadow:0 0 0 1px rgba(0,0,0,.28)}",
      ".worker-outline:not(.focused){border-style:dashed;opacity:.72}.worker-outline-label{position:absolute;left:-2px;top:-25px;max-width:220px;padding:4px 7px;border-radius:5px 5px 5px 0;background:var(--worker-color);color:#101216;font:750 10px/1.2 ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".worker-outline.changed{animation:changed-pulse 1.8s ease-out}.panel,.rail{position:fixed;z-index:2147483647;right:12px;top:12px;bottom:12px;color:var(--text);font:500 13px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 22px 72px rgba(0,0,0,.38)}",
      ".panel{display:flex;width:min(390px,calc(100vw - 24px));flex-direction:column;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--panel)}.rail{display:flex;width:48px;flex-direction:column;align-items:center;gap:8px;padding:8px 5px;box-sizing:border-box;border:1px solid var(--line);border-radius:14px;background:var(--panel)}",
      "button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}button:focus-visible,textarea:focus-visible{outline:2px solid var(--selection);outline-offset:2px}.icon-button{width:36px;height:36px;border-radius:9px;color:var(--muted)}.icon-button:hover{background:var(--surface);color:var(--text)}",
      ".panel-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:14px 14px 12px;border-bottom:1px solid var(--line)}.eyebrow{color:var(--muted);font:750 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase}.title{margin-top:3px;font-size:15px;font-weight:760}.identity{margin-top:2px;color:var(--muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.head-actions{display:flex;gap:3px}",
      ".connection-row{display:flex;align-items:center;gap:7px;padding:8px 14px;border-bottom:1px solid var(--line);background:#1c1f23;color:#a7cdb2;font-size:11px}.connection-row.offline{color:#f29a94}.aggregate-dot{width:8px;height:8px;flex:none;border-radius:50%;background:#6d737c}.aggregate-dot.working{background:#f0b35a;animation:pulse 1.4s ease-in-out infinite}.aggregate-dot.needs_input{background:#f0b35a}.aggregate-dot.completed{background:#58c493}.aggregate-dot.failed{background:#ee746d}.aggregate-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".selection-card{margin:12px 12px 0;border:1px solid #416247;border-radius:12px;background:#253229;overflow:hidden}.selection-card-head{display:flex;gap:9px;align-items:flex-start;padding:10px}.selection-check{display:flex;width:22px;height:22px;flex:none;align-items:center;justify-content:center;border-radius:50%;background:var(--selection);color:#142018;font-weight:900}.selection-copy{min-width:0;flex:1}.selection-kicker{color:#9ed6a6;font:750 9px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase}.selection-component{margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:760}.selection-source{margin-top:2px;color:#b8c9ba;font:500 10px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.selection-element,.selection-chain{padding:7px 10px;border-top:1px solid rgba(143,227,136,.12);color:#a9b5ac;font-size:10px}.selection-chain{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.clear{align-self:center;padding:6px;border-radius:7px;color:#a9b5ac;font-size:11px}.clear:hover{background:rgba(255,255,255,.06);color:#fff}",
      ".hmr-state{margin:8px 12px 0;padding:8px 10px;border-radius:9px;background:#242c33;color:#98c9f3;font-size:11px}.hmr-state.applying{color:#f1c477}.hmr-state.applied,.hmr-state.ready{color:#8fe0b5}.hmr-state.error,.hmr-state.reload{background:#332729;color:#f2a29c}",
      ".reports-head{display:flex;align-items:center;justify-content:space-between;padding:13px 14px 7px;color:var(--muted);font:750 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase}.report-list{min-height:72px;flex:1;overflow:auto;padding:0 8px}.reports-empty{padding:14px 7px;color:#7f8791;font-size:12px}",
      ".report-shell{padding:1px 0 5px}.report{position:relative;width:100%;display:grid;grid-template-columns:20px minmax(0,1fr);gap:7px;padding:9px 9px 9px 11px;border-radius:10px;text-align:left}.report:before{content:'';position:absolute;left:2px;top:9px;bottom:9px;width:2px;border-radius:2px;background:var(--worker-color)}.report:hover,.report.focused{background:var(--surface)}.report-icon{align-self:start;color:var(--worker-color);font-weight:850}.report-copy{display:flex;min-width:0;flex-direction:column}.report-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.report-meta{color:var(--worker-color);font:600 9px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.report-message,.report-hmr{color:var(--muted);font-size:10px}.report-hmr{color:#8fc7ef}.report.failed .report-icon{color:#ee746d}.report.completed{opacity:.78}.report-actions{display:flex;justify-content:flex-end;gap:5px;padding:4px 8px 0}.report-action{padding:4px 7px;border:1px solid var(--line);border-radius:6px;color:#bbc1c9;font-size:10px}.report-action:hover{background:var(--surface);color:#fff}.report-action.approve{border-color:#3f6654;color:#8fe0b5}",
      ".composer{padding:10px 12px 12px;border-top:1px solid var(--line);background:#1c1f23}.compose-target{display:flex;align-items:center;gap:5px;margin-bottom:7px;padding:6px 8px;border-radius:8px;background:var(--surface);color:#b9c0c8;font-size:10px}.compose-target strong{min-width:0;flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.compose-target-clear{padding:3px 5px;border-radius:5px;color:#8fc7ef;font-size:10px}.compose-target-clear:hover{background:var(--surface-2)}.compose-row{display:flex;gap:8px;align-items:flex-end}textarea{all:unset;min-height:52px;max-height:118px;flex:1;overflow:auto;box-sizing:border-box;padding:10px;border:1px solid #3d434c;border-radius:10px;background:var(--surface);color:var(--text);font:500 13px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:pre-wrap}textarea::placeholder{color:#777f89}.submit,.pick{min-height:40px;padding:0 13px;border-radius:10px;background:#edf1f5;color:#17191d;font-weight:760}.submit:hover,.pick:hover{background:#fff}.submit:disabled{opacity:.45;cursor:default}.evidence{margin-top:7px;color:#818994;font-size:10px}.compose-error{margin-top:7px;color:#f2a29c;font-size:11px}",
      ".panel-foot{display:flex;gap:7px;padding:9px 12px;border-top:1px solid var(--line)}.panel-foot .pick{flex:1}.exit{padding:0 12px;border-radius:10px;color:var(--muted)}.exit:hover{background:var(--surface);color:#f2a29c}.rail-open{width:36px;min-height:82px;flex:1;flex-direction:column;justify-content:flex-start;gap:8px;padding-top:11px;border-radius:10px;background:var(--surface)}.rail-open:hover{background:var(--surface-2)}.rail-label{writing-mode:vertical-rl;color:#c9ced4;font:750 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}.rail .pick{width:36px;min-height:36px;padding:0;font-size:16px}.rail .exit{width:36px;height:36px;padding:0}",
      "@keyframes pulse{0%,100%{opacity:.55;transform:scale(.88)}50%{opacity:1;transform:scale(1.08)}}@keyframes changed-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--worker-color) 70%,transparent)}45%{box-shadow:0 0 0 11px transparent}100%{box-shadow:0 0 0 0 transparent}}",
      "@media(max-width:560px){.panel,.rail{right:8px;top:8px;bottom:8px}.panel{width:calc(100vw - 16px)}}@media(prefers-reduced-motion:reduce){.aggregate-dot.working,.worker-outline.changed{animation:none}}",
    ].join("");
  }

  function isolateEvents(shadow) {
    var names = [
      "pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "click",
      "dblclick", "contextmenu", "touchstart", "touchend", "keydown", "keyup",
      "input", "change", "focusin", "focusout", "wheel",
    ];
    function isolate(event) {
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    for (var i = 0; i < names.length; i++) {
      shadow.addEventListener(names[i], isolate);
    }
  }

  function create(options) {
    var host = document.createElement("clay-live-ui");
    host.setAttribute("data-clay-live-ui-overlay", "");
    host.setAttribute("data-clay-live-ui-generation", options.documentGeneration);
    var shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = "<style>" + styles() + "</style>" +
      '<div class="selection-shield" hidden></div><div class="highlight-layer"></div>' +
      '<div class="selection-outline"></div><aside class="panel">' +
      '<header class="panel-head"><div><div class="eyebrow">Clay Live UI</div>' +
      '<div class="title">Component changes</div><div class="identity"></div></div>' +
      '<div class="head-actions"><button class="icon-button hide" type="button" aria-label="Hide Live UI sidebar">›</button>' +
      '<button class="icon-button exit" type="button" aria-label="Exit Live UI">×</button></div></header>' +
      '<div class="connection-row offline"><span class="aggregate-dot"></span>' +
      '<span class="aggregate-label">Connecting…</span></div>' +
      '<section class="selection-card" role="status" aria-live="polite" hidden>' +
      '<div class="selection-card-head"><span class="selection-check">✓</span>' +
      '<div class="selection-copy"><div class="selection-kicker">Selected component</div>' +
      '<div class="selection-component"></div><div class="selection-source"></div></div>' +
      '<button type="button" class="clear">Clear</button></div>' +
      '<div class="selection-element"></div><div class="selection-chain" hidden></div></section>' +
      '<div class="hmr-state" aria-live="polite" hidden></div>' +
      '<div class="reports-head"><span>Worker changes</span><span class="report-count">0</span></div>' +
      '<div class="report-list" aria-live="polite"></div>' +
      '<div class="composer"><div class="compose-target" hidden>' +
      '<span>Following up with</span><strong></strong>' +
      '<button type="button" class="compose-target-clear">New issue</button></div>' +
      '<div class="compose-row"><textarea rows="2" ' +
      'placeholder="Describe the issue or change…"></textarea>' +
      '<button type="button" class="submit">Report</button></div>' +
      '<div class="evidence">Masked screenshot, component, console, and network context attach automatically.</div>' +
      '<div class="compose-error" hidden></div></div>' +
      '<footer class="panel-foot"><button type="button" class="pick">Pick component</button>' +
      '<button type="button" class="exit">Exit</button></footer></aside>' +
      '<aside class="rail" hidden><button type="button" class="rail-open" aria-label="Show Live UI sidebar">' +
      '<span class="aggregate-dot"></span><span class="rail-label">LIVE UI</span></button>' +
      '<button type="button" class="pick" aria-label="Pick component">⌖</button>' +
      '<button type="button" class="exit" aria-label="Exit Live UI">×</button></aside>';
    function find(selector) { return shadow.querySelector(selector); }
    function findAll(selector) {
      return Array.prototype.slice.call(shadow.querySelectorAll(selector));
    }
    find(".identity").textContent =
      "Coordinator “" + options.sessionLabel + "” · " + options.projectLabel;
    find("textarea").setAttribute("aria-label",
      "Report component change to " + options.sessionLabel);
    var panel = find(".panel");
    var rail = find(".rail");
    function expand() {
      panel.hidden = false;
      rail.hidden = true;
    }
    function collapse() {
      panel.hidden = true;
      rail.hidden = false;
    }
    find(".hide").addEventListener("click", collapse);
    find(".rail-open").addEventListener("click", expand);
    isolateEvents(shadow);
    document.documentElement.appendChild(host);
    return {
      host: host,
      panel: panel,
      rail: rail,
      expand: expand,
      selectionShield: find(".selection-shield"),
      selectionOutline: find(".selection-outline"),
      highlightLayer: find(".highlight-layer"),
      selectionCard: find(".selection-card"),
      selectionComponent: find(".selection-component"),
      selectionSource: find(".selection-source"),
      selectionElement: find(".selection-element"),
      selectionChain: find(".selection-chain"),
      clearButton: find(".clear"),
      selectButtons: findAll(".pick"),
      aggregateDots: findAll(".aggregate-dot"),
      aggregateLabels: findAll(".aggregate-label"),
      reportList: find(".report-list"),
      reportCount: find(".report-count"),
      hmrState: find(".hmr-state"),
      composeError: find(".compose-error"),
      composeTarget: find(".compose-target"),
      composeTargetLabel: find(".compose-target strong"),
      composeTargetClear: find(".compose-target-clear"),
      connection: find(".connection-row"),
      input: find("textarea"),
      submitButton: find(".submit"),
      exitButtons: findAll(".exit"),
    };
  }

  root.ClayLiveUiTargetUi = { create: create };
})(typeof globalThis !== "undefined" ? globalThis : this);
