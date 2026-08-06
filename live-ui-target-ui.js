(function (root) {
  function styles() {
    return [
      ":host{all:initial;--selection:#8fe388}",
      "[hidden]{display:none!important}",
      ".selection-shield{position:fixed;z-index:2147483644;inset:0;cursor:crosshair;background:rgba(143,227,136,.025)}",
      ".selection-outline,.worker-outline{position:fixed;z-index:2147483646;left:0;top:0;box-sizing:border-box;pointer-events:none;border-radius:5px}",
      ".selection-outline{display:none;border:2px solid var(--selection);background:rgba(143,227,136,.07)}",
      ".highlight-layer{position:fixed;z-index:2147483645;inset:0;pointer-events:none}",
      ".worker-outline{border:2px solid var(--worker-color);background:color-mix(in srgb,var(--worker-color) 7%,transparent);box-shadow:0 0 0 1px rgba(0,0,0,.28)}",
      ".worker-outline:not(.focused){border-style:dashed;opacity:.72}",
      ".worker-outline-label{position:absolute;left:-2px;top:-25px;max-width:220px;padding:4px 7px;border-radius:5px 5px 5px 0;background:var(--worker-color);color:#101216;font:750 10px/1.2 ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".worker-outline.changed{animation:changed-pulse 1.8s ease-out}",
      "@keyframes changed-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--worker-color) 70%,transparent)}45%{box-shadow:0 0 0 11px transparent}100%{box-shadow:0 0 0 0 transparent}}",
      "@media(prefers-reduced-motion:reduce){.worker-outline.changed{animation:none}}",
    ].join("");
  }

  function isolateSelectionEvents(shadow) {
    var names = [
      "pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "click",
      "dblclick", "contextmenu", "touchstart", "touchend", "keydown", "keyup",
      "input", "change", "focusin", "focusout", "wheel",
    ];
    function isolate(event) {
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    for (var i = 0; i < names.length; i++) shadow.addEventListener(names[i], isolate);
  }

  function create(options) {
    var host = document.createElement("clay-live-ui");
    host.setAttribute("data-clay-live-ui-overlay", "");
    host.setAttribute("data-clay-live-ui-generation", options.documentGeneration);
    var shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = "<style>" + styles() + "</style>" +
      '<div class="selection-shield" hidden></div>' +
      '<div class="highlight-layer"></div><div class="selection-outline"></div>';
    isolateSelectionEvents(shadow);
    document.documentElement.appendChild(host);
    return {
      host: host,
      selectionShield: shadow.querySelector(".selection-shield"),
      selectionOutline: shadow.querySelector(".selection-outline"),
      highlightLayer: shadow.querySelector(".highlight-layer"),
    };
  }

  root.ClayLiveUiTargetUi = { create: create };
})(typeof globalThis !== "undefined" ? globalThis : this);
