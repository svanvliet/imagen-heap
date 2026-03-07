import { AppShell } from "@/components/layout/AppShell";
import { useBackendStatus } from "@/hooks/useBackendStatus";

export default function App() {
  // Initialize backend connection monitoring
  useBackendStatus();

  return <AppShell />;
}
