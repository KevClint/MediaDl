import { useEffect } from "react";
import LegacyAppLayout from "./components/legacy/LegacyAppLayout";
import LegacyOverlays from "./components/legacy/LegacyOverlays";
import LegacyTitleBar from "./components/legacy/LegacyTitleBar";
import LegacyDownloadsView from "./components/legacy/views/LegacyDownloadsView";
import LegacyHomeView from "./components/legacy/views/LegacyHomeView";
import LegacySettingsView from "./components/legacy/views/LegacySettingsView";
import LegacyToolsView from "./components/legacy/views/LegacyToolsView";
import LegacySpotView from "./components/legacy/views/LegacySpotView";

function App() {
  useEffect(() => {
    let cancelled = false;

    const loadLegacyScript = async () => {
      await import("./renderer.js");
      if (cancelled) return;
    };

    void loadLegacyScript();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <LegacyTitleBar />
      <LegacyAppLayout>
        <LegacyHomeView />
        <LegacyDownloadsView />
        <LegacySettingsView />
        <LegacyToolsView />
        <LegacySpotView />
      </LegacyAppLayout>
      <LegacyOverlays />
    </>
  );
}

export default App;
