import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "@/app/_components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "chat - fumiya.dev",
  manifest: "/site.webmanifest",
  appleWebApp: { title: "Chat" },
  icons: {
    icon: [
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
      { url: "/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster
            position="bottom-center"
            toastOptions={{
              classNames: {
                toast:
                  "rounded-[13px] border-border bg-card px-4 py-[11px] text-[11px] shadow-[0_24px_70px_#4c392718] dark:shadow-[0_28px_80px_#100d0966]",
                icon: "text-primary",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
