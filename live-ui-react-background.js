(function (root) {
  function inspectReactComponent(chromeApi, pairing, payload, callback) {
    var selectors = payload && Array.isArray(payload.selectors) ?
      payload.selectors.slice(0, 8).map(function (value) {
        return String(value || "").slice(0, 500);
      }) : [];
    chromeApi.scripting.executeScript({
      target: { tabId: pairing.targetTabId },
      world: "MAIN",
      args: [selectors],
      func: function (selectorCandidates) {
        function selectedElement() {
          for (var i = 0; i < selectorCandidates.length; i++) {
            try {
              var match = document.querySelector(selectorCandidates[i]);
              if (match) return match;
            } catch (e) {}
          }
          return null;
        }

        function fiberFor(element) {
          var keys = Object.keys(element || {});
          for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf("__reactFiber$") === 0 ||
                keys[i].indexOf("__reactInternalInstance$") === 0) {
              return element[keys[i]];
            }
          }
          return null;
        }

        function componentName(type) {
          if (!type) return "";
          if (typeof type === "function") {
            return type.displayName || type.name || "";
          }
          if (typeof type === "object") {
            if (type.displayName) return type.displayName;
            if (type.render) return componentName(type.render);
            if (type.type) return componentName(type.type);
          }
          return "";
        }

        function sourceFor(fiber) {
          var candidates = [
            fiber && fiber._debugSource,
            fiber && fiber.type && fiber.type._debugSource,
            fiber && fiber.elementType && fiber.elementType._debugSource,
          ];
          for (var i = 0; i < candidates.length; i++) {
            if (candidates[i] && candidates[i].fileName) return candidates[i];
          }
          return null;
        }

        function safeSourceFile(value) {
          var source = String(value || "").replace(/\\/g, "/").split(/[?#]/)[0];
          try {
            if (/^(?:https?|file):/i.test(source)) source = new URL(source).pathname;
          } catch (e) {}
          var parts = source.split("/").filter(function (part) {
            return part && part !== "." && part !== "..";
          });
          var markers = ["src", "app", "pages", "components"];
          var markerIndex = -1;
          for (var i = 0; i < parts.length; i++) {
            if (markers.indexOf(parts[i]) !== -1) {
              markerIndex = i;
              break;
            }
          }
          if (markerIndex !== -1) parts = parts.slice(markerIndex);
          else if (parts.length > 6) parts = parts.slice(parts.length - 6);
          return parts.join("/").slice(0, 700);
        }

        var element = selectedElement();
        var fiber = fiberFor(element);
        if (!fiber) return null;
        var chain = [];
        var chosenName = "";
        var chosenSource = null;
        var cursor = fiber;
        var depth = 0;
        while (cursor && depth < 40) {
          var name = componentName(cursor.type || cursor.elementType);
          if (name && chain.indexOf(name) === -1) {
            chain.push(name);
            if (!chosenName) chosenName = name;
          }
          var source = sourceFor(cursor);
          if (!chosenSource && source) chosenSource = source;
          cursor = cursor.return;
          depth++;
        }
        if (!chosenName) return null;
        var normalizedSource = chosenSource ? {
          file: safeSourceFile(chosenSource.fileName),
          line: Number(chosenSource.lineNumber) || null,
          column: Number(chosenSource.columnNumber) || null,
        } : null;
        if (normalizedSource && !normalizedSource.file) normalizedSource = null;
        return {
          framework: "react",
          name: chosenName.slice(0, 160),
          chain: chain.slice(0, 8),
          source: normalizedSource,
        };
      },
    }, function (results) {
      var error = chromeApi.runtime.lastError;
      if (error) {
        callback({ ok: false, error: error.message });
        return;
      }
      var component = results && results[0] ? results[0].result : null;
      callback({ ok: true, component: component || null });
    });
  }

  root.ClayLiveUiReactBackground = {
    inspectReactComponent: inspectReactComponent,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiReactBackground;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
