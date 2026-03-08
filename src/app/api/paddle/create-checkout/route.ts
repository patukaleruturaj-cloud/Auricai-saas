import { auth } from "@clerk/nextjs/server";

const PRICE_MAPPING: Record<string, string> = {
    "starter_monthly": process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTHLY || "pri_01kk48a3ag30jdg86w4mj6t3vm",
    "growth_monthly": process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_MONTHLY || "pri_01kk48azf2tdv3kpg11vzcg497",
    "pro_monthly": process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY || "pri_01kk48c7bq98e7e5tt4mq2br1s",
    "starter_yearly": process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER_YEARLY || "pri_01kk48dyvfgxeg6g01f905r75v",
    "growth_yearly": process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH_YEARLY || "pri_01kk48etjaxhgzswtagfn43b0j",
    "pro_yearly": process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_YEARLY || "pri_01kk48g7zhw6smjabnyarbtv34",
    // Addons
    "addon_200": process.env.NEXT_PUBLIC_PADDLE_PRICE_ADDON_200 || "",
    "addon_600": process.env.NEXT_PUBLIC_PADDLE_PRICE_ADDON_600 || "",
    "addon_1500": process.env.NEXT_PUBLIC_PADDLE_PRICE_ADDON_1500 || "",
};

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { planId } = await req.json();

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

        const response = await fetch("https://sandbox-api.paddle.com/transactions", {
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
                    userId: userId
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
