const BASE_URL = "https://transition-assistant-api.onrender.com/api";
const TAG_UID = "1D:C6:E5:7E:1B:10:80";

async function runTest() {
  console.log(`Testing NFC Flow for UID: ${TAG_UID}`);

  try {
    // 1. Scan to start
    console.log("\n--- Step 1: Scan to START ---");
    const startRes = await fetch(`${BASE_URL}/nfc/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagUid: TAG_UID }),
    });
    const startData = await startRes.json();
    console.log(`Status: ${startRes.status}`);
    console.log(`Action: ${startData.action}`);
    console.log(`Message: ${startData.message}`);
    if (startRes.status !== 200) {
        console.error("FAILED to start session:", JSON.stringify(startData, null, 2));
        return;
    }

    // Wait a bit to avoid debounce and simulate some time passed
    console.log("\nWaiting 3 seconds...");
    await new Promise(r => setTimeout(r, 3000));

    // 2. Scan to complete
    console.log("\n--- Step 2: Scan to COMPLETE ---");
    const completeRes = await fetch(`${BASE_URL}/nfc/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagUid: TAG_UID }),
    });
    const completeData = await completeRes.json();
    console.log(`Status: ${completeRes.status}`);
    console.log(`Action: ${completeData.action}`);
    console.log(`Message: ${completeData.message}`);
    if (completeRes.status !== 200) {
        console.error("FAILED to complete session:", JSON.stringify(completeData, null, 2));
        return;
    }

    // 3. Scan to repeat
    console.log("\nWaiting 3 seconds...");
    await new Promise(r => setTimeout(r, 3000));

    console.log("\n--- Step 3: Scan to REPEAT ---");
    const repeatRes = await fetch(`${BASE_URL}/nfc/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagUid: TAG_UID }),
    });
    const repeatData = await repeatRes.json();
    console.log(`Status: ${repeatRes.status}`);
    console.log(`Action: ${repeatData.action}`);
    console.log(`Message: ${repeatData.message}`);
    if (repeatRes.status !== 200) {
        console.error("FAILED to repeat session:", JSON.stringify(repeatData, null, 2));
        return;
    }

    console.log("\n--- TEST COMPLETED SUCCESSFULLY ---");

  } catch (err: any) {
    console.error("Test failed with error:", err);
  }
}

runTest();
