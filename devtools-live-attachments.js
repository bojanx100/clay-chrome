(function (root) {
  var MAX_IMAGES = 4;
  var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  var MAX_TOTAL_IMAGE_BYTES = 10 * 1024 * 1024;
  var MAX_PASTES = 4;
  var MAX_PASTE_CHARS = 64 * 1024;
  var MAX_TOTAL_PASTE_CHARS = 128 * 1024;
  var IMAGE_TYPES = {
    "image/png": true,
    "image/jpeg": true,
    "image/gif": true,
    "image/webp": true,
  };

  function preview(value, fallback) {
    var text = String(value || "").replace(/\s+/g, " ").trim();
    return (text || fallback || "Pasted text").slice(0, 80);
  }

  function textFile(file) {
    var name = String(file && file.name || "").toLowerCase();
    return String(file && file.type || "").indexOf("text/") === 0 ||
      /\.(?:txt|md|markdown|json|js|jsx|ts|tsx|css|scss|html|xml|yaml|yml|csv|log|sql|sh|py|rb|go|rs|java|c|cc|cpp|h|hpp)$/i.test(name);
  }

  function create(options) {
    var images = [];
    var pastes = [];
    var pendingImageBytes = 0;
    var pendingImages = 0;
    var generation = 0;

    function notify() {
      if (options.onChange) options.onChange();
    }

    function fail(message) {
      if (options.onError) options.onError(message);
    }

    function totalImageBytes() {
      var total = 0;
      for (var i = 0; i < images.length; i++) total += images[i].size || 0;
      return total;
    }

    function totalPasteChars() {
      var total = 0;
      for (var i = 0; i < pastes.length; i++) total += pastes[i].text.length;
      return total;
    }

    function removeButton(label, handler) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "attachment-remove";
      button.setAttribute("aria-label", label);
      button.textContent = "×";
      button.addEventListener("click", handler);
      return button;
    }

    function render() {
      options.container.innerHTML = "";
      for (var i = 0; i < images.length; i++) {
        (function (index) {
          var wrap = document.createElement("div");
          wrap.className = "attachment-image";
          var image = document.createElement("img");
          image.alt = images[index].name || "Pasted image";
          image.src = "data:" + images[index].mediaType + ";base64," +
            images[index].data;
          wrap.appendChild(image);
          wrap.appendChild(removeButton("Remove " + image.alt, function () {
            images.splice(index, 1);
            render();
          }));
          options.container.appendChild(wrap);
        })(i);
      }
      for (var j = 0; j < pastes.length; j++) {
        (function (index) {
          var chip = document.createElement("div");
          chip.className = "attachment-paste";
          var mark = document.createElement("span");
          mark.className = "attachment-paste-mark";
          mark.textContent = pastes[index].fileName ? "File" : "Paste";
          var title = document.createElement("span");
          title.className = "attachment-paste-preview";
          title.textContent = pastes[index].preview;
          chip.appendChild(mark);
          chip.appendChild(title);
          chip.appendChild(removeButton("Remove " + pastes[index].preview, function () {
            pastes.splice(index, 1);
            render();
          }));
          options.container.appendChild(chip);
        })(j);
      }
      options.container.classList[images.length || pastes.length ? "remove" : "add"]("hidden");
      notify();
    }

    function addPaste(text, fileName) {
      var value = String(text || "");
      var stored = fileName ? "[Pasted text file: " + fileName + "]\n\n" + value : value;
      if (!value) return;
      if (pastes.length >= MAX_PASTES || stored.length > MAX_PASTE_CHARS ||
          totalPasteChars() + stored.length > MAX_TOTAL_PASTE_CHARS) {
        fail("Pasted text is too large. Keep up to four pastes under 128 KB total.");
        return;
      }
      pastes.push({
        text: stored,
        preview: preview(fileName || value, "Pasted text"),
        fileName: fileName || null,
      });
      render();
    }

    function readImage(file) {
      if (!IMAGE_TYPES[file.type]) {
        fail("That image type is not supported. Use PNG, JPEG, GIF, or WebP.");
        return;
      }
      if (images.length + pendingImages >= MAX_IMAGES ||
          file.size > MAX_IMAGE_BYTES ||
          totalImageBytes() + pendingImageBytes + file.size > MAX_TOTAL_IMAGE_BYTES) {
        fail("Pasted images are too large. Keep up to four images under 10 MB total.");
        return;
      }
      pendingImages++;
      pendingImageBytes += file.size;
      var readGeneration = generation;
      var reader = new FileReader();
      reader.onload = function (event) {
        if (readGeneration !== generation) return;
        pendingImages--;
        pendingImageBytes -= file.size;
        var dataUrl = String(event.target && event.target.result || "");
        var comma = dataUrl.indexOf(",");
        if (comma < 0) return fail("Clay could not read that pasted image.");
        images.push({
          mediaType: file.type,
          data: dataUrl.slice(comma + 1),
          name: String(file.name || "pasted-image").slice(0, 120),
          size: file.size,
        });
        render();
      };
      reader.onerror = function () {
        if (readGeneration !== generation) return;
        pendingImages--;
        pendingImageBytes -= file.size;
        fail("Clay could not read that pasted image.");
      };
      reader.readAsDataURL(file);
    }

    function readTextFile(file) {
      if (file.size > MAX_PASTE_CHARS) {
        fail("That text file is too large to paste. Keep it under 64 KB.");
        return;
      }
      var readGeneration = generation;
      var reader = new FileReader();
      reader.onload = function (event) {
        if (readGeneration !== generation) return;
        addPaste(event.target && event.target.result, String(file.name || "text file").slice(0, 120));
      };
      reader.onerror = function () {
        if (readGeneration === generation) fail("Clay could not read that pasted text file.");
      };
      reader.readAsText(file);
    }

    function handleFile(file) {
      if (!file) return;
      if (String(file.type || "").indexOf("image/") === 0) readImage(file);
      else if (textFile(file)) readTextFile(file);
      else fail("Paste images or text files here. This binary file type is not supported yet.");
    }

    function pastedFiles(clipboard) {
      var files = [];
      if (clipboard.files && clipboard.files.length) {
        for (var i = 0; i < clipboard.files.length; i++) files.push(clipboard.files[i]);
        return files;
      }
      var items = clipboard.items || [];
      for (var j = 0; j < items.length; j++) {
        if (items[j].kind !== "file") continue;
        var file = items[j].getAsFile();
        if (file) files.push(file);
      }
      return files;
    }

    options.input.addEventListener("paste", function (event) {
      var clipboard = event.clipboardData;
      if (!clipboard) return;
      var files = pastedFiles(clipboard);
      if (files.length) {
        event.preventDefault();
        for (var i = 0; i < files.length; i++) handleFile(files[i]);
        return;
      }
      var plain = clipboard.getData ? clipboard.getData("text/plain") : "";
      if (plain && plain.length >= 500) {
        event.preventDefault();
        addPaste(plain, null);
      }
    });

    return {
      clear: function () {
        generation++;
        images = [];
        pastes = [];
        pendingImageBytes = 0;
        pendingImages = 0;
        render();
      },
      hasContent: function () { return images.length > 0 || pastes.length > 0; },
      payload: function () {
        return {
          images: images.map(function (image) {
            return { mediaType: image.mediaType, data: image.data, name: image.name };
          }),
          pastes: pastes.map(function (paste) { return paste.text; }),
        };
      },
    };
  }

  root.ClayLiveUiDevtoolsAttachments = { create: create };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiDevtoolsAttachments;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
