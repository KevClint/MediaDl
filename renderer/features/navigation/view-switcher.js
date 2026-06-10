export function createViewSwitcher({ onDownloadsView, onSettingsView, onToolsView, onSpotView }) {
  const viewIds = ["view-home", "view-downloads", "view-settings", "view-tools", "view-spot"];

  const switchView = (viewId) => {
    viewIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (id === viewId) {
        el.classList.remove("view-hidden");
        el.classList.add("view-visible");
      } else {
        el.classList.remove("view-visible");
        el.classList.add("view-hidden");
      }
    });

    document.querySelectorAll(".sidebar-nav-item").forEach((btn) => {
      const v = btn.getAttribute("data-view");
      const targetId = "view-" + v;
      btn.classList.toggle("active", targetId === viewId);
    });

    if (viewId === "view-downloads" && typeof onDownloadsView === "function") onDownloadsView();
    if (viewId === "view-settings" && typeof onSettingsView === "function") onSettingsView();
    if (viewId === "view-tools" && typeof onToolsView === "function") onToolsView();
    if (viewId === "view-spot" && typeof onSpotView === "function") onSpotView();
  };

  const bindSidebarNavigation = () => {
    document.querySelectorAll(".sidebar-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        if (view) switchView("view-" + view);
      });
    });
  };

  return { switchView, bindSidebarNavigation };
}