"use client";

import { useState, useEffect } from "react";
import { Settings, LogOut, Trash2, Save, CheckCircle, AlertCircle, Loader } from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";

export default function SettingsPage() {
    const [defaultOffer, setDefaultOffer] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [loadingOffer, setLoadingOffer] = useState(true);

    // Load default offer on mount
    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await fetch("/api/profile");
                if (res.ok) {
                    const data = await res.json();
                    setDefaultOffer(data.default_offer ?? "");
                } else {
                    setLoadError("Failed to load your profile.");
                }
            } catch {
                setLoadError("Network error loading profile.");
            } finally {
                setLoadingOffer(false);
            }
        };
        fetchProfile();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        setSaveError("");
        try {
            const res = await fetch("/api/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ default_offer: defaultOffer }),
            });
            if (res.ok) {
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            } else {
                const data = await res.json();
                setSaveError(data.error || "Failed to save.");
            }
        } catch {
            setSaveError("Network error. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-6)" }}>
            <div>
                <h1 style={{ fontSize: "2rem", fontWeight: "700", marginBottom: "var(--spacing-2)" }}>Settings</h1>
                <p style={{ color: "var(--text-secondary)" }}>Manage your account and preferences.</p>
            </div>

            <div className="glass-panel" style={{ padding: "var(--spacing-8)", display: "flex", flexDirection: "column", gap: "var(--spacing-6)" }}>

                {/* ─── DEFAULT OFFER ─── */}
                <div>
                    <h3 style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "var(--spacing-1)" }}>
                        Default Offer / Core Pitch
                    </h3>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "var(--spacing-4)" }}>
                        This auto-fills the "Your Offer" field on the Generate page. You can still edit it per generation without affecting this setting.
                    </p>

                    {loadError && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#fca5a5", fontSize: "0.875rem", marginBottom: "var(--spacing-3)" }}>
                            <AlertCircle size={14} />
                            {loadError}
                        </div>
                    )}

                    <textarea
                        value={defaultOffer}
                        onChange={(e) => { setDefaultOffer(e.target.value); setSaved(false); setSaveError(""); }}
                        className="input-base"
                        rows={4}
                        disabled={loadingOffer}
                        placeholder={loadingOffer ? "Loading…" : "e.g. We help B2B sales teams automate personalised outbound at scale."}
                        style={{ width: "100%", resize: "vertical", marginBottom: "var(--spacing-3)" }}
                    />

                    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)" }}>
                        <button
                            onClick={handleSave}
                            disabled={saving || loadingOffer}
                            className="glow-button"
                            style={{ display: "flex", alignItems: "center", gap: "8px", opacity: saving || loadingOffer ? 0.7 : 1 }}
                        >
                            {saving ? (
                                <><Loader size={14} className="spin" /> Saving…</>
                            ) : (
                                <><Save size={14} /> Save Offer</>
                            )}
                        </button>

                        {saved && (
                            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#4ade80", fontSize: "0.875rem" }}>
                                <CheckCircle size={14} /> Saved!
                            </span>
                        )}
                        {saveError && (
                            <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#fca5a5", fontSize: "0.875rem" }}>
                                <AlertCircle size={14} /> {saveError}
                            </span>
                        )}
                    </div>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)" }} />

                {/* ─── DEFAULT TONE ─── */}
                <div>
                    <h3 style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "var(--spacing-2)" }}>Default Tone</h3>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "var(--spacing-4)" }}>Choose the tone you use most often for generations.</p>
                    <select className="input-base" style={{ maxWidth: "300px" }}>
                        <option>Professional</option>
                        <option>Friendly</option>
                        <option>Direct</option>
                        <option>Bold</option>
                    </select>
                </div>

                <hr style={{ border: "none", borderTop: "1px solid var(--border-subtle)" }} />

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
