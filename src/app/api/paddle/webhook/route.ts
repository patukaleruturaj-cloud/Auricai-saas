import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { paddle } from "@/lib/paddleClient";
import { getPaddleProduct, type PaddleSubscriptionProduct } from "@/lib/paddlePrices";

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

async function resolveProfileByEmail(email: string): Promise<string | null> {
    // Look up by email in profiles
    const { data } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .single();

    // If not found, might be a clerk email mapping issue, but we try our best
    return data?.id ?? null;
}

// ─── WEBHOOK HANDLER ───

export async function POST(req: Request) {
    let eventId = "unknown";
    let eventType = "unknown";

    try {
        console.log(">>> [Webhook] Incoming request received at /api/paddle/webhook");
        const signature = req.headers.get("paddle-signature");
        const body = await req.text();
        console.log(">>> [Webhook] Signature header:", signature ? "PRESENT" : "MISSING");

        // 1. Validate config
        const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error(">>> [Webhook] CRITICAL: PADDLE_WEBHOOK_SECRET is NOT set in .env.local.");
            return NextResponse.json({ error: "Config error" }, { status: 400 });
        }
        if (!signature) {
            console.error(">>> [Webhook] ERROR: paddle-signature header is missing.");
            return NextResponse.json({ error: "Config error" }, { status: 400 });
        }

        // 2. Verify Paddle signature
        let event: any;
        try {
            console.log(">>> [Webhook] Attempting signature verification...");
            event = await paddle.webhooks.unmarshal(body, webhookSecret, signature);
            if (!event) throw new Error("Unmarshal returned null");
            console.log(">>> [Webhook] Signature verified successfully.");
        } catch (err: any) {
            console.error(">>> [Webhook] ERROR: Signature verification failed:", err.message);
            return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
        }

        eventType = event.eventType;
        eventId = event.eventId;
        console.log(`>>> [Webhook] EVENT: ${eventType} | ID: ${eventId}`);

        // 3. Idempotency check
        const { data: existing } = await supabaseAdmin
            .from("processed_webhooks")
            .select("event_id")
            .eq("event_id", eventId)
            .single();

        if (existing) {
            console.log(`>>> [Webhook] EVENT ${eventId} already processed. Skipping.`);
            await logWebhook(eventId, eventType, event.data, "skipped");
            return NextResponse.json({ received: true });
        }

        // Record event as processed
        console.log(`>>> [Webhook] Recording EVENT ${eventId} in processed_webhooks...`);
        await supabaseAdmin.from("processed_webhooks").insert({
            event_id: eventId,
            processed_at: new Date().toISOString(),
        });

        // 4. Resolve user
        console.log(">>> [Webhook] Attempting to resolve user...");
        const customData = event.data?.customData || event.data?.custom_data;
        const customerData = event.data?.customer || event.data?.customer_data;
        const email = customerData?.email || event.data?.email;

        console.log(">>> [Webhook] Custom Data:", JSON.stringify(customData));
        console.log(">>> [Webhook] Customer Email:", email);

        let profileId: string | null = null;

        // Priority 1: customData.user_id (new) or customData.userId (legacy)
        const clerkUserId = customData?.user_id || customData?.userId;
        if (clerkUserId) {
            console.log(`>>> [Webhook] Priority 1: Resolved userId: ${clerkUserId}`);
            profileId = await resolveProfileId(clerkUserId);
        }

        // Priority 2: Paddle Subscription ID
        if (!profileId) {
            const paddleSubId = event.data?.subscriptionId || event.data?.subscription_id || (eventType.startsWith('subscription') ? event.data?.id : null);
            if (paddleSubId) {
                console.log(`>>> [Webhook] Priority 2: Checking by Paddle Sub ID: ${paddleSubId}`);
                profileId = await resolveProfileByPaddleSubId(paddleSubId);
            }
        }

        // Priority 3: Email lookup
        if (!profileId && email) {
            console.log(`>>> [Webhook] Priority 3: Checking by Email: ${email}`);
            profileId = await resolveProfileByEmail(email);
        }

        if (!profileId) {
            console.error(`>>> [Webhook] FAILED: Could not resolve user for event ${eventId}`);
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
                    console.log(`>>> [Webhook] Processing transaction.completed. Price ID: ${priceId}`);

                    if (!priceId) {
                        console.error(">>> [Webhook] ERROR: No priceId found in transaction data.");
                        await logWebhook(eventId, eventType, tx, "failed", profileId, "No priceId");
                        break;
                    }

                    const product = getPaddleProduct(priceId);
                    if (!product) {
                        console.error(`>>> [Webhook] ERROR: Unknown priceId ${priceId}. Check paddlePrices.ts.`);
                        await logWebhook(eventId, eventType, tx, "failed", profileId, `Unknown priceId: ${priceId}`);
                        break;
                    }

                    if (product.type === "subscription") {
                        const subProduct = product as PaddleSubscriptionProduct;
                        console.log(`>>> [Webhook] Product identified: ${subProduct.planType} | Type: ${subProduct.type}`);
                        const paddleSubId = tx.subscriptionId || tx.subscription_id || null;
                        console.log(`>>> [Webhook] Sub ID: ${paddleSubId}. Calling activate_plan RPC...`);

                        const paddleCustomerId = tx.customerId || tx.customer_id;
                        const { error } = await supabaseAdmin.rpc("activate_plan", {
                            p_user_id: profileId,
                            p_plan_type: subProduct.planType,
                            p_billing_cycle: subProduct.billingCycle,
                            p_credits: subProduct.credits,
                            p_paddle_subscription_id: paddleSubId,
                            p_paddle_customer_id: paddleCustomerId,
                        });

                        if (error) {
                            console.error(">>> [Webhook] activate_plan RPC FAILED:", error.message);
                            await logWebhook(eventId, eventType, tx, "failed", profileId, `activate_plan RPC: ${error.message}`);

                            // Direct fallback: update tables manually
                            console.log(">>> [Webhook] FALLBACK: Updating tables directly...");

                            const { error: subErr } = await supabaseAdmin.from("subscriptions_v2").upsert({
                                user_id: profileId,
                                plan_type: subProduct.planType,
                                billing_cycle: subProduct.billingCycle,
                                status: "active",
                                paddle_subscription_id: paddleSubId,
                                current_period_start: new Date().toISOString(),
                                next_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                                updated_at: new Date().toISOString(),
                            }, { onConflict: "user_id" });

                            if (subErr) console.error(">>> [Webhook] Fallback Sub Update FAILED:", subErr.message);
                            else console.log(">>> [Webhook] Fallback Sub Update SUCCESS.");

                            const { error: walletErr } = await supabaseAdmin.from("wallet")
                                .update({
                                    monthly_limit: product.credits,
                                    credits_remaining: product.credits,
                                    last_reset_at: new Date().toISOString(),
                                    next_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                                    updated_at: new Date().toISOString(),
                                })
                                .eq("user_id", profileId);

                            if (walletErr) console.error(">>> [Webhook] Fallback Wallet Update FAILED:", walletErr.message);
                            else console.log(">>> [Webhook] Fallback Wallet Update SUCCESS.");

                            await logWebhook(eventId, eventType, tx, "processed", profileId);
                        } else {
                            console.log(`>>> [Webhook] SUCCESS: Plan activated for ${profileId}`);
                            await logWebhook(eventId, eventType, tx, "processed", profileId);
                        }

                    } else if (product.type === "addon") {
                        console.log(`>>> [Webhook] ADDON detected. Credits: ${product.credits}. Calling increment_addon_credits...`);
                        const { error } = await supabaseAdmin.rpc("increment_addon_credits", {
                            p_user_id: profileId,
                            p_amount: product.credits,
                        });

                        if (error) {
                            console.error("[Webhook] increment_addon_credits failed:", error.message);
                            // Fallback: manual update
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

                case "transaction.paid": {
                    console.log(`>>> [Webhook] transaction.paid for ${profileId}. Handled via transaction.completed logic already, but logged here.`);
                    await logWebhook(eventId, eventType, event.data, "processed", profileId);
                    break;
                }

                case "transaction.payment_failed": {
                    console.log(`>>> [Webhook] transaction.payment_failed for ${profileId}. Downgrading to free...`);
                    const { error } = await supabaseAdmin.rpc("cancel_plan", {
                        p_user_id: profileId,
                    });
                    if (error) {
                        await supabaseAdmin.from("subscriptions_v2")
                            .update({ status: "cancelled", plan_type: "free", updated_at: new Date().toISOString() })
                            .eq("user_id", profileId);
                    }
                    await logWebhook(eventId, eventType, event.data, "processed", profileId, "Payment failed: user downgraded");
                    break;
                }

                // ═══════════════════════════════════════
                // SUBSCRIPTION CREATED / UPDATED / ACTIVATED
                // ═══════════════════════════════════════
                case "subscription.created":
                case "subscription.updated":
                case "subscription.activated": {
                    const sub = event.data;
                    const paddleSubId = sub.id;
                    const paddleStatus = sub.status;
                    const items = sub.items || [];
                    const priceId = items[0]?.price?.id;

                    console.log(`>>> [Webhook] Processing ${eventType} for sub ${paddleSubId}. Status: ${paddleStatus}`);

                    // 1. Resolve product/credits
                    let product = priceId ? getPaddleProduct(priceId) : null;
                    if (product && product.type === "subscription") {
                        const subProduct = product as PaddleSubscriptionProduct;

                        // If it's becoming active/trialing, ensure the plan is activated in DB (granting credits)
                        if (paddleStatus === "active" || paddleStatus === "trialing") {
                            console.log(`>>> [Webhook] Activating plan via RPC for status: ${paddleStatus}`);
                            const paddleCustomerId = sub.customerId || sub.customer_id;
                            const { error } = await supabaseAdmin.rpc("activate_plan", {
                                p_user_id: profileId,
                                p_plan_type: subProduct.planType,
                                p_billing_cycle: subProduct.billingCycle,
                                p_credits: subProduct.credits,
                                p_paddle_subscription_id: paddleSubId,
                                p_paddle_customer_id: paddleCustomerId,
                            });

                            if (error) {
                                console.error(">>> [Webhook] activate_plan RPC FAILED in sub event:", error.message);
                            } else {
                                console.log(">>> [Webhook] activate_plan RPC SUCCESS via sub event.");
                            }
                        }
                    }

                    // 2. Sync status regardless of whether we granted credits (handles past_due, etc.)
                    let dbStatus: string;
                    if (paddleStatus === "active" || paddleStatus === "trialing") {
                        dbStatus = "active";
                    } else if (paddleStatus === "past_due") {
                        dbStatus = "past_due";
                    } else if (paddleStatus === "canceled" || paddleStatus === "cancelled") {
                        dbStatus = "cancelled";
                    } else if (paddleStatus === "paused") {
                        dbStatus = "paused";
                    } else {
                        dbStatus = paddleStatus;
                    }

                    await supabaseAdmin.from("subscriptions_v2")
                        .update({
                            paddle_subscription_id: paddleSubId,
                            status: dbStatus,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("user_id", profileId);

                    console.log(`[Webhook] ✓ ${eventType} processed for ${profileId}`);
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
                        // Fallback: direct update
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
            // Return 200 so Paddle doesn't keep retrying a broken handler
            return NextResponse.json({ received: true });
        }

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[Webhook] Fatal error:", message);
        return NextResponse.json({ error: "Webhook error" }, { status: 500 });
    }
}
