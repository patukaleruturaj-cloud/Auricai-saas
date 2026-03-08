import { SignUp } from "@clerk/nextjs";

export default function Page() {
    return (
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--spacing-4)" }}>
            <SignUp appearance={{
                variables: {
                    colorPrimary: '#8b5cf6',
                    colorBackground: '#1e1e20',
                    colorText: 'white',
                    colorInputBackground: 'rgba(0,0,0,0.5)',
                    colorInputText: 'white',
                }
            }} />
        </main>
    );
}
