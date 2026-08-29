import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  // The manifest is what makes this installable, and what Bubblewrap reads to
  // generate the Android TWA — name, icons, theme and start URL all come from
  // public/manifest.webmanifest rather than being restated here.
  manifest: "/manifest.webmanifest",
  applicationName: "CrisisLink",
  appleWebApp: { capable: true, title: "CrisisLink", statusBarStyle: "default" },
  title: "CrisisLink",
  description:
    "Crowdsourced disaster reporting and verification for India: citizen reports, clustered and confidence-scored, alongside official hazard feeds.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The report form is used one-handed on a phone, often in a hurry.
  maximumScale: 5,
  themeColor: "#b91c1c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="font-sans min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
