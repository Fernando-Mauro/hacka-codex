import type { Metadata } from "next";
import { Archivo, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import "./fieldloop/fieldloop.css";

const archivo = Archivo({
  variable: "--font-archivo",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
});

const splineMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FieldLoop — Centro de predicción",
  description:
    "Capa de decisión predictiva para el manejo de cultivos. Sincronizado con John Deere Operations Center.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${archivo.variable} ${splineMono.variable} h-full antialiased`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}
