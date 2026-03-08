import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function run() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    try {
        const fetch = globalThis.fetch;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await res.json();
        console.log(JSON.stringify(data.models.map((m: any) => m.name), null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
