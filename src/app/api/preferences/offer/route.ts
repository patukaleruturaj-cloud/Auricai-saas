import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/preferences/offer
 *
 * Retrieves the user's saved offer from `user_preferences`.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data, error } = await supabaseAdmin
            .from("user_preferences")
            .select("offer")
            .eq("user_id", session.userId)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("Error fetching user_preferences:", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({
            offer: data?.offer || "",
        });
    } catch (err: any) {
        console.error("Server error retrieving preferences:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

/**
 * POST /api/preferences/offer
 *
 * Upserts the User's offer into `user_preferences`.
 */
export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const offerValue = body.offer || "";

        const { error } = await supabaseAdmin
            .from("user_preferences")
            .upsert({
                user_id: session.userId,
                offer: offerValue,
                updated_at: new Date().toISOString()
            });

        if (error) {
            console.error("Error upserting user_preferences:", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true, offer: offerValue });
    } catch (err: any) {
        console.error("Server error saving preferences:", err);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
