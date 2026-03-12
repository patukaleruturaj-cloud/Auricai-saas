import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateWithAI } from "@/lib/ai-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { bio, company, offer, originalMessage } = body;

        if (!bio || !offer || !originalMessage) {
            return NextResponse.json(
                { error: "Missing required fields: bio, offer, and originalMessage are required." },
                { status: 400 }
            );
        }

        const MASTER_SYSTEM_INSTRUCTION = `You are an elite outbound copywriter specializing in LinkedIn follow-up messages.
Your job is to write natural, thoughtful follow-up messages that feel like they were written by a real person — not a sales automation tool.

Goal: Gently re-engage the prospect and increase reply probability. Do not pressure or sell.

Core Principles:
1. HUMAN & RESPECTFUL: Sound like a real person.
2. ACKNOWLEDGE BUSYNESS: Recognize they might be busy.
3. LOW PRESSURE: No aggressive pitching.
4. LIGHT REMINDER: Gently remind them why you reached out.
5. REPLY HOOK: End with a natural conversational question.
6. SHORT: Concise messages.

Avoid:
- Pushy sales tone
- "Just following up again" spam style
- Long explanations
- Emojis
- Corporate buzzwords

Structure:
- Acknowledge they might be busy
- Reference the original context
- Ask a simple curiosity question

Output Rules:
- Return exactly 2 follow-up variations.
- Max 180 characters per message.
- One short paragraph.
- Must end with a natural question.

Output Format (STRICT JSON):
{
  "followups": [
    "message 1",
    "message 2"
  ]
}

Return ONLY valid JSON. No explanations. No markdown. No text outside JSON.`;

        const userPrompt = `Prospect Bio: ${bio.substring(0, 1000)}
Company Description: ${company || "Not provided"}
User Offer: ${offer}
Original Message Sent: ${originalMessage}

Generate exactly 2 natural follow-up variations. Return ONLY valid JSON.`;

        const fullPrompt = MASTER_SYSTEM_INSTRUCTION + "\n\n" + userPrompt;

        const FALLBACK_FOLLOWUPS = [
            "Hey — hope you're having a good week. Not sure if my last note got buried, but curious if you've had a chance to look at how we're helpng teams like yours?",
            "Wanted to float this to the top of your inbox. Curious if you're open to a quick swap of ideas on scaling your outbound efforts?"
        ];

        let result;
        let attempts = 0;
        const MAX_ATTEMPTS = 2;

        while (attempts < MAX_ATTEMPTS) {
            try {
                console.log("GENERATION STARTED (Followup)");
                console.log("AI_PROMPT:", fullPrompt);

                const rawResponse = await generateWithAI(fullPrompt, {
                    temperature: 0.7,
                    top_p: 0.9,
                    maxOutputTokens: 4096,
                    responseMimeType: "application/json",
                });

                console.log("AI_RAW_RESPONSE:", rawResponse);

                // Part 2: Fix JSON Parsing Errors - Robust Cleaning
                const cleaned = rawResponse
                    .replace(/```json/g, "")
                    .replace(/```/g, "")
                    .replace(/`json/g, "")
                    .replace(/`/g, "")
                    .trim();

                // Robust JSON extraction
                const firstBrace = cleaned.indexOf('{');
                const lastBrace = cleaned.lastIndexOf('}');
                let resultRaw = cleaned;

                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    resultRaw = cleaned.substring(firstBrace, lastBrace + 1);
                }

                let parsed;
                const jsonRegex = /\{[\s\S]*\}/;
                const match = resultRaw.match(jsonRegex);

                if (match) {
                    parsed = JSON.parse(match[0]);
                } else {
                    throw new Error("Invalid JSON format");
                }

                const followups = parsed.followups;
                if (!followups || !Array.isArray(followups) || followups.length < 2) {
                    throw new Error("Malformed JSON structure");
                }

                // Validation: max 180 characters
                const validFollowups = followups.filter(f => typeof f === "string" && f.length <= 180);
                if (validFollowups.length < 2) {
                    throw new Error("Character limit exceeded");
                }

                result = validFollowups.slice(0, 2);
                break;

            } catch (err: any) {
                attempts++;
                console.error(`[followup] Attempt ${attempts} failed:`, err.message);
                if (attempts >= MAX_ATTEMPTS) {
                    result = FALLBACK_FOLLOWUPS;
                }
            }
        }

        return NextResponse.json({ followups: result });

    } catch (error: any) {
        console.error("[generate/followup] Fatal error:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error.message },
            { status: 500 }
        );
    }
}
