"use client";

import { useEffect } from "react";

/** Register the lightweight service worker used by the installable PWA shell. */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
  }, []);

  return null;
}
