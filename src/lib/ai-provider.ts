import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const provider = process.env.AI_PROVIDER || "gemini";

async function generateWithAI(prompt: string): Promise<string> {
    if (provider === "gemini") {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("Gemini API key is missing. Please configure GEMINI_API_KEY in environment variables.");
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const result = await model.generateContent(prompt);
        return result.response.text();
    }

    if (provider === "openai") {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error("OpenAI API key is missing. Please configure OPENAI_API_KEY in environment variables.");
        }

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
        });

        return response.choices[0].message.content || "";
    }

    throw new Error("Invalid AI provider configured.");
}

export async function safeAIGeneration(prompt: string) {
    const start = Date.now();

    try {
        console.log("AI Provider:", provider);
        console.log("Gemini key exists:", !!process.env.GEMINI_API_KEY);
        console.log("OpenAI key exists:", !!process.env.OPENAI_API_KEY);

        const result = await generateWithAI(prompt);

        console.log("AI duration:", Date.now() - start);

        if (!result || typeof result !== "string") {
            throw new Error("AI returned empty or invalid response.");
        }

        return result;

    } catch (err: any) {
        console.error("AI EXECUTION ERROR:", err);

        throw new Error(
            err?.message ||
            err?.response?.data?.error?.message ||
            "Unknown AI execution error"
        );
    }
}
