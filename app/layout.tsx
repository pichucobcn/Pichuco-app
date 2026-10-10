import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pichuco",
  description: "Hablale a Pichuco. Pichuco se encarga.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/brand/icon-192.png", apple: "/brand/icon-512.png" },
  appleWebApp: { capable: true, title: "Pichuco", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#862820",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Oswald:wght@400;500;600&family=Yesteryear&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
