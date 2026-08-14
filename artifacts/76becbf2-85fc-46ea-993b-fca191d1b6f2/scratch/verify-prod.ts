const endpoints = [
  "/api/checkpoints",
  "/api/settings",
  "/api/history",
  "/api/insights",
  "/api/healthz"
];

async function verify() {
  for (const ep of endpoints) {
    console.log(`Checking ${ep}...`);
    try {
      const res = await fetch(`https://transition-assistant-api.onrender.com${ep}`);
      console.log(`  Status: ${res.status} ${res.statusText}`);
      if (res.status !== 200) {
        const text = await res.text();
        console.error(`  Error Body: ${text.substring(0, 500)}`);
      } else {
        const data = await res.json();
        console.log(`  Data keys: ${Object.keys(Array.isArray(data) ? data[0] || {} : data)}`);
      }
    } catch (err: any) {
      console.error(`  Fetch failed: ${err.message}`);
    }
  }
}

verify();
