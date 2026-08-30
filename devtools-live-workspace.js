(function (root) {
  var SHOW_ALL_KEY = "liveUiShowAllWorkers";

  function element(id) {
    return document.getElementById(id);
  }

  function storagePreferences() {
    var area = root.chrome && root.chrome.storage ? root.chrome.storage.local : null;
    return {
      load: function (key, callback) {
        if (!area || !area.get) return callback(null);
        try {
          area.get([key], function (data) { callback(data ? data[key] : null); });
        } catch (error) {
          callback(null);
        }
      },
      save: function (key, value) {
        if (!area || !area.set) return;
        var record = {};
        record[key] = value;
        try {
          area.set(record);
        } catch (error) {}
      },
    };
  }

  function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#8b78ff";
  }

  function sourceFile(report) {
    var component = report && report.locator && report.locator.component;
    var source = component && component.source;
    if (!source || !source.file) return "";
    return source.file + (source.line ? ":" + source.line : "");
  }

  function workerLabel(report) {
    return report && report.worker && report.worker.label || "Clay worker";
  }

  function reportTitle(report) {
    return String(report && (report.title || report.text || report.summary) ||
      "UI change").replace(/\s+/g, " ").trim().slice(0, 180);
  }

  function reportMessage(report) {
    return String(report && (report.message || report.statusMessage ||
      report.latestMessage) || "").replace(/\s+/g, " ").trim().slice(0, 500);
  }

  function statusLabel(status) {
    if (status === "needs_input") return "Needs input";
    if (status === "completed") return "Ready to test";
    if (status === "failed") return "Failed";
    return "Working";
  }

  function aggregateLabel(snapshot) {
    var counts = snapshot.counts || {};
    if (!snapshot.connected) return "Disconnected";
    if (snapshot.aggregateStatus === "needs_input") return "Needs input";
    if (snapshot.aggregateStatus === "failed") return "A change failed";
    if (snapshot.aggregateStatus === "working") {
      return (counts.working || 1) + ((counts.working || 1) === 1 ?
        " change in progress" : " changes in progress");
    }
    if (snapshot.aggregateStatus === "completed") return "Ready to test";
    return "Ready";
  }

  function aggregateKind(snapshot) {
    if (!snapshot.connected) return "disconnected";
    return snapshot.aggregateStatus || "ready";
  }

  function create(options) {
    var refs = {
      root: element("liveWorkspace"),
      session: element("liveSession"),
      project: element("liveProject"),
      dot: element("liveAggregateDot"),
      aggregateLabel: element("liveAggregateLabel"),
      selectedCard: element("selectedCard"),
      emptySelectionCard: element("emptySelectionCard"),
      selectedTitle: element("selectedTitle"),
      selectedSource: element("selectedSource"),
      selectedElement: element("selectedElement"),
      selectedChain: element("selectedChain"),
      clearSelection: element("clearSelectionButton"),
      pick: element("pickButton"),
      hmrStatus: element("hmrStatus"),
      hmrLabel: element("hmrLabel"),
      reportCount: element("reportCount"),
      reportList: element("reportList"),
      emptyReports: element("emptyReports"),
      followupTarget: element("followupTarget"),
      followupLabel: element("followupLabel"),
      newIssue: element("newIssueButton"),
      input: element("reportInput"),
      attachmentList: element("attachmentList"),
      error: element("reportError"),
      report: element("reportButton"),
      showAllWorkers: element("showAllWorkers"),
    };
    var snapshot = null;
    var preferences = options.preferences || storagePreferences();
    var showAllPreference = false;
    var showAllPending = false;
    var showAllBlocked = false;
    var showAllChosen = false;
    var actionError = "";
    var lastAcceptedSequence = null;
    var actionPending = false;
    var drafts = options.drafts || null;
    var draftKey = null;
    var draftLoadSequence = 0;
    var draftSaveTimer = null;
    var restoringDraft = false;
    var attachments = ClayLiveUiDevtoolsAttachments.create({
      container: refs.attachmentList,
      input: refs.input,
      onError: function (message) {
        actionError = message;
        render(snapshot);
      },
      onChange: function () {
        actionError = "";
        scheduleDraftSave();
        if (snapshot) renderComposer();
      },
    });

    function draftValue() {
      return {
        text: String(refs.input.value || ""),
        attachments: attachments.snapshot(),
        acceptedSequence: Number(snapshot && snapshot.acceptedSequence || 0),
      };
    }

    function hasDraftContent(value) {
      var attachmentValue = value && value.attachments || {};
      return !!(value && value.text) ||
        !!(attachmentValue.images && attachmentValue.images.length) ||
        !!(attachmentValue.pastes && attachmentValue.pastes.length);
    }

    function saveDraft() {
      if (draftSaveTimer) clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
      if (!drafts || !draftKey || restoringDraft) return;
      var value = draftValue();
      if (hasDraftContent(value)) drafts.save(draftKey, value);
      else drafts.remove(draftKey);
    }

    function scheduleDraftSave() {
      if (!drafts || !draftKey || restoringDraft) return;
      if (draftSaveTimer) clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(saveDraft, 80);
    }

    function replaceDraft(value) {
      restoringDraft = true;
      refs.input.value = value && value.text || "";
      attachments.restore(value && value.attachments || {});
      restoringDraft = false;
      if (snapshot) renderComposer();
    }

    function clearDraft() {
      if (draftSaveTimer) clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
      var key = draftKey;
      replaceDraft(null);
      if (drafts && key) drafts.remove(key);
    }

    function setDraftKey(value) {
      var nextKey = value ? String(value) : null;
      if (nextKey === draftKey) return;
      saveDraft();
      draftKey = nextKey;
      var loadSequence = ++draftLoadSequence;
      replaceDraft(null);
      if (!drafts || !draftKey) return;
      drafts.load(draftKey, function (value) {
        if (loadSequence !== draftLoadSequence || !value) return;
        var accepted = Number(snapshot && snapshot.acceptedSequence || 0);
        var draftAccepted = Number(value.acceptedSequence || 0);
        if (snapshot && accepted > draftAccepted) {
          drafts.remove(draftKey);
          return;
        }
        lastAcceptedSequence = draftAccepted;
        replaceDraft(value);
      });
    }

    function setDraftRoute(pairing) {
      setDraftKey(pairing ? ["live-ui", pairing.targetTabId,
        pairing.projectSlug || "project", pairing.sessionId || "session"].join(":") : null);
    }

    function syncShowAll() {
      if (showAllPending || showAllBlocked) return;
      if (!snapshot || !snapshot.connected) return;
      if ((snapshot.showAllWorkers === true) === showAllPreference) return;
      showAllPending = true;
      run("report.showAll", { showAll: showAllPreference }, function (response) {
        showAllPending = false;
        showAllBlocked = !response || response.ok === false;
      });
    }

    function setShowAllPreference(value) {
      showAllPreference = value === true;
      showAllBlocked = false;
      refs.showAllWorkers.checked = showAllPreference;
      if (preferences) preferences.save(SHOW_ALL_KEY, showAllPreference);
      syncShowAll();
    }

    function focusedReport() {
      if (!snapshot || !snapshot.focusedId) return null;
      var reports = snapshot.reports || [];
      for (var i = 0; i < reports.length; i++) {
        if (reports[i].reportId === snapshot.focusedId) return reports[i];
      }
      return null;
    }

    function run(action, payload, callback) {
      actionError = "";
      options.command(action, payload || {}, function (response) {
        if (!response || response.ok === false) {
          actionError = response && response.error || "Clay did not complete that action.";
        } else if (response.pairingId) {
          render(response);
        }
        if (callback) callback(response || { ok: false });
        render(snapshot);
      });
    }

    function actionButton(label, className, handler) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "report-action" + (className ? " " + className : "");
      button.textContent = label;
      button.addEventListener("click", function (event) {
        if (event && event.stopPropagation) event.stopPropagation();
        handler(event);
      });
      return button;
    }

    function reportItem(report) {
      var item = document.createElement("article");
      item.className = "report-item" +
        (snapshot.focusedId === report.reportId ? " focused" : "");
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", "View " + reportTitle(report));
      item.style.setProperty("--worker-color", safeColor(
        report.worker && report.worker.color));
      function focusWorker() {
        run("report.focus", { reportId: report.reportId });
      }
      item.addEventListener("click", focusWorker);
      item.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        focusWorker();
      });

      var topline = document.createElement("div");
      topline.className = "report-topline";
      var worker = document.createElement("div");
      worker.className = "report-worker";
      worker.textContent = workerLabel(report);
      var status = document.createElement("div");
      status.className = "report-status " + (report.status || "working");
      status.textContent = statusLabel(report.status);
      topline.appendChild(worker);
      topline.appendChild(status);
      item.appendChild(topline);

      var title = document.createElement("div");
      title.className = "report-title";
      title.textContent = reportTitle(report);
      item.appendChild(title);

      var message = reportMessage(report);
      if (message) {
        var messageElement = document.createElement("div");
        messageElement.className = "report-message";
        messageElement.textContent = message;
        item.appendChild(messageElement);
      }

      var source = sourceFile(report);
      if (source) {
        var sourceElement = document.createElement("div");
        sourceElement.className = "report-source";
        sourceElement.textContent = source;
        item.appendChild(sourceElement);
      }

      if (report.hmrMessage) {
        var hmr = document.createElement("div");
        hmr.className = "report-hmr";
        hmr.textContent = report.hmrMessage;
        item.appendChild(hmr);
      }

      var actions = document.createElement("div");
      actions.className = "report-actions";
      actions.appendChild(actionButton("Add feedback", "", function () {
        focusWorker();
        refs.input.focus();
      }));
      if (report.status === "completed") {
        actions.appendChild(actionButton("Mark as done", "done", function () {
          run("report.dismiss", { reportId: report.reportId });
        }));
      }
      item.appendChild(actions);
      return item;
    }

    function renderSelection(value) {
      refs.selectedCard.classList[value ? "remove" : "add"]("hidden");
      refs.emptySelectionCard.classList[value ? "add" : "remove"]("hidden");
      if (!value) return;
      refs.selectedTitle.textContent = value.title || "Selected component";
      refs.selectedSource.textContent = value.source || "Source location unavailable";
      refs.selectedElement.textContent = value.element || "";
      refs.selectedChain.textContent = value.chain || "React component";
    }

    function renderHmr(value) {
      var visible = value && value.message;
      refs.hmrStatus.classList[visible ? "remove" : "add"]("hidden");
      if (!visible) return;
      refs.hmrStatus.className = "hmr-status " + (value.status || "");
      refs.hmrLabel.textContent = value.message;
    }

    function renderReports(values) {
      refs.reportList.innerHTML = "";
      for (var i = 0; i < values.length; i++) {
        refs.reportList.appendChild(reportItem(values[i]));
      }
      refs.reportCount.textContent = String(values.length);
      refs.emptyReports.classList[values.length ? "add" : "remove"]("hidden");
    }

    function renderComposer() {
      var focused = focusedReport();
      refs.followupTarget.classList[focused ? "remove" : "add"]("hidden");
      if (focused) refs.followupLabel.textContent = workerLabel(focused);
      var busy = !!(snapshot && snapshot.submitting) || actionPending;
      var connected = !!(snapshot && snapshot.connected);
      refs.input.disabled = !connected || busy;
      refs.report.disabled = !connected || busy;
      refs.pick.disabled = !connected || busy;
      refs.report.textContent = busy ? "Capturing…" : focused ? "Send feedback" : "Report";
      refs.error.textContent = actionError || snapshot && snapshot.composeError || "";
    }

    function render(nextSnapshot) {
      if (!nextSnapshot) return;
      snapshot = nextSnapshot;
      var accepted = Number(snapshot.acceptedSequence || 0);
      if (lastAcceptedSequence !== null && accepted > lastAcceptedSequence) {
        clearDraft();
      }
      lastAcceptedSequence = accepted;
      refs.session.textContent = snapshot.sessionLabel || "Connected chat";
      refs.project.textContent = snapshot.projectLabel || "Clay project";
      refs.dot.className = "live-aggregate-dot " + aggregateKind(snapshot);
      refs.aggregateLabel.textContent = aggregateLabel(snapshot);
      refs.pick.textContent = snapshot.selecting ? "Cancel picking" :
        snapshot.selection ? "Pick another component" : "Pick component";
      refs.pick.className = "pick-component-button" +
        (snapshot.selecting ? " selecting" : "");
      renderSelection(snapshot.selection);
      renderHmr(snapshot.hmr || {});
      renderReports(snapshot.reports || []);
      renderComposer();
      syncShowAll();
    }

    refs.showAllWorkers.addEventListener("change", function () {
      showAllChosen = true;
      setShowAllPreference(refs.showAllWorkers.checked === true);
    });
    if (preferences) {
      preferences.load(SHOW_ALL_KEY, function (value) {
        // A slow storage read must never clobber a choice the user already
        // made while it was in flight.
        if (showAllChosen || value !== true) return;
        setShowAllPreference(true);
      });
    }

    refs.pick.addEventListener("click", function () {
      run("selection.pick", {});
    });
    refs.clearSelection.addEventListener("click", function () {
      run("selection.clear", {});
    });
    refs.newIssue.addEventListener("click", function () {
      run("report.focus", { reportId: null });
      refs.input.focus();
    });
    refs.report.addEventListener("click", function () {
      var text = String(refs.input.value || "").trim();
      if (!text && !attachments.hasContent()) {
        actionError = "Describe the issue or paste supporting context first.";
        render(snapshot);
        return;
      }
      if (!text) text = "Review the pasted Live UI context and address the visible issue.";
      var focused = focusedReport();
      actionPending = true;
      render(snapshot);
      run("report.submit", {
        text: text,
        reportId: focused ? focused.reportId : null,
        attachments: attachments.payload(),
      }, function () {
        actionPending = false;
        render(snapshot);
      });
    });
    refs.input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        refs.report.click();
      }
    });
    refs.input.addEventListener("input", scheduleDraftSave);

    return {
      render: render,
      setDraftKey: setDraftKey,
      setDraftRoute: setDraftRoute,
      flushDraft: saveDraft,
      discardDraft: clearDraft,
      reset: function () {
        snapshot = null;
        actionError = "";
        actionPending = false;
        showAllPending = false;
        showAllBlocked = false;
        lastAcceptedSequence = null;
        refs.reportList.innerHTML = "";
      },
    };
  }

  root.ClayLiveUiDevtoolsWorkspace = { create: create };
})(typeof globalThis !== "undefined" ? globalThis : this);
