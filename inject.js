// Clay Chrome Extension - Page Injection Script
// Injected into target tabs (not Clay tabs) to capture console logs and network requests.
// Runs in MAIN world (page context) so it can intercept console and fetch.

(function () {
  function emitHmr(status, payload) {
    document.documentElement.setAttribute("data-clay-live-ui-hmr", status);
    window.postMessage({
      source: "clay-live-ui-hmr",
      status: status,
      payload: payload || null,
      at: Date.now()
    }, location.origin);
  }

  function hmrFiles(payload) {
    var updates = payload && Array.isArray(payload.updates) ? payload.updates : [];
    var files = [];
    for (var i = 0; i < updates.length && files.length < 30; i++) {
      var path = updates[i] && (updates[i].path || updates[i].acceptedPath);
      if (path && files.indexOf(path) === -1) files.push(String(path).slice(0, 700));
    }
    return files;
  }

  function installHmrBridge() {
    if (window.__clay_hmr_bridge_installed) return;
    var viteDetected = !!window.__vite_plugin_react_preamble_installed__;
    if (!viteDetected) {
      var scripts = document.scripts || [];
      for (var i = 0; i < scripts.length; i++) {
        if (String(scripts[i].src || "").indexOf("/@vite/client") !== -1) {
          viteDetected = true;
          break;
        }
      }
    }
    if (!viteDetected && window.performance && performance.getEntriesByType) {
      var resources = performance.getEntriesByType("resource");
      for (var j = 0; j < resources.length; j++) {
        if (String(resources[j].name || "").indexOf("/@vite/client") !== -1) {
          viteDetected = true;
          break;
        }
      }
    }
    if (!viteDetected) return;
    window.__clay_hmr_bridge_installed = true;
    import("/@vite/client").then(function (viteClient) {
      if (!viteClient || typeof viteClient.createHotContext !== "function") {
        emitHmr("unavailable", { engine: "vite" });
        return;
      }
      var hot = viteClient.createHotContext("/__clay_live_ui_hmr__");
      hot.on("vite:beforeUpdate", function (payload) {
        emitHmr("applying", { engine: "vite", files: hmrFiles(payload) });
      });
      hot.on("vite:afterUpdate", function (payload) {
        emitHmr("applied", { engine: "vite", files: hmrFiles(payload) });
      });
      hot.on("vite:beforeFullReload", function () {
        emitHmr("reload", {
          engine: "vite",
          message: "This edit crossed a Fast Refresh boundary."
        });
      });
      hot.on("vite:invalidate", function (payload) {
        emitHmr("reload", {
          engine: "vite",
          message: payload && payload.message ?
            String(payload.message).slice(0, 500) : "A module invalidated its refresh boundary."
        });
      });
      hot.on("vite:error", function (payload) {
        var error = payload && payload.err ? payload.err : payload;
        emitHmr("error", {
          engine: "vite",
          message: error && error.message ?
            String(error.message).slice(0, 700) : "Fast Refresh failed."
        });
      });
      hot.on("vite:ws:disconnect", function () {
        emitHmr("disconnected", { engine: "vite" });
      });
      hot.on("vite:ws:connect", function () {
        emitHmr("ready", { engine: "vite" });
      });
      emitHmr("ready", { engine: "vite" });
    }).catch(function () {
      window.__clay_hmr_bridge_installed = false;
      emitHmr("unavailable", { engine: "vite" });
    });
  }

  // Guard against double injection
  if (window.__clay_injected) {
    installHmrBridge();
    return;
  }
  window.__clay_injected = true;
  installHmrBridge();

  // --- Console capture ---
  var CONSOLE_BUFFER_MAX = 200;
  window.__clay_console_buffer = [];

  var origConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
  };

  function captureConsole(level, args) {
    var text = "";
    for (var i = 0; i < args.length; i++) {
      if (i > 0) text += " ";
      try {
        text += typeof args[i] === "string" ? args[i] : JSON.stringify(args[i]);
      } catch (e) {
        text += String(args[i]);
      }
    }
    if (/\[Fast Refresh\]\s*rebuilding/i.test(text)) {
      emitHmr("applying", { engine: "next", files: [] });
    } else if (/\[Fast Refresh\]\s*done/i.test(text)) {
      emitHmr("applied", { engine: "next", files: [] });
    } else if (/Fast Refresh had to perform a full reload/i.test(text)) {
      emitHmr("reload", {
        engine: "next",
        message: "This edit crossed a Fast Refresh boundary."
      });
    }
    window.__clay_console_buffer.push({
      level: level,
      ts: Date.now(),
      text: text
    });
    if (window.__clay_console_buffer.length > CONSOLE_BUFFER_MAX) {
      window.__clay_console_buffer.shift();
    }
  }

  console.log = function () {
    captureConsole("log", arguments);
    origConsole.log.apply(console, arguments);
  };
  console.warn = function () {
    captureConsole("warn", arguments);
    origConsole.warn.apply(console, arguments);
  };
  console.error = function () {
    captureConsole("error", arguments);
    origConsole.error.apply(console, arguments);
  };
  console.info = function () {
    captureConsole("info", arguments);
    origConsole.info.apply(console, arguments);
  };

  // --- Error capture ---
  window.addEventListener("error", function (event) {
    window.__clay_console_buffer.push({
      level: "error",
      ts: Date.now(),
      text: "[Uncaught] " + (event.message || "") + (event.filename ? " at " + event.filename + ":" + event.lineno : "")
    });
    if (window.__clay_console_buffer.length > CONSOLE_BUFFER_MAX) {
      window.__clay_console_buffer.shift();
    }
  });

  window.addEventListener("unhandledrejection", function (event) {
    var reason = "";
    try {
      reason = event.reason && event.reason.message ? event.reason.message : String(event.reason);
    } catch (e) {
      reason = "Unknown rejection";
    }
    window.__clay_console_buffer.push({
      level: "error",
      ts: Date.now(),
      text: "[Unhandled Promise Rejection] " + reason
    });
    if (window.__clay_console_buffer.length > CONSOLE_BUFFER_MAX) {
      window.__clay_console_buffer.shift();
    }
  });

  // --- Network capture ---
  var NETWORK_BUFFER_MAX = 100;
  window.__clay_network_buffer = [];

  // Intercept fetch
  var origFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    var url = "";
    var method = "GET";
    try {
      if (typeof args[0] === "string") {
        url = args[0];
      } else if (args[0] && args[0].url) {
        url = args[0].url;
        method = (args[0].method || "GET").toUpperCase();
      }
      if (args[1] && args[1].method) {
        method = args[1].method.toUpperCase();
      }
    } catch (e) {
      // ignore
    }
    var startTime = Date.now();
    return origFetch.apply(this, args).then(function (response) {
      window.__clay_network_buffer.push({
        method: method,
        url: url,
        status: response.status,
        statusText: response.statusText,
        duration: Date.now() - startTime,
        ts: startTime
      });
      if (window.__clay_network_buffer.length > NETWORK_BUFFER_MAX) {
        window.__clay_network_buffer.shift();
      }
      return response;
    }).catch(function (err) {
      window.__clay_network_buffer.push({
        method: method,
        url: url,
        status: 0,
        statusText: "",
        duration: Date.now() - startTime,
        ts: startTime,
        error: err.message || "Network error"
      });
      if (window.__clay_network_buffer.length > NETWORK_BUFFER_MAX) {
        window.__clay_network_buffer.shift();
      }
      throw err;
    });
  };

  // Intercept XMLHttpRequest
  var origXHROpen = XMLHttpRequest.prototype.open;
  var origXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._clay_method = (method || "GET").toUpperCase();
    this._clay_url = url || "";
    this._clay_start = 0;
    return origXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    xhr._clay_start = Date.now();
    xhr.addEventListener("loadend", function () {
      window.__clay_network_buffer.push({
        method: xhr._clay_method || "GET",
        url: xhr._clay_url || "",
        status: xhr.status,
        statusText: xhr.statusText,
        duration: Date.now() - xhr._clay_start,
        ts: xhr._clay_start
      });
      if (window.__clay_network_buffer.length > NETWORK_BUFFER_MAX) {
        window.__clay_network_buffer.shift();
      }
    });
    return origXHRSend.apply(this, arguments);
  };
})();
