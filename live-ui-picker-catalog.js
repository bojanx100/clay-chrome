(function (root) {
  function safeOrigin(value) {
    try {
      var parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return parsed.origin;
    } catch (error) {
      return null;
    }
  }

  function safeSession(value) {
    var session = value || {};
    if (session.id === undefined || session.id === null ||
        String(session.id).length > 200) return null;
    return {
      id: session.id,
      title: String(session.title || "New chat").slice(0, 160),
      active: !!session.active,
      isProcessing: !!session.isProcessing,
      coordinationMode: !!session.coordinationMode,
    };
  }

  function safeProject(value, remainingSessions) {
    var project = value || {};
    var projectSlug = String(project.projectSlug || "");
    if (!/^[a-z0-9_-]+$/.test(projectSlug)) return null;
    var inputSessions = Array.isArray(project.sessions) ? project.sessions : [];
    var sessions = [];
    for (var i = 0; i < inputSessions.length &&
        sessions.length < remainingSessions; i++) {
      var session = safeSession(inputSessions[i]);
      if (session) sessions.push(session);
    }
    return {
      projectSlug: projectSlug,
      projectLabel: String(
        project.projectLabel || project.projectTitle || projectSlug).slice(0, 160),
      sessions: sessions,
      sessionsLoaded: project.sessionsLoaded !== undefined ?
        !!project.sessionsLoaded : Array.isArray(project.sessions),
      sessionsLoading: !!project.sessionsLoading,
      sessionsError: project.sessionsError ?
        String(project.sessionsError).slice(0, 500) : null,
    };
  }

  function projectBySlug(projects, slug) {
    for (var i = 0; i < projects.length; i++) {
      if (projects[i].projectSlug === slug) return projects[i];
    }
    return null;
  }

  function safeIdentity(value) {
    if (!value || !safeOrigin(value.serverOrigin)) return null;
    var currentProjectSlug = String(
      value.currentProjectSlug || value.projectSlug || "");
    if (!/^[a-z0-9_-]+$/.test(currentProjectSlug)) return null;
    var inputProjects = Array.isArray(value.projects) ? value.projects : [{
      projectSlug: currentProjectSlug,
      projectLabel: value.projectLabel,
      sessions: value.sessions,
      sessionsLoaded: true,
    }];
    var projects = [];
    var totalSessions = 0;
    for (var i = 0; i < inputProjects.length && projects.length < 100; i++) {
      var project = safeProject(inputProjects[i], 500 - totalSessions);
      if (!project) continue;
      projects.push(project);
      totalSessions += project.sessions.length;
    }
    var currentProject = projectBySlug(projects, currentProjectSlug);
    return {
      serverOrigin: safeOrigin(value.serverOrigin),
      currentProjectSlug: currentProjectSlug,
      projectSlug: currentProjectSlug,
      projectLabel: String(value.projectLabel || currentProjectSlug).slice(0, 160),
      sessions: currentProject ? currentProject.sessions : [],
      projects: projects,
    };
  }

  root.ClayLiveUiPickerCatalog = {
    projectBySlug: projectBySlug,
    safeIdentity: safeIdentity,
    safeOrigin: safeOrigin,
    safeSession: safeSession,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ClayLiveUiPickerCatalog;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
