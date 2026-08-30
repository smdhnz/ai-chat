import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body>
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            classNames: {
              toast:
                "rounded-[13px] border-border bg-card px-4 py-[11px] text-[11px] shadow-[0_24px_70px_#1a1a1e1f] dark:shadow-[0_28px_80px_#00000066]",
              icon: "text-primary",
            },
          }}
        />
      </body>
    </html>
  );
}
