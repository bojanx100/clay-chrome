(function (root) {
  var DATABASE_NAME = "clay-live-ui";
  var DATABASE_VERSION = 1;
  var STORE_NAME = "drafts";
  var MAX_DRAFTS = 30;
  var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  function create(options) {
    options = options || {};
    var databaseApi = options.indexedDB || root.indexedDB;
    var database = null;
    var opening = false;
    var waiters = [];

    function finishOpen(value) {
      database = value || null;
      opening = false;
      var callbacks = waiters.slice();
      waiters = [];
      for (var i = 0; i < callbacks.length; i++) callbacks[i](database);
    }

    function open(callback) {
      if (database) return callback(database);
      waiters.push(callback);
      if (opening) return;
      if (!databaseApi || !databaseApi.open) return finishOpen(null);
      opening = true;
      var request;
      try {
        request = databaseApi.open(DATABASE_NAME, DATABASE_VERSION);
      } catch (error) {
        finishOpen(null);
        return;
      }
      request.onupgradeneeded = function (event) {
        var nextDatabase = event.target.result;
        if (!nextDatabase.objectStoreNames.contains(STORE_NAME)) {
          nextDatabase.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = function (event) { finishOpen(event.target.result); };
      request.onerror = function () { finishOpen(null); };
      request.onblocked = function () { finishOpen(null); };
    }

    function store(mode, callback) {
      open(function (value) {
        if (!value) return callback(null);
        try {
          callback(value.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        } catch (error) {
          callback(null);
        }
      });
    }

    function clean(records) {
      records.sort(function (a, b) {
        return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
      });
      var cutoff = Date.now() - MAX_AGE_MS;
      var removals = [];
      for (var i = 0; i < records.length; i++) {
        if (i >= MAX_DRAFTS || Number(records[i].updatedAt || 0) < cutoff) {
          removals.push(records[i].key);
        }
      }
      if (!removals.length) return;
      store("readwrite", function (draftStore) {
        if (!draftStore) return;
        for (var j = 0; j < removals.length; j++) draftStore.delete(removals[j]);
      });
    }

    function cleanup() {
      store("readonly", function (draftStore) {
        if (!draftStore) return;
        var request = draftStore.getAll();
        request.onsuccess = function (event) { clean(event.target.result || []); };
      });
    }

    return {
      load: function (key, callback) {
        store("readonly", function (draftStore) {
          if (!draftStore) return callback(null);
          var request = draftStore.get(String(key));
          request.onsuccess = function (event) {
            var record = event.target.result;
            callback(record && record.value || null);
          };
          request.onerror = function () { callback(null); };
        });
      },
      save: function (key, value, callback) {
        store("readwrite", function (draftStore) {
          if (!draftStore) {
            if (callback) callback();
            return;
          }
          var request = draftStore.put({
            key: String(key),
            value: value,
            updatedAt: Date.now(),
          });
          request.onsuccess = function () {
            if (callback) callback();
            cleanup();
          };
          request.onerror = function () { if (callback) callback(); };
        });
      },
      remove: function (key, callback) {
        store("readwrite", function (draftStore) {
          if (!draftStore) {
            if (callback) callback();
            return;
          }
          var request = draftStore.delete(String(key));
          request.onsuccess = function () { if (callback) callback(); };
          request.onerror = function () { if (callback) callback(); };
        });
      },
    };
  }

  root.ClayLiveUiDevtoolsDrafts = { create: create };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiDevtoolsDrafts;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
