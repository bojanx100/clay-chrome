(function (root) {
  function createRecovery(chromeApi, options) {
    options = options || {};
    var getPort = options.getPort || function () { return null; };
    var isClayUrl = options.isClayUrl || function () { return false; };
    var setTimer = options.setTimer || setTimeout;
    var logger = options.logger || console;
    var scheduleTimer = null;

    function run() {
      chromeApi.tabs.query({}, function (tabs) {
        var candidates = 0;
        var injections = 0;
        for (var i = 0; i < tabs.length; i++) {
          var tab = tabs[i];
          var tabId = Number(tab && tab.id);
          if (!tabId || !isClayUrl(tab.url) || getPort(tabId)) continue;
          candidates++;
          chromeApi.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content.js"],
          }, function () {
            var error = chromeApi.runtime.lastError;
            if (error && logger && logger.warn) {
              logger.warn("[clay-ext] bridge recovery injection failed:", error.message);
            }
          });
          injections++;
        }
        if (injections && logger && logger.log) {
          logger.log("[clay-ext] bridge recovery injected " + injections +
            " disconnected Clay tab(s) from " + candidates + " candidate(s)");
        }
      });
    }

    function schedule(delayMs) {
      if (scheduleTimer !== null) return false;
      var delay = delayMs === undefined ? 400 : Math.max(0, delayMs);
      scheduleTimer = setTimer(function () {
        scheduleTimer = null;
        run();
      }, delay);
      return true;
    }

    return {
      run: run,
      schedule: schedule,
    };
  }

  function install(chromeApi, options) {
    options = options || {};
    var recovery = createRecovery(chromeApi, options);
    chromeApi.runtime.onInstalled.addListener(function () {
      recovery.schedule(0);
    });
    chromeApi.runtime.onStartup.addListener(function () {
      recovery.schedule(0);
    });
    recovery.schedule(options.initialDelayMs);
    return recovery;
  }

  root.ClayContentBridgeRecovery = {
    createRecovery: createRecovery,
    install: install,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayContentBridgeRecovery;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
