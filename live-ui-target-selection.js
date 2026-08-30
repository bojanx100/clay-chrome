(function (root) {
  function positionSelection(state, element, selected) {
    if (!state.selectionOutline) return;
    if (!element) {
      state.selectionOutline.style.display = "none";
      return;
    }
    var rect = element.getBoundingClientRect();
    state.selectionOutline.style.display = "block";
    state.selectionOutline.style.transform =
      "translate(" + rect.left + "px," + rect.top + "px)";
    state.selectionOutline.style.width = rect.width + "px";
    state.selectionOutline.style.height = rect.height + "px";
    state.selectionOutline.style.borderColor = selected ? "#8fe388" : "#55a7ff";
  }

  function componentTitle(packet) {
    if (packet && packet.component && packet.component.name) return packet.component.name;
    return String(packet && (packet.accessibleName || packet.text || packet.tag) ||
      "Selected element").replace(/\s+/g, " ").trim().slice(0, 160);
  }

  function clearSelection(state, notify, onClear) {
    state.selected = null;
    state.selectedPacket = null;
    state.hovered = null;
    if (state.selectionOutline) state.selectionOutline.style.display = "none";
    if (notify && onClear) onClear();
  }

  function restoreSelection(state, context, packet, notify, onUpdate) {
    var element = context.resolveElement(packet);
    if (!element) return false;
    state.selected = element;
    state.selectedPacket = Object.assign(
      context.selectionPacket(element, state.documentGeneration), {
        component: packet.component || null,
      });
    positionSelection(state, element, true);
    if (notify && onUpdate) onUpdate(state.selectedPacket);
    return true;
  }

  function refreshSelection(state, context, onUpdate) {
    if (state.selectedPacket && (!state.selected || !state.selected.isConnected)) {
      if (!restoreSelection(state, context, state.selectedPacket, true, onUpdate)) {
        positionSelection(state, null, true);
      }
    } else if (state.selected) {
      positionSelection(state, state.selected, true);
    }
  }

  root.ClayLiveUiTargetSelection = {
    clearSelection: clearSelection,
    componentTitle: componentTitle,
    positionSelection: positionSelection,
    refreshSelection: refreshSelection,
    restoreSelection: restoreSelection,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiTargetSelection;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
