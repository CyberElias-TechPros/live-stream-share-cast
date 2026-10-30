import OfflineBrowserRoom from "@/components/OfflineBrowserRoom";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function Offline() {
  return (
    <ErrorBoundary>
      <OfflineBrowserRoom />
    </ErrorBoundary>
  );
}
