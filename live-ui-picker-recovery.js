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

    function remove(targetTabId) {
      delete pending[String(targetTabId)];
    }

    function fail(recovery, message) {
      remove(recovery.targetTabId);
      if (options.onFailure) options.onFailure(message);
    }

    function attempt(recovery) {
      if (!recovery || recovery.starting) return;
      var identity = options.getIdentity(recovery.clayTabId);
      var port = options.getPort(recovery.clayTabId);
      if (!identity || !port) {
        options.requestIdentity(recovery.clayTabId);
        return;
      }
      var project = options.projectBySlug(
        identity.projects || [], recovery.projectSlug);
      if (!project) {
        fail(recovery, "The previous Live UI project is no longer available.");
        return;
      }
      if (!project.sessionsLoaded) {
        options.loadProject({
          controlTabId: recovery.clayTabId,
          projectSlug: recovery.projectSlug,
        }, function (result) {
          if (!result || result.ok === false) {
            fail(recovery, result && result.error ? result.error :
              "Clay could not reload the previous chat.");
          }
        });
        return;
      }
      if (!options.findSelection(
        identity, recovery.projectSlug, recovery.sessionId)) {
        fail(recovery, "The previous Live UI chat is no longer available.");
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
