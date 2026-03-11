import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FirstRunWizard } from "@/components/models/FirstRunWizard";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useDownloadProgress } from "@/hooks/useDownloadProgress";
import { useAdapterDownloadProgress } from "@/hooks/useAdapterDownloadProgress";
import { useModelStore } from "@/stores/models";
import { useCharacterStore } from "@/stores/characters";
import { useAdapterStore } from "@/stores/adapters";
import { useBackendStore } from "@/stores/backend";
import { markWizardDone } from "@/lib/tauri";
import { createLogger } from "@/lib/logger";

const log = createLogger("App");

export default function App() {
  useBackendStatus();
  useDownloadProgress();
  useAdapterDownloadProgress();

  const backendStatus = useBackendStore((s) => s.status);
  const checkFirstRun = useModelStore((s) => s.checkFirstRun);
  const loadModels = useModelStore((s) => s.loadModels);
  const loadCharacters = useCharacterStore((s) => s.loadCharacters);
  const loadAdapters = useAdapterStore((s) => s.loadAdapters);
  const [showWizard, setShowWizard] = useState(false);

  // Load models and check first run after backend connects
  useEffect(() => {
    log.info("Backend status changed:", backendStatus);
    if (backendStatus === "connected") {
      log.info("Backend connected, loading models and checking first run...");
      loadModels();
      loadCharacters();
      loadAdapters();
      checkFirstRun().then((first) => {
        log.info("First run check result:", first);
        if (first) setShowWizard(true);
      });
    }
  }, [backendStatus, checkFirstRun, loadModels, loadCharacters, loadAdapters]);

  const handleWizardComplete = () => {
    setShowWizard(false);
    markWizardDone().catch((err) => log.error("Failed to mark wizard done:", err));
  };

  return (
    <>
      <AppShell />
      {showWizard && (
        <FirstRunWizard onComplete={handleWizardComplete} />
      )}
    </>
  );
}
