(function (root) {
  function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#55A7FF";
  }

  function statusIcon(status) {
    if (status === "completed") return "✓";
    if (status === "needs_input") return "?";
    if (status === "failed") return "!";
    return "●";
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

  function create(options) {
    var reports = {};
    var focusedId = null;
    var hmrClearTimer = null;

    function reportValues() {
      return Object.keys(reports).map(function (id) { return reports[id]; });
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
      if (rect.width <= 0 || rect.height <= 0 ||
          rect.bottom <= 0 || rect.right <= 0 ||
          rect.top >= innerHeight || rect.left >= innerWidth) {
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
      label.textContent =
        report.worker && report.worker.label ? report.worker.label : "Clay worker";
    }

    function refreshHighlights() {
      if (!options.highlightLayer) return;
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

    function aggregateStatus(counts) {
      if (counts.needs_input) return "needs_input";
      if (counts.failed) return "failed";
      if (counts.working) return "working";
      if (counts.completed) return "completed";
      return "";
    }

    function render() {
      var values = reportValues();
      options.reportCount.textContent = String(values.length);
      options.reportList.innerHTML = "";
      var counts = { working: 0, needs_input: 0, completed: 0, failed: 0 };
      if (!values.length) {
        var empty = document.createElement("div");
        empty.className = "reports-empty";
        empty.textContent = "Pick a component and report the first change.";
        options.reportList.appendChild(empty);
      }
      for (var i = 0; i < values.length; i++) {
        var report = values[i];
        var status = counts[report.status] === undefined ? "working" : report.status;
        counts[status]++;
        var row = document.createElement("button");
        row.type = "button";
        row.className = "report " + status +
          (report.reportId === focusedId ? " focused" : "");
        row.style.setProperty("--worker-color", safeColor(
          report.worker && report.worker.color));
        row.dataset.reportId = report.reportId;
        var source = sourceFile(report);
        row.innerHTML =
          '<span class="report-icon">' + statusIcon(status) + '</span>' +
          '<span class="report-copy"><strong class="report-title"></strong>' +
          '<span class="report-meta"></span><span class="report-message"></span>' +
          '<span class="report-hmr"></span></span>';
        row.querySelector(".report-title").textContent =
          report.title || "Live UI report";
        row.querySelector(".report-meta").textContent = [
          report.worker && report.worker.label,
          source || null,
        ].filter(function (part) { return !!part; }).join(" · ");
        row.querySelector(".report-message").textContent =
          report.message || "Being worked on.";
        var hmr = row.querySelector(".report-hmr");
        hmr.textContent = report.hmrMessage || "";
        hmr.hidden = !report.hmrMessage;
        row.addEventListener("click", (function (current) {
          return function () {
            focusedId = current.reportId === focusedId ? null : current.reportId;
            render();
            refreshHighlights();
            if (focusedId && options.onFocus) options.onFocus(current);
          };
        })(report));
        options.reportList.appendChild(row);
      }
      var parts = [];
      if (counts.working) parts.push(counts.working + " working");
      if (counts.needs_input) parts.push(counts.needs_input + " need input");
      if (counts.failed) parts.push(counts.failed + " failed");
      if (counts.completed) parts.push(counts.completed + " done");
      var aggregate = aggregateStatus(counts);
      var dots = options.aggregateDots || [options.aggregateDot];
      var labels = options.aggregateLabels || [options.aggregateLabel];
      for (var di = 0; di < dots.length; di++) {
        dots[di].className = "aggregate-dot" +
          (aggregate ? " " + aggregate : "");
      }
      for (var li = 0; li < labels.length; li++) {
        labels[li].textContent = parts.length ?
          parts.join(" · ") : (options.isConnected() ? "Ready" : "Disconnected");
      }
      refreshHighlights();
    }

    function upsert(report) {
      if (!report || !report.reportId) return;
      reports[report.reportId] = Object.assign(
        {}, reports[report.reportId] || {}, report);
      render();
    }

    function replace(nextReports) {
      reports = {};
      var values = Array.isArray(nextReports) ? nextReports : [];
      for (var i = 0; i < values.length; i++) upsert(values[i]);
      render();
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
      var message = hmrMessage(status, payload);
      options.hmrState.textContent = message;
      options.hmrState.className = "hmr-state " + status;
      options.hmrState.hidden = !message;
      var files = payload && Array.isArray(payload.files) ? payload.files : [];
      var values = reportValues();
      var working = values.filter(function (report) {
        return report.status === "working";
      });
      var matched = working.filter(function (report) {
        return fileMatches(report, files);
      });
      if (!matched.length && !files.length && working.length === 1) matched = working;
      for (var i = 0; i < matched.length; i++) {
        matched[i].hmrMessage = message;
        if (status === "applied") pulse(matched[i]);
      }
      if (hmrClearTimer) clearTimeout(hmrClearTimer);
      if (status === "applied") {
        hmrClearTimer = setTimeout(function () {
          options.hmrState.hidden = true;
        }, 4500);
      }
      render();
    }

    function clear() {
      reports = {};
      focusedId = null;
      if (hmrClearTimer) clearTimeout(hmrClearTimer);
      options.highlightLayer.innerHTML = "";
      render();
    }

    return {
      clear: clear,
      handleHmr: handleHmr,
      refreshHighlights: refreshHighlights,
      render: render,
      replace: replace,
      upsert: upsert,
    };
  }

  root.ClayLiveUiTargetReports = { create: create };
})(typeof globalThis !== "undefined" ? globalThis : this);
