import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { safeAIGeneration } from "@/lib/ai-provider";
import { ensureUserProvisioned, deductCredit, refundCredit, getWallet } from "@/lib/credits";

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
        // ─── AUTH ───
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

        // ─── INPUT VALIDATION ───
        const body = await req.json();
        const { bio, company, offer, tone: rawTone } = body;

        const trimmedBio = typeof bio === "string" ? bio.trim() : "";
        const trimmedCompany = typeof company === "string" ? company.trim() : "";
        const trimmedOffer = typeof offer === "string" ? offer.trim() : "";
        const safeTone = typeof rawTone === "string" && rawTone.trim() ? rawTone.trim().toLowerCase() : "friendly";

        if (!trimmedBio || !trimmedOffer) {
            return NextResponse.json({ error: "Missing required fields: bio and offer are required." }, { status: 400 });
        }

        const safeBio = trimmedBio.substring(0, 1500);
        const safeCompany = trimmedCompany.substring(0, 1500);
        const safeOffer = trimmedOffer.substring(0, 1000);

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
                        monthly_limit: wallet?.monthly_limit ?? 10,
                    },
                },
                { status: 402 }
            );
        }

        // ─── STEP 3: BUILD PROMPT ───
        const toneMap: Record<string, string> = {
            friendly: `Friendly: Warm, casual, conversational.`,
            direct: `Direct: Minimal words. Straight to point.`,
            bold: `Bold: Confident. Slight edge. Still respectful.`,
            professional: `Professional: Clean. Intelligent. Calm. No fluff.`,
        };
        const toneInstruction = toneMap[safeTone] ?? toneMap.friendly;

        const MASTER_SYSTEM_INSTRUCTION = `You are an elite outbound strategist and LinkedIn DM copywriter.

Your primary KPI is reply probability.

Your goal is to trigger curiosity, relevance, and low-friction response.

You generate high-converting, human-sounding LinkedIn messages across industries.

Never sound like a marketer. Never sound like a SaaS landing page.

Follow this framework internally before writing:

LAYER 1 — BUSINESS UNDERSTANDING

From the Prospect Bio and Company Context:

Identify what they sell.
Identify who they sell to.
Infer likely revenue model.
Infer one realistic growth bottleneck related to pipeline, positioning, or acquisition.
Identify one sharp angle that connects their situation to the offer.
Never assume scale, funding, or metrics unless explicitly stated.

Do not output this reasoning.

LAYER 2 — MESSAGE STRUCTURE (MANDATORY)

The message must follow this flow:

1. Specific observation about them (no generic praise).
2. Light, relevant curiosity question OR subtle tension.
3. Soft introduction of offer in one sentence.
4. One low-pressure CTA.

Keep it under 80 words.
Use short sentences.
One idea per sentence.
No corporate tone.
No buzzwords.
No exaggerated claims.

LAYER 3 — PSYCHOLOGICAL RULES

Prioritize curiosity over pitching.
Do not oversell.
Make it easy to reply with a short answer.
Reduce perceived sales pressure.
Make it feel like a peer conversation.

LAYER 4 — TONE ENGINE (apply throughout)

${toneInstruction}

LAYER 5 — HUMAN FILTER

Before finalizing:

If it sounds polished, corporate, or templated — rewrite it.
If it sounds like marketing — rewrite it.
It must feel like a real human typed it in 60 seconds.

LAYER 6 — EDGE CASE HANDLING

If the Prospect Bio is short or vague:
- Infer carefully.
- Avoid over-assuming.
- Stay grounded in visible information.

LAYER 7 — STRICT WORD LIMITS

Each DM must be between 45–75 words.
Follow-up must be under 60 words.
Subject line must be under 7 words.

LAYER 8 — FINAL VALIDATION PASS

Before returning the final output:
- Ensure each DM sounds human.
- Ensure no corporate language remains.
- Ensure word limits are respected.
If any rule is violated, rewrite internally before returning JSON.

YOUR OUTPUT MUST BE VALID JSON ONLY — NO MARKDOWN, NO COMMENTARY:
{
  "dms": ["DM variation 1", "DM variation 2", "DM variation 3"],
  "followUp": "A single follow-up message to send 3–5 days later if no reply",
  "subjectLine": "Best email subject line if sending via email"
}`;

        const userPrompt = `PROSPECT BIO:
${safeBio}

COMPANY CONTEXT:
${safeCompany || "Not provided"}

YOUR OFFER / VALUE PROP:
${safeOffer}

Generate exactly 3 DM variations, 1 follow-up, and 1 subject line. Return ONLY valid JSON.`;

        const fullPrompt = MASTER_SYSTEM_INSTRUCTION + "\n\n" + userPrompt;

        // ─── STEP 4: DEDUCT CREDIT (atomic RPC — concurrent safe) ───
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

        // ─── STEP 5: GENERATE AI OUTPUT ───
        let result;
        try {
            const rawResponse = await safeAIGeneration(fullPrompt);
            const resultRaw = rawResponse.replace(/```json\n?|\n?```/g, "").trim() || "{}";
            let parsed;
            try {
                parsed = JSON.parse(resultRaw);
            } catch {
                throw new Error("AI returned invalid JSON format.");
            }
            result = parsed;
            if (!result || !result.dms || !result.followUp) {
                throw new Error("AI returned malformed JSON structure.");
            }
        } catch (err: any) {
            // Generation failed — REFUND THE CREDIT
            console.error("[generate] AI error:", err.message);
            await refundCredit(clerkId);
            return NextResponse.json({ error: err.message }, { status: 500 });
        }

        // ─── STEP 6: SAVE GENERATION TO DATABASE ───
        const { error: histErr } = await supabaseAdmin.from("generations").insert({
            user_id: clerkId,
            prospect_bio: safeBio,
            company_context: safeCompany,
            offer: safeOffer,
            tone: safeTone,
            generated_options: result,
            subject: result.subjectLine ?? null,
            follow_up: result.followUp ?? null,
        });

        if (histErr) {
            console.error("[generate] History save failed:", histErr);
        }

        // ─── STEP 7: UPDATE USER STATS ───
        const { data: statsData } = await supabaseAdmin
            .from("user_stats")
            .select("total_generations")
            .eq("user_id", clerkId)
            .single();

        await supabaseAdmin.from("user_stats").upsert({
            user_id: clerkId,
            total_generations: (statsData?.total_generations ?? 0) + 1,
            last_generated_at: new Date().toISOString(),
        });

        // ─── STEP 8: RETURN RESPONSE ───
        return NextResponse.json({
            ...result,
            credits: {
                allowed: deductResult.credits_remaining > 0,
                credits_remaining: deductResult.credits_remaining,
                monthly_limit: deductResult.monthly_limit,
            },
        });
    } catch (error: any) {
        console.error("[generate] Unhandled error:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error.message ?? "Unknown error" },
            { status: 500 }
        );
    }
}
