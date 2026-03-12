const fs = require('fs');
const http = require('http');
// Read env file
const envFile = fs.readFileSync('.env.local', 'utf8');
const match = envFile.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : null;

if (!apiKey) {
    console.log("No API key");
    process.exit(1);
}

const body = JSON.stringify({
    contents: [{ parts: [{ text: "Hello, return {} in JSON" }] }],
    generationConfig: { responseMimeType: "application/json" }
});

fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
}).then(res => res.text()).then(text => console.log(text)).catch(err => console.error(err));
