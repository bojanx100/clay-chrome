(function (root) {
  function safeWorkspace(message) {
    var state = message.state === "matched" ? "matched" :
      message.state === "manual" ? "manual" : "unmatched";
    var slug = message.projectSlug ? String(message.projectSlug) : null;
    if (slug && !/^[a-z0-9_-]+$/.test(slug)) return null;
    return {
      targetTabId: Number(message.targetTabId),
      state: state,
      projectSlug: slug,
      projectLabel: message.projectLabel ? String(message.projectLabel).slice(0, 160) : null,
      worktreeLabel: message.worktreeLabel ? String(message.worktreeLabel).slice(0, 160) : null,
      code: message.code ? String(message.code).slice(0, 100) : null,
      error: message.error ? String(message.error).slice(0, 500) : null,
    };
  }

  function createProbe(chromeApi, getPort, options) {
    options = options || {};
    var states = {};
    var counter = 0;
    var now = options.now || function () { return Date.now(); };
    var timeoutMs = Number(options.timeoutMs) > 0 ?
      Number(options.timeoutMs) : 8000;
    var retryDelayMs = Number(options.retryDelayMs) > 0 ?
      Number(options.retryDelayMs) : 3000;

    function failProbe(current, code, error) {
      var at = now();
      current.value = {
        targetTabId: current.value.targetTabId,
        state: "unmatched",
        code: code,
        error: error,
      };
      current.retryAt = at + retryDelayMs;
    }

    function keepPrevious(previous) {
      var at = now();
      if (previous.value.state === "checking" &&
          at - previous.startedAt >= timeoutMs) {
        failProbe(previous, "LIVE_UI_TARGET_PROBE_TIMEOUT",
          "Clay did not answer this workspace request. Restart Clay to load " +
          "the current Live UI protocol; matching will retry automatically.");
      }
      return !previous.retryAt || at < previous.retryAt;
    }

    function compatibleControl(activeTab, controls) {
      for (var i = 0; i < controls.length; i++) {
        if (Number(controls[i].controlTabId) !== Number(activeTab.id) &&
            getPort(controls[i].controlTabId)) return controls[i];
      }
      return null;
    }

    function ensure(activeTab, controls, publicTabs) {
      if (!activeTab || !activeTab.id || !activeTab.url) return null;
      var previous = states[activeTab.id];
      if (previous && previous.url === activeTab.url && keepPrevious(previous)) {
        return previous.value;
      }
      if (previous) delete states[activeTab.id];
      var control = compatibleControl(activeTab, controls || []);
      if (!control) return null;
      var port = getPort(control.controlTabId);
      var requestId = "live-ui-workspace-" + Date.now() + "-" + (++counter);
      var value = { targetTabId: activeTab.id, state: "checking" };
      states[activeTab.id] = {
        url: activeTab.url,
        requestId: requestId,
        value: value,
        startedAt: now(),
        retryAt: null,
      };
      try {
        port.postMessage({
          type: "clay_live_ui_picker_probe_request",
          requestId: requestId,
          targetTabId: activeTab.id,
          tabs: publicTabs,
          extensionId: chromeApi.runtime.id,
        });
      } catch (error) {
        failProbe(states[activeTab.id], "LIVE_UI_TARGET_PROBE_DISCONNECTED",
          "Clay disconnected while identifying this server. Matching will " +
          "retry automatically.");
      }
      return states[activeTab.id].value;
    }

    function handleMessage(message) {
      if (!message || message.type !== "clay_live_ui_target_workspace") return false;
      var targetTabId = Number(message.targetTabId);
      var current = states[targetTabId];
      if (!current || current.requestId !== message.requestId) return true;
      var workspace = safeWorkspace(message);
      if (workspace) {
        current.value = workspace;
        current.retryAt = null;
      }
      return true;
    }

    function clear(tabId) {
      delete states[Number(tabId)];
    }

    return { clear: clear, ensure: ensure, handleMessage: handleMessage };
  }

  root.ClayLiveUiPickerWorkspace = { createProbe: createProbe };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiPickerWorkspace;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
