import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CitationPay",
  description: "Nanopayments for cited publisher work on Arc Testnet."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
