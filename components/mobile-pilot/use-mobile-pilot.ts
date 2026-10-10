"use client";

import { useSyncExternalStore } from "react";

const mobileQuery = "(max-width: 760px) and (pointer: coarse), (max-width: 960px) and (max-height: 600px) and (pointer: coarse)";
const standaloneQuery = "(display-mode: standalone)";
const serverSnapshot = () => false;
const mobileSnapshot = () => window.matchMedia(mobileQuery).matches && (
  window.matchMedia(standaloneQuery).matches || !!(navigator as Navigator & { standalone?: boolean }).standalone
);
function subscribe(callback: () => void) {
  const media = [window.matchMedia(mobileQuery), window.matchMedia(standaloneQuery)];
  media.forEach(query => query.addEventListener("change", callback));
  return () => media.forEach(query => query.removeEventListener("change", callback));
}

/** Installation and screen size select presentation; the server grants eligibility. */
export function useMobilePilot(eligible: boolean) {
  const mobile = useSyncExternalStore(subscribe, mobileSnapshot, serverSnapshot);
  return eligible && mobile;
}
