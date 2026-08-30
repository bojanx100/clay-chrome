(function (root) {
  function selection(state, componentTitle) {
    var packet = state.selectedPacket;
    if (!state.selected || !packet) return null;
    var component = packet.component;
    return {
      title: componentTitle(packet),
      source: component && component.source ?
        component.source.file + (component.source.line ?
          ":" + component.source.line : "") :
        (component ? "Source location unavailable" :
          "DOM element · React component not found"),
      element: "<" + packet.tag + ">" + (packet.accessibleName ?
        " · “" + packet.accessibleName + "”" : ""),
      chain: component && Array.isArray(component.chain) ?
        component.chain.join(" › ") : "",
    };
  }

  function build(state, componentTitle) {
    var reportState = state.reportManager ? state.reportManager.snapshot() : {
      reports: [], focusedId: null, counts: {}, aggregateStatus: "",
      showAllWorkers: false, hmr: {},
    };
    return {
      ok: true,
      pairingId: state.pairingId,
      projectLabel: state.projectLabel,
      sessionLabel: state.sessionLabel,
      connected: state.connected,
      selecting: state.selecting,
      submitting: state.submitting,
      selection: selection(state, componentTitle),
      composeError: state.composeErrorMessage,
      acceptedSequence: state.acceptedSequence,
      reports: reportState.reports,
      focusedId: reportState.focusedId,
      counts: reportState.counts,
      aggregateStatus: reportState.aggregateStatus,
      showAllWorkers: reportState.showAllWorkers === true,
      hmr: reportState.hmr,
    };
  }

  root.ClayLiveUiTargetSnapshot = { build: build };
})(typeof globalThis !== "undefined" ? globalThis : this);
