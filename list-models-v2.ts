import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("GEMINI_API_KEY is missing!");
        return;
    }

    const genAI = new GoogleGenerativeAI(key);

    try {
        // Use the native fetch-based listModels if available or hit the endpoint
        console.log("Fetching models...");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();

        if (data.models) {
            console.log("Available models:");
            data.models.forEach((m: any) => {
                console.log(`- ${m.name} (Supports: ${m.supportedGenerationMethods.join(", ")})`);
            });
        } else {
            console.log("No models found or error:", data);
        }
    } catch (err) {
        console.error("Error listing models:", err);
    }
}

listModels();
