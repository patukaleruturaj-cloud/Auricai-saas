import { auth } from "@clerk/nextjs/server";

const PRICE_MAPPING: Record<string, string> = {
    "starter_monthly": process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY || "pri_01kkewa0zq9q2h9n4jf3dzppcz",
    "basic_monthly": process.env.NEXT_PUBLIC_PADDLE_PRICE_BASIC_MONTHLY || "pri_01kkeveharsajd1j8jqmjz6p8y",
    "growth_monthly": process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_MONTHLY || "pri_01kkevg12ce2pemtwkqyg0ja74",
    "pro_monthly": process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY || "pri_01kkevhkv3zh5v61v9yrhazk90",
    "starter_yearly": process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_YEARLY || "pri_01kkevksxjk34bp98wywqdhjq0",
    "basic_yearly": process.env.NEXT_PUBLIC_PADDLE_PRICE_BASIC_YEARLY || "pri_01kkevn74qmwvrfp27zvr6anag",
    "growth_yearly": process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_YEARLY || "pri_01kkevptnbcgmn0sv5c4qs2s40",
    "pro_yearly": process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_YEARLY || "pri_01kkevr1h59gf7mqsf4477b1mg",
    // Addons
    "addon_200": "pri_01kk7hem70v9mne26n9xj4047p",
    "addon_600": "pri_01kk7htz1mhmet73e0jpvfsfdg",
    "addon_1000": "pri_01kk7r41j1esgf3gk7k19rkkh2",
};

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { planId } = await req.json();

        // ─── ADDON CHECK ───
        if (planId?.startsWith("addon_")) {
            const { supabaseAdmin } = await import("@/lib/supabase-admin");

            // Fetch subscription status from the unified view
            const { data: userStats, error: dbError } = await supabaseAdmin
                .from("user_credit_view")
                .select("subscription_status")
                .eq("clerk_id", userId)
                .single();

            if (dbError || !userStats) {
                console.error("[Checkout API] Failed to fetch user subscription status:", dbError);
                return Response.json({ error: "Failed to verify subscription status" }, { status: 500 });
            }

            if (userStats.subscription_status !== "active") {
                console.warn(`[Checkout API] Blocked add-on purchase for user ${userId} (Status: ${userStats.subscription_status})`);
                return Response.json({
                    error: "Active subscription required to purchase extra credits."
                }, { status: 403 });
            }
        }

        if (!planId) {
            console.error("[Checkout API] Missing planId in request body");
            return Response.json({ error: "planId is required" }, { status: 400 });
        }

        // Try mapping, or use directly if it looks like a Paddle price ID (starts with pri_)
        const priceId = PRICE_MAPPING[planId] || (planId.startsWith("pri_") ? planId : null);
        if (!priceId) {
            console.error(`[Checkout API] Invalid or unmapped planId: ${planId}`);
            return Response.json({ error: `Invalid planId: ${planId}` }, { status: 400 });
        }

        if (!process.env.PADDLE_API_KEY) {
            console.error("PADDLE_API_KEY is not defined");
            return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        console.log(`[Checkout API] Creating transaction for user: ${userId}, planId: ${planId}, priceId: ${priceId}`);

        const paddleApiUrl = process.env.PADDLE_ENV === 'production'
            ? "https://api.paddle.com/transactions"
            : "https://sandbox-api.paddle.com/transactions";

        const response = await fetch(paddleApiUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.PADDLE_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                items: [
                    {
                        price_id: priceId,
                        quantity: 1
                    }
                ],
                custom_data: {
                    user_id: userId
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Paddle API Error:", data);
            return Response.json({ error: data.error || "Paddle API error" }, { status: 500 });
        }

        if (!data.data?.checkout?.url) {
            console.error("Paddle Response missing checkout URL:", data);
            return Response.json({ error: "Checkout URL not returned from Paddle" }, { status: 500 });
        }

        return Response.json({
            checkout_url: data.data.checkout.url,
            transaction_id: data.data.id
        });

    } catch (error: any) {
        console.error("Checkout error:", error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
