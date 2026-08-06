(function (root) {
  var RETRY_AFTER_MS = 5000;

  function isClayProjectUrl(url) {
    try {
      var parsed = new URL(url);
      return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        /^\/p\/[a-z0-9_-]+\/?$/.test(parsed.pathname);
    } catch (error) {
      return false;
    }
  }

  function createDiscovery(chromeApi, getPort, requestIdentity) {
    var attemptedAt = {};

    function discover(callback) {
      chromeApi.tabs.query({}, function (tabs) {
        var now = Date.now();
        var candidateCount = 0;
        var injectionCount = 0;
        for (var i = 0; i < tabs.length; i++) {
          var tab = tabs[i];
          var tabId = Number(tab && tab.id);
          if (!tabId || !isClayProjectUrl(tab.url)) continue;
          candidateCount += 1;
          if (getPort(tabId)) {
            requestIdentity(tabId);
            continue;
          }
          if (attemptedAt[tabId] &&
              now - attemptedAt[tabId] < RETRY_AFTER_MS) continue;
          attemptedAt[tabId] = now;
          injectionCount += 1;
          chromeApi.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content.js"],
          }, function () {
            if (chromeApi.runtime.lastError) return;
          });
        }
        callback({
          candidateCount: candidateCount,
          injectionCount: injectionCount,
        });
      });
    }

    function handlePortConnected(tabId) {
      delete attemptedAt[tabId];
    }

    function handlePortDisconnected(tabId) {
      delete attemptedAt[tabId];
    }

    function handleTabUpdated(tabId, changeInfo) {
      if (changeInfo && changeInfo.status === "loading") {
        delete attemptedAt[tabId];
      }
    }

    return {
      discover: discover,
      handlePortConnected: handlePortConnected,
      handlePortDisconnected: handlePortDisconnected,
      handleTabUpdated: handleTabUpdated,
    };
  }

  root.ClayLiveUiPickerDiscovery = {
    createDiscovery: createDiscovery,
    isClayProjectUrl: isClayProjectUrl,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiPickerDiscovery;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
