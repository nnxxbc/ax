/**
 * enforcement.ts — Phase 3, Feature 5 (Control & Adaptability). Pure helper
 * for resolving the effective enforcement level: a per-checkpoint override
 * (set on the checkpoint currently in progress) wins over the global
 * settings.enforcementLevel; "inherit" (null/undefined override) falls
 * back to the global value.
 */

export type EnforcementLevel = "off" | "soft" | "focused" | "strict";

export function effectiveEnforcementLevel(
  globalLevel: string | undefined | null,
  checkpointOverride: string | undefined | null,
): EnforcementLevel {
  const valid = ["off", "soft", "focused", "strict"];
  if (checkpointOverride && valid.includes(checkpointOverride)) {
    return checkpointOverride as EnforcementLevel;
  }
  if (globalLevel && valid.includes(globalLevel)) {
    return globalLevel as EnforcementLevel;
  }
  return "off";
}
