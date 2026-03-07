import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FirstRunWizard } from "@/components/models/FirstRunWizard";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useModelStore } from "@/stores/models";
import { useBackendStore } from "@/stores/backend";

export default function App() {
  useBackendStatus();

  const backendStatus = useBackendStore((s) => s.status);
  const isFirstRun = useModelStore((s) => s.isFirstRun);
  const checkFirstRun = useModelStore((s) => s.checkFirstRun);
  const [showWizard, setShowWizard] = useState(false);

  // Check first run after backend connects
  useEffect(() => {
    if (backendStatus === "connected") {
      checkFirstRun().then((first) => {
        if (first) setShowWizard(true);
      });
    }
  }, [backendStatus, checkFirstRun]);

  return (
    <>
      <AppShell />
      {showWizard && isFirstRun && (
        <FirstRunWizard onComplete={() => setShowWizard(false)} />
      )}
    </>
  );
}
