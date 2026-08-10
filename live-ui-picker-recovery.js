(function (root) {
  function safeMetadata(value) {
    var metadata = value || {};
    var clayTabId = Number(metadata.clayTabId);
    var targetTabId = Number(metadata.targetTabId);
    var projectSlug = String(metadata.projectSlug || "");
    var sessionId = metadata.sessionId;
    if (!clayTabId || !targetTabId || clayTabId === targetTabId ||
        !/^[a-z0-9_-]+$/.test(projectSlug) ||
        sessionId === undefined || sessionId === null ||
        String(sessionId).length > 200) return null;
    return {
      clayTabId: clayTabId,
      targetTabId: targetTabId,
      projectSlug: projectSlug,
      sessionId: sessionId,
      starting: false,
    };
  }

  function createRecovery(options) {
    var pending = {};
    var now = options.now || function () { return Date.now(); };
    var retryWindowMs = Number(options.retryWindowMs) > 0 ?
      Number(options.retryWindowMs) : 15000;
    var scheduleRetry = options.scheduleRetry || function (callback) {
      return setTimeout(callback, 250);
    };
    var cancelRetry = options.cancelRetry || function (timer) {
      clearTimeout(timer);
    };

    function cancelScheduled(recovery) {
      if (!recovery || !recovery.retryTimer) return;
      cancelRetry(recovery.retryTimer);
      recovery.retryTimer = null;
    }

    function remove(targetTabId) {
      cancelScheduled(pending[String(targetTabId)]);
      delete pending[String(targetTabId)];
    }

    function fail(recovery, message) {
      remove(recovery.targetTabId);
      if (options.onFailure) options.onFailure(message);
    }

    function waitForRefresh(recovery, message) {
      recovery.failureMessage = message;
      if (now() >= recovery.expiresAt) {
        fail(recovery, recovery.failureMessage);
        return;
      }
      if (recovery.retryTimer) return;
      recovery.retryTimer = scheduleRetry(function () {
        recovery.retryTimer = null;
        if (pending[String(recovery.targetTabId)] !== recovery) return;
        options.requestIdentity(recovery.clayTabId);
        attempt(recovery);
      });
    }

    function attempt(recovery) {
      if (!recovery || recovery.starting) return;
      cancelScheduled(recovery);
      var identity = options.getIdentity(recovery.clayTabId);
      var port = options.getPort(recovery.clayTabId);
      if (!identity || !port) {
        options.requestIdentity(recovery.clayTabId);
        waitForRefresh(
          recovery, "The previous Clay connection is no longer available.");
        return;
      }
      var project = options.projectBySlug(
        identity.projects || [], recovery.projectSlug);
      if (!project) {
        waitForRefresh(
          recovery, "The previous Live UI project is no longer available.");
        return;
      }
      if (!project.sessionsLoaded) {
        options.loadProject({
          controlTabId: recovery.clayTabId,
          projectSlug: recovery.projectSlug,
        }, function (result) {
          if (!result || result.ok === false) {
            recovery.failureMessage = result && result.error ? result.error :
              "Clay could not reload the previous chat.";
          }
        });
        waitForRefresh(recovery,
          recovery.failureMessage || "Clay could not reload the previous chat.");
        return;
      }
      if (!options.findSelection(
        identity, recovery.projectSlug, recovery.sessionId)) {
        waitForRefresh(
          recovery, "The previous Live UI chat is no longer available.");
        return;
      }
      recovery.starting = true;
      options.startPair({
        controlTabId: recovery.clayTabId,
        projectSlug: recovery.projectSlug,
        sessionId: recovery.sessionId,
        targetTabId: recovery.targetTabId,
        attachWorkspace: true,
        reconnectServer: true,
      }, function (result) {
        if (!result || result.ok === false) {
          recovery.starting = false;
          fail(recovery, result && result.error ? result.error :
            "Clay could not restore the previous Live UI connection.");
          return;
        }
        remove(recovery.targetTabId);
      });
    }

    function retry() {
      var ids = Object.keys(pending);
      for (var i = 0; i < ids.length; i++) attempt(pending[ids[i]]);
    }

    function recover(metadata) {
      var recovery = safeMetadata(metadata);
      if (!recovery) return false;
      recovery.expiresAt = now() + retryWindowMs;
      recovery.failureMessage = null;
      recovery.retryTimer = null;
      pending[String(recovery.targetTabId)] = recovery;
      attempt(recovery);
      return true;
    }

    return { recover: recover, retry: retry };
  }

  root.ClayLiveUiPickerRecovery = { createRecovery: createRecovery };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiPickerRecovery;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
