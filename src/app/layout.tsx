import "./globals.css";

export const metadata = {
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
