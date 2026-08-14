import { LocalNotifications } from "@capacitor/local-notifications";

class NotificationService {
  async requestPermissions() {
    const perm = await LocalNotifications.requestPermissions();
    return perm.display === "granted";
  }

  async scheduleTimerEnd(checkpointName: string, seconds: number) {
    if (seconds <= 0) return;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: 1,
          title: "Time's Up!",
          body: `${checkpointName} is finished. Scan the tag to complete.`,
          schedule: { at: new Date(Date.now() + seconds * 1000) },
          sound: "default",
        },
      ],
    });
  }

  async cancelAll() {
    await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
  }

  async notifyIncompleteCycle(missingCheckpoints: string[]) {
    if (missingCheckpoints.length === 0) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 2,
          title: "Routine Incomplete",
          body: `Don't forget: ${missingCheckpoints.join(", ")}`,
        },
      ],
    });
  }
}

export const notificationService = new NotificationService();
