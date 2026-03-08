import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { paddle } from "@/lib/paddleClient";
import { getPaddleProduct } from "@/lib/paddlePrices";

// ─── HELPERS ───

async function logWebhook(
    eventId: string,
    eventType: string,
    payload: any,
    status: "received" | "processed" | "failed" | "skipped",
    userId?: string,
    errorMessage?: string
) {
    try {
        await supabaseAdmin.from("webhook_logs").insert({
            event_id: eventId,
            event_type: eventType,
            payload,
            status,
            user_id: userId || null,
            error_message: errorMessage || null,
        });
    } catch (e: any) {
        console.error("[Webhook] Failed to log webhook:", e.message);
    }
}

async function resolveProfileId(clerkId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("clerk_id", clerkId)
        .single();
    return data?.id ?? null;
}

async function resolveProfileByPaddleSubId(paddleSubId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
        .from("subscriptions_v2")
        .select("user_id")
        .eq("paddle_subscription_id", paddleSubId)
        .single();
    return data?.user_id ?? null;
}

// ─── WEBHOOK HANDLER ───
// Endpoint: POST /api/webhooks/paddle
// Paddle sends events here after checkout/subscription changes.

export async function POST(req: Request) {
    let eventId = "unknown";
    let eventType = "unknown";

    try {
        const signature = req.headers.get("paddle-signature");
        const body = await req.text();

        console.log("[Webhook] ▶ Incoming request received at /api/webhooks/paddle");
        console.log("[Webhook] Signature present:", !!signature);
        console.log("[Webhook] Body length:", body.length);

        // 1. Validate config
        const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
        if (!webhookSecret || !signature) {
            console.error("[Webhook] ✖ BLOCKED — Missing PADDLE_WEBHOOK_SECRET or signature header");
            console.error("[Webhook]   PADDLE_WEBHOOK_SECRET set:", !!webhookSecret, "length:", webhookSecret?.length ?? 0);
            console.error("[Webhook]   paddle-signature header:", !!signature);
            return NextResponse.json({ error: "Config error" }, { status: 400 });
        }

        // 2. Verify Paddle signature
        let event: any;
        try {
            event = await paddle.webhooks.unmarshal(body, webhookSecret, signature);
            if (!event) throw new Error("Unmarshal returned null");
            console.log("[Webhook] ✓ Signature verified successfully");
        } catch (err: any) {
            console.error("[Webhook] ✖ Signature verification failed:", err.message);
            return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        }

        eventType = event.eventType;
        eventId = event.eventId;
        console.log(`[Webhook] ▶ Event: ${eventType} | ID: ${eventId}`);

        // 3. Idempotency check
        const { data: existing } = await supabaseAdmin
            .from("processed_webhooks")
            .select("event_id")
            .eq("event_id", eventId)
            .single();

        if (existing) {
            console.log(`[Webhook] ⏭ Duplicate skipped: ${eventId}`);
            await logWebhook(eventId, eventType, event.data, "skipped");
            return NextResponse.json({ received: true });
        }

        // Record event as processed
        await supabaseAdmin.from("processed_webhooks").insert({
            event_id: eventId,
            processed_at: new Date().toISOString(),
        });

        // 4. Resolve user
        const customData = event.data?.customData || event.data?.custom_data;
        let profileId: string | null = null;

        console.log("[Webhook] custom_data:", JSON.stringify(customData));

        if (customData?.userId) {
            profileId = await resolveProfileId(customData.userId);
            console.log(`[Webhook] Resolved via clerk_id ${customData.userId} → profile: ${profileId}`);
        }

        // Fallback: look up by paddle subscription ID
        if (!profileId) {
            const paddleSubId = event.data?.subscriptionId || event.data?.subscription_id || event.data?.id;
            if (paddleSubId) {
                profileId = await resolveProfileByPaddleSubId(paddleSubId);
                console.log(`[Webhook] Resolved via paddle_subscription_id ${paddleSubId} → profile: ${profileId}`);
            }
        }

        if (!profileId) {
            console.error(`[Webhook] ✖ Could not resolve user for event ${eventId}`);
            await logWebhook(eventId, eventType, event.data, "failed", undefined, "Could not resolve user");
            return NextResponse.json({ received: true });
        }

        // 5. Log as received
        await logWebhook(eventId, eventType, event.data, "received", profileId);

        // ─── EVENT ROUTING ───

        try {
            switch (eventType) {

                // ═══════════════════════════════════════
                // TRANSACTION COMPLETED — primary payment event
                // ═══════════════════════════════════════
                case "transaction.completed": {
                    const tx = event.data;
                    const priceId = tx.items?.[0]?.price?.id;
                    console.log(`[Webhook] transaction.completed — priceId: ${priceId}`);

                    if (!priceId) {
                        console.error("[Webhook] ✖ No priceId in transaction items");
                        await logWebhook(eventId, eventType, tx, "failed", profileId, "No priceId");
                        break;
                    }

                    const product = getPaddleProduct(priceId);
                    if (!product) {
                        console.error(`[Webhook] ✖ Unknown priceId: ${priceId} — not in PADDLE_PRICE_MAP`);
                        await logWebhook(eventId, eventType, tx, "failed", profileId, `Unknown priceId: ${priceId}`);
                        break;
                    }

                    console.log(`[Webhook] Product resolved: type=${product.type}, plan=${(product as any).planType ?? "addon"}, credits=${product.credits}`);

                    if (product.type === "subscription") {
                        // ─── SUBSCRIPTION PURCHASE ───
                        const paddleSubId = tx.subscriptionId || tx.subscription_id || null;
                        console.log(`[Webhook] Calling activate_plan RPC: user=${profileId}, plan=${product.planType}, cycle=${product.billingCycle}, credits=${product.credits}, sub=${paddleSubId}`);

                        const { error } = await supabaseAdmin.rpc("activate_plan", {
                            p_user_id: profileId,
                            p_plan_type: product.planType,
                            p_billing_cycle: product.billingCycle,
                            p_credits: product.credits,
                            p_paddle_subscription_id: paddleSubId,
                        });

                        if (error) {
                            console.error("[Webhook] ✖ activate_plan RPC failed:", error.message);
                            await logWebhook(eventId, eventType, tx, "failed", profileId, `activate_plan: ${error.message}`);

                            // Direct fallback: update tables manually
                            console.log("[Webhook] Attempting direct database fallback...");
                            await supabaseAdmin.from("subscriptions_v2").upsert({
                                user_id: profileId,
                                plan_type: product.planType,
                                billing_cycle: product.billingCycle,
                                status: "active",
                                paddle_subscription_id: paddleSubId,
                                current_period_start: new Date().toISOString(),
                                next_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                                updated_at: new Date().toISOString(),
                            }, { onConflict: "user_id" });

                            await supabaseAdmin.from("wallet")
                                .update({
                                    monthly_limit: product.credits,
                                    credits_remaining: product.credits,
                                    last_reset_at: new Date().toISOString(),
                                    next_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                                    updated_at: new Date().toISOString(),
                                })
                                .eq("user_id", profileId);

                            console.log("[Webhook] ✓ Direct fallback completed");
                            await logWebhook(eventId, eventType, tx, "processed", profileId);
                        } else {
                            console.log(`[Webhook] ✓ Plan activated: ${product.planType} (${product.billingCycle}) → ${product.credits} credits for ${profileId}`);
                            await logWebhook(eventId, eventType, tx, "processed", profileId);
                        }

                    } else if (product.type === "addon") {
                        // ─── ADDON PURCHASE ───
                        const { error } = await supabaseAdmin.rpc("increment_addon_credits", {
                            p_user_id: profileId,
                            p_amount: product.credits,
                        });

                        if (error) {
                            console.error("[Webhook] increment_addon_credits failed:", error.message);
                            const { data: wallet } = await supabaseAdmin
                                .from("wallet")
                                .select("addon_credits")
                                .eq("user_id", profileId)
                                .single();

                            await supabaseAdmin.from("wallet")
                                .update({
                                    addon_credits: (wallet?.addon_credits ?? 0) + product.credits,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq("user_id", profileId);

                            await logWebhook(eventId, eventType, tx, "processed", profileId);
                        } else {
                            console.log(`[Webhook] ✓ Addon purchased: +${product.credits} addon credits for ${profileId}`);
                            await logWebhook(eventId, eventType, tx, "processed", profileId);
                        }
                    }
                    break;
                }

                // ═══════════════════════════════════════
                // SUBSCRIPTION CREATED / UPDATED
                // ═══════════════════════════════════════
                case "subscription.created":
                case "subscription.updated": {
                    const sub = event.data;
                    const paddleSubId = sub.id;
                    const paddleStatus = sub.status;

                    let dbStatus: string;
                    if (paddleStatus === "active" || paddleStatus === "trialing") {
                        dbStatus = "active";
                    } else if (paddleStatus === "past_due") {
                        dbStatus = "past_due";
                    } else if (paddleStatus === "canceled" || paddleStatus === "cancelled") {
                        dbStatus = "cancelled";
                    } else {
                        dbStatus = "active";
                    }

                    await supabaseAdmin.from("subscriptions_v2")
                        .update({
                            paddle_subscription_id: paddleSubId,
                            status: dbStatus,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("user_id", profileId);

                    console.log(`[Webhook] ✓ ${eventType}: sub ${paddleSubId} → status ${dbStatus} for ${profileId}`);
                    await logWebhook(eventId, eventType, sub, "processed", profileId);
                    break;
                }

                // ═══════════════════════════════════════
                // SUBSCRIPTION CANCELED
                // ═══════════════════════════════════════
                case "subscription.canceled": {
                    const { error } = await supabaseAdmin.rpc("cancel_plan", {
                        p_user_id: profileId,
                    });

                    if (error) {
                        console.error("[Webhook] cancel_plan failed:", error.message);
                        await supabaseAdmin.from("subscriptions_v2")
                            .update({ status: "cancelled", updated_at: new Date().toISOString() })
                            .eq("user_id", profileId);
                    }

                    console.log(`[Webhook] ✓ Subscription cancelled for ${profileId}`);
                    await logWebhook(eventId, eventType, event.data, "processed", profileId);
                    break;
                }

                // ═══════════════════════════════════════
                // SUBSCRIPTION PAST DUE
                // ═══════════════════════════════════════
                case "subscription.past_due": {
                    const { error } = await supabaseAdmin.rpc("set_plan_past_due", {
                        p_user_id: profileId,
                    });

                    if (error) {
                        await supabaseAdmin.from("subscriptions_v2")
                            .update({ status: "past_due", updated_at: new Date().toISOString() })
                            .eq("user_id", profileId);
                    }

                    console.log(`[Webhook] ✓ Subscription past_due for ${profileId}`);
                    await logWebhook(eventId, eventType, event.data, "processed", profileId);
                    break;
                }

                default:
                    console.log(`[Webhook] Unhandled event type: ${eventType}`);
                    await logWebhook(eventId, eventType, event.data, "skipped", profileId);
            }

            return NextResponse.json({ received: true });

        } catch (err: any) {
            console.error(`[Webhook] Processing error for ${eventType}:`, err.message);
            await logWebhook(eventId, eventType, event.data, "failed", profileId, err.message);
            return NextResponse.json({ received: true });
        }

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[Webhook] Fatal error:", message);
        return NextResponse.json({ error: "Webhook error" }, { status: 500 });
    }
}
