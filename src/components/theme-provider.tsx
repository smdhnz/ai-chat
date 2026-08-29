"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

export function ThemeProvider({ nonce, children }: { nonce?: string; children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemeProvider>
  );
}
