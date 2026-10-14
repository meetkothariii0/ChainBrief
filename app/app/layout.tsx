import "./globals.css";
import { Providers } from "./providers";

export const metadata = { title: "ChainBrief", description: "A weekly briefing on your topics, paid in USDC." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
