import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import PaddleInitializer from "@/components/PaddleInitializer";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AuricAI | Turn Cold DMs Into Warm Replies",
  description: "Generate hyper-personalized LinkedIn openers in seconds. Built for serious outbound teams.",
  icons: { icon: "/logo.png" }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${inter.variable} antialiased`}>
          {children}
          <PaddleInitializer />
        </body>
      </html>
    </ClerkProvider>
  );
}
