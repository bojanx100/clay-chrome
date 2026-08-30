(function (root) {
  function selectorCandidates(element) {
    var selectors = [];
    if (element.id) selectors.push("#" + CSS.escape(element.id));
    var testId = element.getAttribute("data-testid");
    if (testId) selectors.push('[data-testid="' + CSS.escape(testId) + '"]');
    var name = element.getAttribute("name");
    if (name) {
      selectors.push(element.tagName.toLowerCase() +
        '[name="' + CSS.escape(name) + '"]');
    }
    var path = [];
    var current = element;
    while (current && current.nodeType === 1 &&
        current !== document.documentElement && path.length < 5) {
      var part = current.tagName.toLowerCase();
      var parent = current.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (child) {
          return child.tagName === current.tagName;
        });
        if (siblings.length > 1) {
          part += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
        }
      }
      path.unshift(part);
      current = parent;
    }
    if (path.length) selectors.push(path.join(" > "));
    return selectors.slice(0, 8);
  }

  function safeText(element) {
    var tag = element && element.tagName ? element.tagName.toLowerCase() : "";
    if (!element || tag === "input" || tag === "textarea" || tag === "select") {
      return null;
    }
    var text = (element.innerText || element.textContent || "")
      .replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 500) : null;
  }

  function selectionPacket(element, documentGeneration) {
    var rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || null,
      text: safeText(element),
      accessibleName: (element.getAttribute("aria-label") ||
        element.getAttribute("title") || "").slice(0, 300) || null,
      route: location.pathname + location.search + location.hash,
      documentGeneration: documentGeneration,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      selectors: selectorCandidates(element),
      component: null,
    };
  }

  function trimPath(value) {
    return value.length > 1 ? value.replace(/\/+$/, "") : value;
  }

  function routeFragment(hash) {
    var value = String(hash || "");
    if (value.indexOf("#!") === 0) value = "#" + value.slice(2);
    if (value.indexOf("#/") !== 0) return "";
    return "#" + trimPath(value.slice(1).split("?")[0]);
  }

  function routeKey(value, hash) {
    return trimPath(String(value || "").split(/[?#]/)[0]) + routeFragment(hash);
  }

  function matchesRoute(locator) {
    var route = locator && typeof locator.route === "string" ? locator.route : "";
    if (!route) return true;
    var hashIndex = route.indexOf("#");
    return routeKey(route, hashIndex < 0 ? "" : route.slice(hashIndex)) ===
      routeKey(location.pathname, location.hash);
  }

  // Only the shapes `selectorCandidates` emits from a stable, author-supplied
  // attribute are trusted enough to skip text verification. Anything else --
  // including structural paths and any shape not recognized here -- is strict.
  // Enumerate what is trusted, never what is suspect: an unrecognized selector
  // must fail closed.
  var STABLE_PATTERN = /^(#|\[data-testid=")|^[^\s>\[]+\[name="/;

  function isStable(selector) {
    return STABLE_PATTERN.test(String(selector || ""));
  }

  function matchesRecording(element, locator, strict) {
    if (!element || !locator) return false;
    var tag = String(locator.tag || "");
    if (tag && element.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (!strict || typeof locator.text !== "string" || !locator.text) return true;
    var current = safeText(element);
    if (!current) return false;
    return current.indexOf(locator.text) === 0 ||
      locator.text.indexOf(current) === 0;
  }

  function resolveElement(locator) {
    if (!matchesRoute(locator)) return null;
    var selectors = locator && Array.isArray(locator.selectors) ?
      locator.selectors : [];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var found = document.querySelectorAll(selectors[i]);
        // A selector matching several elements is ambiguous no matter how
        // stable it looks -- `input[name="x"]` is a radio group by design --
        // so verify text before accepting any of them.
        var strict = found.length > 1 || !isStable(selectors[i]);
        for (var j = 0; j < found.length; j++) {
          if (matchesRecording(found[j], locator, strict)) return found[j];
        }
      } catch (e) {}
    }
    return null;
  }

  function screenshotMasks() {
    var selector = "input,textarea,select,[contenteditable]:not([contenteditable=false])," +
      "video,canvas,iframe,embed,object,[data-live-ui-never-capture]";
    var nodes = document.querySelectorAll(selector);
    var masks = [];
    for (var i = 0; i < nodes.length && masks.length < 256; i++) {
      var rect = nodes[i].getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 ||
          rect.bottom <= 0 || rect.right <= 0 ||
          rect.top >= innerHeight || rect.left >= innerWidth) continue;
      masks.push({
        x: Math.max(0, rect.left),
        y: Math.max(0, rect.top),
        width: Math.min(innerWidth, rect.right) - Math.max(0, rect.left),
        height: Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top),
      });
    }
    return masks;
  }

  root.ClayLiveUiTargetContext = {
    resolveElement: resolveElement,
    selectionPacket: selectionPacket,
    screenshotMasks: screenshotMasks,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
