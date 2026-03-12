import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { generateWithAI } from "@/lib/ai-provider";
import { deductCredit, getWallet, ensureUserProvisioned, refundCredit } from "@/lib/credits";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── RATE LIMITING ───
// In-memory sliding window: 10 requests per 60 seconds per user
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(userId: string): boolean {
    const now = Date.now();
    const timestamps = rateLimitMap.get(userId) ?? [];

    // Remove expired entries
    const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

    if (valid.length >= RATE_LIMIT_MAX) {
        rateLimitMap.set(userId, valid);
        return true;
    }

    valid.push(now);
    rateLimitMap.set(userId, valid);
    return false;
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const clerkId = session.userId;

        // ─── RATE LIMIT ───
        if (isRateLimited(clerkId)) {
            return NextResponse.json(
                { error: "Rate limit exceeded. Max 10 requests per minute." },
                { status: 429 }
            );
        }

        // ─── STEP 1: ENSURE USER EXISTS ───
        await ensureUserProvisioned(clerkId);

        // ─── STEP 2: CHECK CREDITS (pre-flight) ───
        const wallet = await getWallet(clerkId);
        const totalCredits = (wallet?.credits_remaining ?? 0) + (wallet?.addon_credits ?? 0);
        if (!wallet || totalCredits <= 0) {
            return NextResponse.json(
                {
                    error: "Credits exhausted. Upgrade your plan or buy extra credits to continue.",
                    credits: {
                        allowed: false,
                        credits_remaining: 0,
                        addon_credits: 0,
                        monthly_limit: wallet?.monthly_limit ?? 5,
                    },
                },
                { status: 402 }
            );
        }

        const { bio } = await req.json();

        if (!bio || typeof bio !== "string" || bio.trim().length === 0) {
            return NextResponse.json({ error: "Bio is required" }, { status: 400 });
        }

        // ─── STEP 3: DEDUCT CREDIT (atomic RPC) ───
        const deductResult = await deductCredit(clerkId);

        if (!deductResult.success) {
            return NextResponse.json(
                {
                    error: "Credits exhausted. Upgrade your plan to continue.",
                    credits: {
                        allowed: false,
                        credits_remaining: 0,
                        monthly_limit: deductResult.monthly_limit,
                    },
                },
                { status: 402 }
            );
        }

        const MASTER_SYSTEM_INSTRUCTION = `You are an assistant that extracts what a company does from a LinkedIn bio.`;
        const userPrompt = `From the following LinkedIn bio, extract what the company does.
Return ONE short sentence (max 12 words).
Do not add explanations.

Bio:
${bio.substring(0, 1500)}`;

        const fullPrompt = `${MASTER_SYSTEM_INSTRUCTION}\n\n${userPrompt}`;

        console.log("GENERATION STARTED (Company)");
        let cleanCompany = "B2B SaaS platform"; // Safety default

        // ─── STEP 4: GENERATE AI OUTPUT ───
        try {
            const rawResponse = await generateWithAI(fullPrompt, {
                temperature: 0.3,
                top_p: 1,
                maxOutputTokens: 4096,
            });

            if (rawResponse && typeof rawResponse === "string") {
                const cleaned = rawResponse
                    .replace(/```json/g, "")
                    .replace(/```/g, "")
                    .replace(/`json/g, "")
                    .replace(/`/g, "")
                    .replace(/^"|"$/g, '')
                    .replace(/\n/g, ' ')
                    .trim();

                if (cleaned.length > 0 && cleaned.length <= 250) {
                    cleanCompany = cleaned;
                }
            }
        } catch (err) {
            console.error("AI GENERATION ERROR (Company):", err);
            console.log("[generate/company] Triggering refund.");
            await refundCredit(clerkId);
            throw new Error("AI extraction failed. Your credit has been refunded.");
        }

        return NextResponse.json({
            company: cleanCompany,
            credits: {
                allowed: deductResult.credits_remaining > 0,
                credits_remaining: deductResult.credits_remaining,
                monthly_limit: deductResult.monthly_limit,
            },
        });

    } catch (error: any) {
        console.error("[generate/company] Fatal error:", error);

        let status = 500;
        if (error.status === 429 || error.message?.includes("429")) status = 429;
        if (error.status === 503 || error.message?.includes("503")) status = 503;

        return NextResponse.json({
            error: error.message || "Failed to generate company description",
            details: error.toString()
        }, { status });
    }
}
