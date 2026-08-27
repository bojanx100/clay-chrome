(function () {
var previousBridge = window.__clayExtensionBridge;
if (previousBridge && typeof previousBridge.stop === "function") {
  try { previousBridge.stop(); } catch (e) {}
}

// Clay Chrome Extension - Content Script
// Injected into Clay tabs. Bridges background.js <-> Clay page.
// Uses a long-lived port connection for reliable bidirectional messaging.
// Auto-reconnects when the MV3 service worker sleeps and the port drops.

var port = null;
var reconnectTimer = null;
var stopped = false;

function connectPort() {
  if (stopped) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  var connectedPort = null;
  try {
    connectedPort = chrome.runtime.connect({ name: "clay-tab" });
    port = connectedPort;
    console.log("[clay-ext] port connected");
  } catch (e) {
    console.log("[clay-ext] port connect failed:", e.message);
    port = null;
    scheduleReconnect();
    return;
  }

  // Messages from background -> Clay page
  connectedPort.onMessage.addListener(function (msg) {
    if (stopped || port !== connectedPort) return;
    window.postMessage(
      {
        source: "clay-chrome-extension",
        payload: msg,
      },
      "*"
    );
  });

  connectedPort.onDisconnect.addListener(function () {
    if (stopped || port !== connectedPort) return;
    var err = chrome.runtime.lastError;
    console.log("[clay-ext] port disconnected", err ? err.message : "");
    port = null;
    // Notify Clay page that extension disconnected
    window.postMessage(
      {
        source: "clay-chrome-extension",
        payload: {
          type: "clay_ext_disconnected",
          reason: err && err.message ? String(err.message).slice(0, 160) : "port_disconnected",
        },
      },
      "*"
    );
    // Auto-reconnect after brief delay (service worker may need to wake up)
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(function () {
    reconnectTimer = null;
    if (!port) {
      console.log("[clay-ext] attempting reconnect...");
      connectPort();
    }
  }, 1000);
}

function ensurePort() {
  if (stopped) return false;
  if (port) return true;
  connectPort();
  return !!port;
}

function handlePageMessage(event) {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== "clay-page") return;

  if (ensurePort()) {
    try {
      port.postMessage(event.data.payload);
    } catch (e) {
      // Port broke mid-send, reconnect and retry once
      port = null;
      connectPort();
      if (port) {
        try { port.postMessage(event.data.payload); } catch (e2) {}
      }
    }
  }
}

function stopBridge() {
  if (stopped) return;
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  window.removeEventListener("message", handlePageMessage);
  var oldPort = port;
  port = null;
  if (oldPort && typeof oldPort.disconnect === "function") {
    try { oldPort.disconnect(); } catch (e) {}
  }
}

window.__clayExtensionBridge = { stop: stopBridge };
connectPort();

// Relay messages from Clay page to background.js
window.addEventListener("message", handlePageMessage);
})();
