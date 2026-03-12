const fs = require('fs');

async function main() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  const match = envFile.match(/GEMINI_API_KEY=(.*)/g);
  let apiKey = '';
  if (match) {
    // take the first one since we fixed it
    apiKey = match[0].split('=')[1].trim();
  }

  const prompt = `You are an elite outbound copywriter specializing in LinkedIn outreach.
Your job is to write highly personalized, natural, attention-grabbing LinkedIn messages that feel like they were written by a thoughtful human.

Your goal is not to sell immediately.
Your goal is to start a genuine conversation and maximize the probability of a reply.

Core rules:
• Use details from the prospect bio
• Messages must feel one-to-one
• Avoid generic phrases
• Avoid corporate buzzwords
• Avoid sounding like automation
• End with a natural curiosity question

Each message must:
• be under 220 characters
• be one short paragraph
• feel conversational and human

Return ONLY valid JSON in this format:

{
 "openers": [
  "opener 1",
  "opener 2",
  "opener 3"
 ],
 "subject": "short subject",
 "follow_up": "short follow up message"
}

No markdown.
No explanations.
Tone specification: Friendly: Warm, casual, conversational.

Prospect Bio:
Sample long bio here...

Company Description:
Some company...

Offer:
A great product...

Tone:
friendly

Generate exactly 3 variations. Return ONLY valid JSON.`;

  const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 600,
          responseMimeType: "application/json"
      }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });
    const data = await res.json();
    console.log("Full data:", JSON.stringify(data, null, 2));
    
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("Text length:", text.length, "Text:", text);
    
    if (data.candidates && data.candidates[0].finishReason) {
         console.log("Finish reason:", data.candidates[0].finishReason);
    }
  } catch(e) {
    console.error("Error:", e);
  }
}
main();
