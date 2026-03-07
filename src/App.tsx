import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FirstRunWizard } from "@/components/models/FirstRunWizard";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useModelStore } from "@/stores/models";
import { useBackendStore } from "@/stores/backend";

export default function App() {
  useBackendStatus();

  const backendStatus = useBackendStore((s) => s.status);
  const checkFirstRun = useModelStore((s) => s.checkFirstRun);
  const [showWizard, setShowWizard] = useState(false);

  // Check first run after backend connects
  useEffect(() => {
    console.log("[App] Backend status changed:", backendStatus);
    if (backendStatus === "connected") {
      console.log("[App] Backend connected, checking first run...");
      checkFirstRun().then((first) => {
        console.log("[App] First run check result:", first);
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
