async function run() {
  const res = await fetch("https://transition-assistant-api.onrender.com/api/checkpoints");
  const data = await res.json();
  if (Array.isArray(data) && data.length > 0) {
    console.log("Keys in first checkpoint:", Object.keys(data[0]));
    console.log("Full data[0]:", JSON.stringify(data[0], null, 2));
  } else {
    console.log("Response:", data);
  }
}
run();
