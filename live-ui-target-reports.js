(function (root) {
  function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#55A7FF";
  }

  function sourceFile(report) {
    var component = report && report.locator && report.locator.component;
    return component && component.source ? component.source.file || "" : "";
  }

  function normalizedPath(value) {
    return String(value || "").replace(/\\/g, "/").split(/[?#]/)[0]
      .replace(/^\/+/, "");
  }

  function fileMatches(report, files) {
    var source = normalizedPath(sourceFile(report));
    if (!source) return false;
    for (var i = 0; i < files.length; i++) {
      var changed = normalizedPath(files[i]);
      if (changed === source || changed.endsWith("/" + source) ||
          source.endsWith("/" + changed)) return true;
    }
    return false;
  }

  function syncSelectionFocus(report, actions) {
    actions.clear(true);
    if (report && report.locator) actions.restore(report.locator, false);
  }

  function create(options) {
    var reports = {};
    var focusedId = null;
    var hmrClearTimer = null;
    var hmr = { status: "", message: "" };

    function reportValues() {
      return Object.keys(reports).map(function (id) { return reports[id]; });
    }

    function get(reportId) {
      return reportId && reports[reportId] ? reports[reportId] : null;
    }

    function resolveReport(report) {
      return options.resolveElement(report && report.locator);
    }

    function highlightFor(report) {
      var selector = '[data-report-id="' + CSS.escape(report.reportId) + '"]';
      var outline = options.highlightLayer.querySelector(selector);
      if (outline) return outline;
      outline = document.createElement("div");
      outline.className = "worker-outline";
      outline.dataset.reportId = report.reportId;
      var label = document.createElement("span");
      label.className = "worker-outline-label";
      outline.appendChild(label);
      options.highlightLayer.appendChild(outline);
      return outline;
    }

    function positionHighlight(report, outline) {
      var element = resolveReport(report);
      if (!element) {
        outline.hidden = true;
        return;
      }
      var rect = element.getBoundingClientRect();
      var siblings = Array.prototype.slice.call(
        options.highlightLayer.querySelectorAll(".worker-outline"));
      var outlineIndex = Math.max(0, siblings.indexOf(outline));
      var offset = (outlineIndex % 4) * 3;
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 ||
          rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) {
        outline.hidden = true;
        return;
      }
      outline.hidden = false;
      outline.style.setProperty("--worker-color", safeColor(
        report.worker && report.worker.color));
      outline.style.transform = "translate(" + (rect.left - offset) + "px," +
        (rect.top - offset) + "px)";
      outline.style.width = (rect.width + (offset * 2)) + "px";
      outline.style.height = (rect.height + (offset * 2)) + "px";
      outline.classList.toggle("focused", report.reportId === focusedId);
      var label = outline.querySelector(".worker-outline-label");
      label.style.top = (-25 - ((outlineIndex % 4) * 22)) + "px";
      label.textContent = report.worker && report.worker.label ?
        report.worker.label : "Clay worker";
    }

    function refreshHighlights() {
      var visible = {};
      var values = reportValues();
      for (var i = 0; i < values.length; i++) {
        var report = values[i];
        var active = report.status === "working" || report.status === "needs_input";
        if (!active && report.reportId !== focusedId) continue;
        var outline = highlightFor(report);
        visible[report.reportId] = true;
        positionHighlight(report, outline);
      }
      var outlines = options.highlightLayer.querySelectorAll(".worker-outline");
      for (var j = 0; j < outlines.length; j++) {
        if (!visible[outlines[j].dataset.reportId]) outlines[j].remove();
      }
    }

    function focused() {
      return get(focusedId);
    }

    function focus(reportId) {
      focusedId = get(reportId) ? reportId : null;
      refreshHighlights();
      if (options.onFocus) options.onFocus(focused());
    }

    function focusForSubmission(reportId) {
      if (!reportId) return true;
      if (!get(reportId)) return false;
      if (focusedId !== reportId) focus(reportId);
      return true;
    }

    function upsert(report) {
      if (!report || !report.reportId) return;
      reports[report.reportId] = Object.assign({}, reports[report.reportId] || {}, report);
      refreshHighlights();
    }

    function replace(nextReports) {
      var hadFocused = !!focusedId;
      reports = {};
      var values = Array.isArray(nextReports) ? nextReports : [];
      for (var i = 0; i < values.length; i++) {
        if (values[i] && values[i].reportId) reports[values[i].reportId] = values[i];
      }
      if (focusedId && !reports[focusedId]) focusedId = null;
      refreshHighlights();
      if (hadFocused && !focusedId && options.onFocus) options.onFocus(null);
    }

    function remove(reportId) {
      var wasFocused = focusedId === reportId;
      delete reports[reportId];
      if (wasFocused) focusedId = null;
      refreshHighlights();
      if (wasFocused && options.onFocus) options.onFocus(null);
    }

    function counts() {
      var result = { working: 0, needs_input: 0, completed: 0, failed: 0 };
      var values = reportValues();
      for (var i = 0; i < values.length; i++) {
        var status = result[values[i].status] === undefined ? "working" : values[i].status;
        result[status]++;
      }
      return result;
    }

    function aggregateStatus(value) {
      if (value.needs_input) return "needs_input";
      if (value.failed) return "failed";
      if (value.working) return "working";
      if (value.completed) return "completed";
      return "";
    }

    function snapshot() {
      var statusCounts = counts();
      return {
        reports: reportValues(),
        focusedId: focusedId,
        counts: statusCounts,
        aggregateStatus: aggregateStatus(statusCounts),
        hmr: hmr,
      };
    }

    function pulse(report) {
      var outline = highlightFor(report);
      positionHighlight(report, outline);
      outline.classList.remove("changed");
      void outline.offsetWidth;
      outline.classList.add("changed");
      setTimeout(function () { outline.classList.remove("changed"); }, 1800);
    }

    function hmrMessage(status, payload) {
      if (status === "ready") return "Fast Refresh ready";
      if (status === "applying") return "Applying live update…";
      if (status === "applied") return "Live update applied without reloading";
      if (status === "reload") return payload && payload.message ?
        payload.message : "This change requires a full refresh";
      if (status === "error") return payload && payload.message ?
        payload.message : "Fast Refresh failed";
      if (status === "disconnected") return "Dev server refresh connection lost";
      return "";
    }

    function handleHmr(status, payload) {
      hmr = { status: status, message: hmrMessage(status, payload) };
      var files = payload && Array.isArray(payload.files) ? payload.files : [];
      var working = reportValues().filter(function (report) {
        return report.status === "working";
      });
      var matched = working.filter(function (report) {
        return fileMatches(report, files);
      });
      if (!matched.length && !files.length && working.length === 1) matched = working;
      for (var i = 0; i < matched.length; i++) {
        matched[i].hmrMessage = hmr.message;
        if (status === "applied") pulse(matched[i]);
      }
      if (hmrClearTimer) clearTimeout(hmrClearTimer);
      if (status === "applied") {
        hmrClearTimer = setTimeout(function () {
          hmr = { status: "", message: "" };
        }, 4500);
      }
      refreshHighlights();
    }

    function clear() {
      reports = {};
      focusedId = null;
      hmr = { status: "", message: "" };
      if (hmrClearTimer) clearTimeout(hmrClearTimer);
      options.highlightLayer.innerHTML = "";
    }

    return {
      clear: clear,
      focus: focus,
      focusForSubmission: focusForSubmission,
      focused: focused,
      get: get,
      handleHmr: handleHmr,
      refreshHighlights: refreshHighlights,
      replace: replace,
      remove: remove,
      snapshot: snapshot,
      upsert: upsert,
    };
  }

  root.ClayLiveUiTargetReports = {
    create: create,
    syncSelectionFocus: syncSelectionFocus,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
