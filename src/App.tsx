import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FirstRunWizard } from "@/components/models/FirstRunWizard";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useDownloadProgress } from "@/hooks/useDownloadProgress";
import { useModelStore } from "@/stores/models";
import { useCharacterStore } from "@/stores/characters";
import { useBackendStore } from "@/stores/backend";
import { markWizardDone } from "@/lib/tauri";
import { createLogger } from "@/lib/logger";

const log = createLogger("App");

export default function App() {
  useBackendStatus();
  useDownloadProgress();

  const backendStatus = useBackendStore((s) => s.status);
  const checkFirstRun = useModelStore((s) => s.checkFirstRun);
  const loadModels = useModelStore((s) => s.loadModels);
  const loadCharacters = useCharacterStore((s) => s.loadCharacters);
  const [showWizard, setShowWizard] = useState(false);

  // Load models and check first run after backend connects
  useEffect(() => {
    log.info("Backend status changed:", backendStatus);
    if (backendStatus === "connected") {
      log.info("Backend connected, loading models and checking first run...");
      loadModels();
      loadCharacters();
      checkFirstRun().then((first) => {
        log.info("First run check result:", first);
        if (first) setShowWizard(true);
      });
    }
  }, [backendStatus, checkFirstRun, loadModels, loadCharacters]);

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
