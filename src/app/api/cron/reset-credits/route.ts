import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * POST /api/cron/reset-credits
 *
 * Monthly credit reset job — run daily via Vercel/external cron.
 * Resets credits_remaining to monthly_limit for wallets where next_reset_at <= now.
 * NEVER resets addon_credits.
 * Only resets for users with active subscriptions.
 */
export async function POST(req: Request) {
    try {
        const cronSecret =
            req.headers.get("x-cron-secret") ?? req.headers.get("authorization");

        if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const now = new Date().toISOString();

        // Find wallets due for reset that have active subscriptions
        const { data: dueWallets, error: fetchError } = await supabaseAdmin
            .from("wallet")
            .select("user_id, monthly_limit")
            .lte("next_reset_at", now);

        if (fetchError) {
            console.error("[cron/reset] Fetch error:", fetchError);
            throw fetchError;
        }

        let resetCount = 0;
        let skipCount = 0;

        if (dueWallets && dueWallets.length > 0) {
            for (const w of dueWallets) {
                // Check subscription is active before resetting
                const { data: sub } = await supabaseAdmin
                    .from("subscriptions_v2")
                    .select("status")
                    .eq("user_id", w.user_id)
                    .single();

                if (!sub || sub.status !== "active") {
                    skipCount++;
                    continue;
                }

                // Use atomic RPC for reset
                const { error: rpcError } = await supabaseAdmin.rpc("reset_monthly_credits", {
                    p_user_id: w.user_id,
                });

                if (rpcError) {
                    console.error(`[cron/reset] RPC error for ${w.user_id}:`, rpcError.message);
                    // Fallback: direct update
                    const nextReset = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                    await supabaseAdmin
                        .from("wallet")
                        .update({
                            credits_remaining: w.monthly_limit,
                            last_reset_at: now,
                            next_reset_at: nextReset,
                            updated_at: now,
                        })
                        .eq("user_id", w.user_id);
                }

                resetCount++;
            }
        }

        console.log(`[cron/reset] Reset ${resetCount} wallets, skipped ${skipCount}.`);

        return NextResponse.json({
            success: true,
            wallets_reset: resetCount,
            wallets_skipped: skipCount,
            timestamp: now,
        });

    } catch (error: any) {
        console.error("[cron/reset] Error:", error);
        return NextResponse.json(
            { error: "Server Error", details: error.message },
            { status: 500 }
        );
    }
}
