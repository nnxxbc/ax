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

    if (startRes.status !== 200) {
        const errData = await startRes.text();
        console.error(`FAILED to start session. Status: ${startRes.status}`);
        console.error("Response:", errData);
        return;
    }

    const startData = await startRes.json();
    console.log(`Status: ${startRes.status}`);
    console.log(`Action: ${startData.action}`);
    console.log(`Message: ${startData.message}`);

    // Wait a bit to avoid debounce
    console.log("\nWaiting 3 seconds...");
    await new Promise(r => setTimeout(r, 3000));

    // 2. Scan to complete
    console.log("\n--- Step 2: Scan to COMPLETE ---");
    const completeRes = await fetch(`${BASE_URL}/nfc/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagUid: TAG_UID }),
    });

    if (completeRes.status !== 200) {
        const errData = await completeRes.text();
        console.error(`FAILED to complete session. Status: ${completeRes.status}`);
        console.error("Response:", errData);
        return;
    }

    const completeData = await completeRes.json();
    console.log(`Status: ${completeRes.status}`);
    console.log(`Action: ${completeData.action}`);
    console.log(`Message: ${completeData.message}`);

    // 3. Scan to repeat
    console.log("\nWaiting 3 seconds...");
    await new Promise(r => setTimeout(r, 3000));

    console.log("\n--- Step 3: Scan to REPEAT ---");
    const repeatRes = await fetch(`${BASE_URL}/nfc/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagUid: TAG_UID }),
    });

    if (repeatRes.status !== 200) {
        const errData = await repeatRes.text();
        console.error(`FAILED to repeat session. Status: ${repeatRes.status}`);
        console.error("Response:", errData);
        return;
    }

    const repeatData = await repeatRes.json();
    console.log(`Status: ${repeatRes.status}`);
    console.log(`Action: ${repeatData.action}`);
    console.log(`Message: ${repeatData.message}`);

    console.log("\n--- TEST COMPLETED SUCCESSFULLY ---");

  } catch (err: any) {
    console.error("Test failed with unexpected error:", err);
  }
}

runTest();
