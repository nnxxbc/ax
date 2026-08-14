/**
 * frozen-protocol-rules.ts — pure stage-transition logic for Phase 3,
 * Features 7/8 (the Frozen Protocol). Extracted out of the FrozenProtocolView
 * component in home.tsx so the actual transition table is unit-testable,
 * the same way nfc-state-machine.ts mirrors the NFC decision logic.
 */

export type FrozenStage = 1 | 2 | 3 | 4;

export type FrozenStageEvent =
  | "stage1_acknowledged"
  | "stage2_action_done"
  | "stage2_too_hard"
  | "stage3_destination_chosen"
  | "stage3_unspecified"
  | "stage4_back";

/**
 * Pure state transition: given the current stage and what just happened,
 * what stage should the protocol show next? "stage2_too_hard" deliberately
 * does NOT advance — the whole point is there's always a smaller ask
 * available, never a dead end.
 */
export function advanceFrozenStage(current: FrozenStage, event: FrozenStageEvent): FrozenStage {
  switch (event) {
    case "stage1_acknowledged":
      return 2;
    case "stage2_action_done":
      return 3;
    case "stage2_too_hard":
      return current; // stay put — no dead end, just try a different tiny action
    case "stage3_destination_chosen":
    case "stage3_unspecified":
      return 4;
    case "stage4_back":
      return 3;
    default:
      return current;
  }
}
