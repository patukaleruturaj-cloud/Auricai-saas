// ─── Gemini 2.5 Flash — Direct REST API ───
// Replaces @google/generative-ai SDK with direct fetch() for full control.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_ENDPOINT =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

if (!GEMINI_API_KEY) {
    console.warn("[ai-provider] WARNING: GEMINI_API_KEY is missing from environment variables");
}

export interface AIOptions {
    temperature?: number;
    top_p?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
}

export async function generateWithAI(prompt: string, options?: AIOptions): Promise<string> {
    console.log("GENERATION STARTED");
    console.log("Using Gemini 2.5 Flash model (direct REST API)");

    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured");
    }

    const requestBody = {
        contents: [
            {
                parts: [{ text: prompt }],
            },
        ],
        generationConfig: {
            temperature: options?.temperature ?? 0.7,
            topP: options?.top_p ?? 0.9,
            maxOutputTokens: options?.maxOutputTokens ?? 4096,
            ...(options?.responseMimeType && options.responseMimeType !== "text/plain"
                ? { responseMimeType: options.responseMimeType }
                : {}),
        },
    };

    const url = `${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ai-provider] Gemini API error (${response.status}):`, errorBody);

        // Preserve the original status code so callers can detect 429 / 503 etc.
        const err: any = new Error(`Gemini API error: ${response.status}`);
        err.status = response.status;
        throw err;
    }

    const data = await response.json();

    // Safe extraction: candidates[0].content.parts[0].text
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("AI_RAW_RESPONSE:", text);

    if (!text) {
        console.error("[ai-provider] Empty response from Gemini. Full payload:", JSON.stringify(data));
        throw new Error("Gemini returned an empty response");
    }

    return text;
}
