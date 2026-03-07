import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FirstRunWizard } from "@/components/models/FirstRunWizard";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useDownloadProgress } from "@/hooks/useDownloadProgress";
import { useModelStore } from "@/stores/models";
import { useBackendStore } from "@/stores/backend";
import { createLogger } from "@/lib/logger";

const log = createLogger("App");

export default function App() {
  useBackendStatus();
  useDownloadProgress();

  const backendStatus = useBackendStore((s) => s.status);
  const checkFirstRun = useModelStore((s) => s.checkFirstRun);
  const [showWizard, setShowWizard] = useState(false);

  // Check first run after backend connects
  useEffect(() => {
    log.info("Backend status changed:", backendStatus);
    if (backendStatus === "connected") {
      log.info("Backend connected, checking first run...");
      checkFirstRun().then((first) => {
        log.info("First run check result:", first);
        if (first) setShowWizard(true);
      });
    }
  }, [backendStatus, checkFirstRun]);

  return (
    <>
      <AppShell />
      {showWizard && (
        <FirstRunWizard onComplete={() => setShowWizard(false)} />
      )}
    </>
  );
}
