import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureUserProvisioned } from "@/lib/credits";

/**
 * GET /api/profile
 * Returns the user's profile, including default_offer.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await ensureUserProvisioned(session.userId);

        const { data: profile, error } = await supabaseAdmin
            .from("profiles")
            .select("id, email, default_offer")
            .eq("clerk_id", session.userId)
            .single();

        if (error || !profile) {
            return NextResponse.json({ default_offer: "" });
        }

        return NextResponse.json({ default_offer: profile.default_offer ?? "" });
    } catch (err: any) {
        console.error("[profile] GET error:", err);
        return NextResponse.json({ error: "Server Error", details: err.message }, { status: 500 });
    }
}

/**
 * PATCH /api/profile
 * Updates the user's default_offer.
 * Body: { default_offer: string }
 */
export async function PATCH(req: Request) {
    try {
        const session = await auth();
        if (!session.userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { default_offer } = body;

        if (typeof default_offer !== "string") {
            return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from("profiles")
            .update({ default_offer: default_offer.trim() })
            .eq("clerk_id", session.userId);

        if (error) {
            console.error("[profile] PATCH error:", error);
            return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("[profile] PATCH error:", err);
        return NextResponse.json({ error: "Server Error", details: err.message }, { status: 500 });
    }
}
