// Clay-owned browser tab grouping.
// Keeps MCP-created tabs visibly separate without changing user-created tabs.

(function (root) {
  var GROUP_TITLE = "Clay AI";
  var GROUP_COLOR = "purple";

  function create(chromeApi) {
    var queues = {};
    var running = {};

    function lastError() {
      var error = chromeApi.runtime && chromeApi.runtime.lastError;
      return error && error.message ? error.message : "";
    }

    function finish(windowKey, result) {
      var queue = queues[windowKey] || [];
      var item = queue.shift();
      if (item && item.callback) item.callback(result);
      running[windowKey] = false;
      if (queue.length > 0) process(windowKey);
      else delete queues[windowKey];
    }

    function styleNewGroup(windowKey, groupId) {
      chromeApi.tabGroups.update(groupId, {
        title: GROUP_TITLE,
        color: GROUP_COLOR,
      }, function () {
        var error = lastError();
        if (error) {
          finish(windowKey, { ok: false, groupId: groupId, reason: error });
          return;
        }
        finish(windowKey, { ok: true, groupId: groupId, created: true });
      });
    }

    function placeTab(windowKey, tab, groupId) {
      var options = { tabIds: [tab.id] };
      if (groupId !== null) options.groupId = groupId;
      chromeApi.tabs.group(options, function (resolvedGroupId) {
        var error = lastError();
        if (error) {
          finish(windowKey, { ok: false, reason: error });
          return;
        }
        if (groupId !== null) {
          finish(windowKey, { ok: true, groupId: resolvedGroupId, created: false });
          return;
        }
        styleNewGroup(windowKey, resolvedGroupId);
      });
    }

    function process(windowKey) {
      var queue = queues[windowKey] || [];
      if (running[windowKey] || queue.length === 0) return;
      running[windowKey] = true;
      var tab = queue[0].tab;
      chromeApi.tabGroups.query({ windowId: tab.windowId }, function (groups) {
        var error = lastError();
        if (error) {
          finish(windowKey, { ok: false, reason: error });
          return;
        }
        var groupId = null;
        for (var i = 0; i < (groups || []).length; i++) {
          if (groups[i].title === GROUP_TITLE) {
            groupId = groups[i].id;
            break;
          }
        }
        placeTab(windowKey, tab, groupId);
      });
    }

    function add(tab, callback) {
      var done = typeof callback === "function" ? callback : function () {};
      if (!tab || typeof tab.id !== "number" || typeof tab.windowId !== "number") {
        done({ ok: false, reason: "tab_identity_missing" });
        return;
      }
      if (!chromeApi.tabs || typeof chromeApi.tabs.group !== "function" ||
          !chromeApi.tabGroups || typeof chromeApi.tabGroups.query !== "function" ||
          typeof chromeApi.tabGroups.update !== "function") {
        done({ ok: false, reason: "tab_groups_unavailable" });
        return;
      }
      var windowKey = String(tab.windowId);
      if (!queues[windowKey]) queues[windowKey] = [];
      queues[windowKey].push({ tab: tab, callback: done });
      process(windowKey);
    }

    return { add: add };
  }

  root.ClayTabGroups = {
    GROUP_COLOR: GROUP_COLOR,
    GROUP_TITLE: GROUP_TITLE,
    create: create,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayTabGroups;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
