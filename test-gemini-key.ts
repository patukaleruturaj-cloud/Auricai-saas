import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function testGemini() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("GEMINI_API_KEY is missing!");
        return;
    }

    console.log(`Testing with key starting with: ${key.substring(0, 4)}...`);
    // Note: listModels is usually not available on the client-side GoogleGenerativeAI class in the same way.
    // However, we can try to hit the endpoint directly or use the standard model names.

    const genAI = new GoogleGenerativeAI(key);

    const modelsToTry = [
        "gemini-2.0-flash",
        "gemini-flash-latest",
        "gemini-pro-latest",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ];

    for (const modelName of modelsToTry) {
        try {
            console.log(`--- Trying model: ${modelName} ---`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Say hello!");
            console.log(`SUCCESS with ${modelName}:`);
            console.log(result.response.text());
            break; // Found one that works!
        } catch (err: any) {
            console.error(`FAILED with ${modelName}: ${err.message}`);
            if (err.status === 404) {
                console.log("Model not found (404).");
            } else if (err.status === 429) {
                console.log("Quota exceeded (429).");
            }
        }
    }
}

testGemini();
