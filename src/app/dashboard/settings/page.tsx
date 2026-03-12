"use client";

import { LogOut, Trash2 } from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";

export default function SettingsPage() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-6)" }}>
            <div>
                <h1 style={{ fontSize: "2rem", fontWeight: "700", marginBottom: "var(--spacing-2)" }}>Settings</h1>
                <p style={{ color: "var(--text-secondary)" }}>Manage your account and preferences.</p>
            </div>

            <div className="glass-panel" style={{ padding: "var(--spacing-8)", display: "flex", flexDirection: "column", gap: "var(--spacing-6)" }}>

                {/* ─── ACCOUNT ACTIONS ─── */}
                <div>
                    <h3 style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "var(--spacing-4)" }}>Account Actions</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-3)" }}>
                        <SignOutButton>
                            <button className="secondary-button" style={{ width: "fit-content", display: "flex", alignItems: "center", gap: "8px" }}>
                                <LogOut size={16} /> Sign Out
                            </button>
                        </SignOutButton>
                        <button className="secondary-button" style={{ width: "fit-content", display: "flex", alignItems: "center", gap: "8px", color: "#fca5a5", borderColor: "rgba(239, 68, 68, 0.3)" }}>
                            <Trash2 size={16} /> Delete Account
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
