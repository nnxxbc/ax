import { LocalNotifications } from "@capacitor/local-notifications";
import { shouldNotify, type NotificationSettingsSlice } from "@/lib/notification-rules";

/**
 * Phase 3, Feature 2 — Unified Notification System.
 *
 * Five categories, each with its own settings-driven on/off switch and
 * quiet-hours behavior (see notification-rules.ts for the pure gating
 * logic, which is unit tested separately):
 *   1. Timer          — "time's up" for the active checkpoint (Phase 1 behavior, preserved)
 *   2. Transition reminder — a gentler nudge some minutes into an unstarted transition
 *   3. Missed checkpoint   — end-of-day "you skipped these" (Phase 1's notifyIncompleteCycle, kept)
 *   4. Check-in       — periodic "still going?" pings, opt-in
 *   5. Alarm          — see alarm-service.ts (persistent morning alarm is its own module
 *                        since it needs weekly-repeating OS schedules + a dedicated channel)
 *
 * Notification id ranges, to avoid collisions:
 *   1        timer end            (unchanged from Phase 1)
 *   2        missed checkpoint    (unchanged from Phase 1)
 *   3        transition reminder
 *   4        check-in
 *   100-106  alarm, one per weekday — see alarm-service.ts
 */

const CHANNEL_ID = "transition_assistant_default";

class NotificationService {
  private channelReady = false;

  async requestPermissions() {
    const perm = await LocalNotifications.requestPermissions();
    return perm.display === "granted";
  }

  /** Android-only; no-ops safely on other platforms. Idempotent. */
  private async ensureChannel() {
    if (this.channelReady) return;
    try {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: "Transitions",
        description: "Timer, transition, and check-in reminders",
        importance: 4, // HIGH — heads-up, but not the alarm channel's MAX
        visibility: 1,
      });
    } catch (err) {
      // createChannel is Android-only; harmless no-op elsewhere.
      console.log("[NotificationService] createChannel skipped:", err);
    } finally {
      this.channelReady = true;
    }
  }

  // ── Category 1: Timer (Phase 1, preserved signature) ─────────────────

  async scheduleTimerEnd(checkpointName: string, seconds: number, settings?: NotificationSettingsSlice) {
    if (seconds <= 0) return;
    if (settings && !shouldNotify("timer", settings)) {
      console.log("[NotificationService] Timer notification suppressed by settings/quiet hours.");
      return;
    }
    await this.ensureChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 1,
          title: "Time's Up!",
          body: `${checkpointName} is finished. Scan the tag to complete.`,
          schedule: { at: new Date(Date.now() + seconds * 1000) },
          sound: "default",
          channelId: CHANNEL_ID,
        },
      ],
    });
  }

  async cancelAll() {
    await LocalNotifications.cancel({ notifications: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] });
  }

  // ── Category 2: Transition reminder ───────────────────────────────────

  async scheduleTransitionReminder(checkpointName: string, delayMinutes: number, settings: NotificationSettingsSlice) {
    await LocalNotifications.cancel({ notifications: [{ id: 3 }] });
    if (delayMinutes <= 0) return;
    if (!shouldNotify("transitionReminder", settings)) {
      console.log("[NotificationService] Transition reminder suppressed by settings/quiet hours.");
      return;
    }
    await this.ensureChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 3,
          title: "Still there?",
          body: `${checkpointName} is waiting on you.`,
          schedule: { at: new Date(Date.now() + delayMinutes * 60 * 1000) },
          channelId: CHANNEL_ID,
        },
      ],
    });
  }

  async cancelTransitionReminder() {
    await LocalNotifications.cancel({ notifications: [{ id: 3 }] });
  }

  // ── Category 3: Missed checkpoint (Phase 1's notifyIncompleteCycle) ──

  async notifyMissedCheckpoint(missingCheckpoints: string[], settings?: NotificationSettingsSlice) {
    if (missingCheckpoints.length === 0) return;
    if (settings && !shouldNotify("missedCheckpoint", settings)) {
      console.log("[NotificationService] Missed-checkpoint notification suppressed by settings/quiet hours.");
      return;
    }
    await this.ensureChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 2,
          title: "Routine Incomplete",
          body: `Don't forget: ${missingCheckpoints.join(", ")}`,
          channelId: CHANNEL_ID,
        },
      ],
    });
  }

  /** @deprecated use notifyMissedCheckpoint — kept as an alias, same id, so nothing that referenced the old name breaks. */
  async notifyIncompleteCycle(missingCheckpoints: string[]) {
    return this.notifyMissedCheckpoint(missingCheckpoints);
  }

  // ── Category 4: Check-in (opt-in periodic "still going?" pings) ──────
  //
  // There's no reliable arbitrary-interval OS-level repeating trigger
  // exposed by @capacitor/local-notifications (the `every` field only
  // supports fixed units like 'hour'/'day', not "every N minutes"), so
  // this reschedules a single one-off notification `checkInIntervalMinutes`
  // out and relies on being re-armed — from app foreground/resume and
  // right after a check-in fires — to keep going. Documented as a known
  // limitation: if the app is fully killed rather than backgrounded, the
  // chain stops until it's reopened.

  async armCheckIn(settings: NotificationSettingsSlice & { checkInIntervalMinutes?: number }) {
    await LocalNotifications.cancel({ notifications: [{ id: 4 }] });
    if (!shouldNotify("checkIn", settings)) return;
    const minutes = settings.checkInIntervalMinutes && settings.checkInIntervalMinutes > 0 ? settings.checkInIntervalMinutes : 120;
    await this.ensureChannel();
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 4,
          title: "Check-in",
          body: "How's it going? Open the app to update your status.",
          schedule: { at: new Date(Date.now() + minutes * 60 * 1000) },
          channelId: CHANNEL_ID,
        },
      ],
    });
  }

  async cancelCheckIn() {
    await LocalNotifications.cancel({ notifications: [{ id: 4 }] });
  }
}

export const notificationService = new NotificationService();
