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
    };
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
    selectionPacket: selectionPacket,
    screenshotMasks: screenshotMasks,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
