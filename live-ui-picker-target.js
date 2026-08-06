(function (root) {
  function resolve(chromeApi, message, publicTab, callback) {
    var requestedId = Number(message && message.targetTabId);
    if (requestedId) {
      chromeApi.tabs.get(requestedId, function (tab) {
        var error = chromeApi.runtime.lastError;
        callback(error ? null : publicTab(tab));
      });
      return;
    }
    chromeApi.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      callback(tabs && tabs[0] ? publicTab(tabs[0]) : null);
    });
  }

  root.ClayLiveUiPickerTarget = { resolve: resolve };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiPickerTarget;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
