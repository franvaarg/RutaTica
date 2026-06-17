import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "RutaTica - Toda Costa Rica en una APP",
  description: "Planificador de rutas de autobuses para toda Costa Rica. Encuentra la mejor ruta para tu viaje.",
  keywords: ["RutaTica", "Costa Rica", "autobuses", "rutas", "transporte", "bus", "viaje"],
  authors: [{ name: "RutaTica Team" }],
  openGraph: {
    title: "RutaTica - Toda Costa Rica en una APP",
    description: "Planificador de rutas de autobuses para toda Costa Rica.",
    type: "website",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} antialiased bg-background text-foreground font-poppins`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
