"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { CloudOffIcon, WifiIcon } from "lucide-react";

/**
 * Connectivity watcher — surfaces browser online/offline transitions as
 * toasts so users know when their check-ins / EOD submissions may fail to
 * sync. Renders nothing; mounts once in the (app) shell.
 *
 * - Offline → persistent warning toast (stable id, dismiss action).
 * - Back online (only after being offline in this session) → the warning is
 *   dismissed and a short success toast confirms the connection.
 */

const OFFLINE_TOAST_ID = "weblaze-ems:offline";

export default function ConnectivityToast() {
  // Whether the offline toast is currently on screen. A ref (not state)
  // because nothing renders from it.
  const offlineShown = useRef(false);

  useEffect(() => {
    const showOffline = () => {
      offlineShown.current = true;
      toast.warning("You're offline", {
        id: OFFLINE_TOAST_ID,
        description:
          "Actions you take now may not sync until the connection is back.",
        icon: <CloudOffIcon className="size-4" />,
        duration: Infinity,
        action: {
          label: "Dismiss",
          onClick: () => toast.dismiss(OFFLINE_TOAST_ID),
        },
      });
    };

    const showOnline = () => {
      if (!offlineShown.current) return;
      offlineShown.current = false;
      toast.dismiss(OFFLINE_TOAST_ID);
      toast.success("Back online", {
        description: "Connection restored.",
        icon: <WifiIcon className="size-4" />,
        duration: 4000,
      });
    };

    // Page loaded while already offline (e.g. offline PWA launch).
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      showOffline();
    }

    window.addEventListener("offline", showOffline);
    window.addEventListener("online", showOnline);
    return () => {
      window.removeEventListener("offline", showOffline);
      window.removeEventListener("online", showOnline);
    };
  }, []);

  return null;
}
