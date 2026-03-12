const fs = require('fs');

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const match = envFile.match(/GEMINI_API_KEY=(.*)/g);
    let apiKey = '';
    if (match) {
        apiKey = match[match.length - 1].split('=')[1].trim();
    }

    console.log("Using API key starting with:", apiKey.substring(0, 10));

    const body = JSON.stringify({
        contents: [{ parts: [{ text: "Respond 'Hello' in JSON format like {\"greeting\":\"Hello\"}" }] }],
        generationConfig: { responseMimeType: "application/json" }
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Response:", text);
    } catch (e) {
        console.error("Error:", e);
    }
}
main();
