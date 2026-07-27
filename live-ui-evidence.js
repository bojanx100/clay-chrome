(function (root) {
  var MAX_MASKS = 256;

  function capturePacket(payload) {
    var viewport = payload && payload.viewport;
    if (!viewport) return null;
    var width = Number(viewport.width);
    var height = Number(viewport.height);
    var scrollX = Number(viewport.scrollX);
    var scrollY = Number(viewport.scrollY);
    if (!isFinite(width) || !isFinite(height) || width < 1 || height < 1 ||
        width > 20000 || height > 20000 ||
        !isFinite(scrollX) || !isFinite(scrollY)) return null;
    var masks = [];
    var inputMasks = Array.isArray(payload.masks) ? payload.masks : [];
    for (var i = 0; i < inputMasks.length && masks.length < MAX_MASKS; i++) {
      var mask = inputMasks[i] || {};
      var x = Number(mask.x);
      var y = Number(mask.y);
      var maskWidth = Number(mask.width);
      var maskHeight = Number(mask.height);
      if (!isFinite(x) || !isFinite(y) || !isFinite(maskWidth) ||
          !isFinite(maskHeight) || maskWidth <= 0 || maskHeight <= 0) continue;
      masks.push({ x: x, y: y, width: maskWidth, height: maskHeight });
    }
    return {
      documentGeneration: String(payload.documentGeneration || ""),
      viewport: {
        width: width,
        height: height,
        scrollX: scrollX,
        scrollY: scrollY,
      },
      masks: masks,
    };
  }

  function base64Bytes(data) {
    var binary = atob(data);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function bytesBase64(bytes) {
    var parts = [];
    for (var i = 0; i < bytes.length; i += 32768) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)));
    }
    return btoa(parts.join(""));
  }

  function maskPng(data, packet, callback) {
    if (typeof OffscreenCanvas === "undefined" ||
        typeof createImageBitmap !== "function") {
      callback({ ok: false, error: "Secure screenshot masking is unavailable" });
      return;
    }
    var blob = new Blob([base64Bytes(data)], { type: "image/png" });
    createImageBitmap(blob).then(function (bitmap) {
      var canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      var context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      context.fillStyle = "#17151d";
      var scaleX = bitmap.width / packet.viewport.width;
      var scaleY = bitmap.height / packet.viewport.height;
      for (var i = 0; i < packet.masks.length; i++) {
        var mask = packet.masks[i];
        context.fillRect(
          Math.floor(mask.x * scaleX) - 2,
          Math.floor(mask.y * scaleY) - 2,
          Math.ceil(mask.width * scaleX) + 4,
          Math.ceil(mask.height * scaleY) + 4
        );
      }
      bitmap.close();
      return canvas.convertToBlob({ type: "image/png" });
    }).then(function (maskedBlob) {
      return maskedBlob.arrayBuffer();
    }).then(function (buffer) {
      callback({
        ok: true,
        mediaType: "image/png",
        data: bytesBase64(new Uint8Array(buffer)),
      });
    }).catch(function () {
      callback({ ok: false, error: "Secure screenshot masking failed" });
    });
  }

  function captureMaskedScreenshot(chromeApi, pairing, payload, callback) {
    var packet = capturePacket(payload);
    if (!packet || !packet.documentGeneration) {
      callback({ ok: false, error: "Screenshot context is invalid" });
      return;
    }
    var debuggee = { tabId: pairing.targetTabId };
    chromeApi.debugger.attach(debuggee, "1.3", function () {
      var attachError = chromeApi.runtime.lastError;
      if (attachError) {
        callback({ ok: false, error: attachError.message });
        return;
      }
      chromeApi.debugger.sendCommand(debuggee, "Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      }, function (result) {
        var captureError = chromeApi.runtime.lastError;
        if (captureError || !result || !result.data) {
          chromeApi.debugger.detach(debuggee, function () {
            void chromeApi.runtime.lastError;
          });
          callback({
            ok: false,
            error: captureError ? captureError.message : "Screenshot capture failed",
          });
          return;
        }
        chromeApi.scripting.executeScript({
          target: { tabId: pairing.targetTabId },
          func: function () {
            var host = document.querySelector("clay-live-ui[data-clay-live-ui-overlay]");
            return {
              documentGeneration: host ?
                host.getAttribute("data-clay-live-ui-generation") : "",
              width: window.innerWidth,
              height: window.innerHeight,
              scrollX: window.scrollX,
              scrollY: window.scrollY,
            };
          },
        }, function (results) {
          var current = results && results[0] ? results[0].result : null;
          var viewport = packet.viewport;
          chromeApi.debugger.detach(debuggee, function () {
            void chromeApi.runtime.lastError;
          });
          if (!current ||
              current.documentGeneration !== packet.documentGeneration ||
              current.width !== viewport.width ||
              current.height !== viewport.height ||
              current.scrollX !== viewport.scrollX ||
              current.scrollY !== viewport.scrollY) {
            callback({
              ok: false,
              error: "The page moved during capture. Try the report again.",
            });
            return;
          }
          maskPng(result.data, packet, callback);
        });
      });
    });
  }

  function captureDiagnostics(chromeApi, pairing, callback) {
    chromeApi.scripting.executeScript({
      target: { tabId: pairing.targetTabId },
      files: ["inject.js"],
      world: "MAIN",
    }, function () {
      var injectionError = chromeApi.runtime.lastError;
      if (injectionError) {
        callback({ ok: false, error: injectionError.message });
        return;
      }
      chromeApi.scripting.executeScript({
        target: { tabId: pairing.targetTabId },
        world: "MAIN",
        func: function () {
          function safeUrl(value) {
            try {
              var parsed = new URL(String(value || ""), location.href);
              return parsed.origin + parsed.pathname;
            } catch (e) {
              return String(value || "").split(/[?#]/)[0];
            }
          }
          var consoleTail = (window.__clay_console_buffer || []).slice(-24)
            .map(function (entry) {
              return {
                level: String(entry.level || "log").slice(0, 20),
                text: String(entry.text || "").slice(0, 600),
              };
            });
          var networkTail = (window.__clay_network_buffer || []).slice(-40)
            .map(function (entry) {
              return {
                method: String(entry.method || "GET").slice(0, 12),
                url: safeUrl(entry.url).slice(0, 1200),
                status: Number(entry.status) || 0,
                duration: Math.max(0, Number(entry.duration) || 0),
                error: entry.error ? String(entry.error).slice(0, 300) : null,
              };
            });
          return { console: consoleTail, network: networkTail };
        },
      }, function (results) {
        var readError = chromeApi.runtime.lastError;
        var diagnostics = results && results[0] ? results[0].result : null;
        if (readError || !diagnostics) {
          callback({
            ok: false,
            error: readError ? readError.message : "Page diagnostics are unavailable",
          });
          return;
        }
        callback({ ok: true, diagnostics: diagnostics });
      });
    });
  }

  root.ClayLiveUiEvidence = {
    captureDiagnostics: captureDiagnostics,
    captureMaskedScreenshot: captureMaskedScreenshot,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiEvidence;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
