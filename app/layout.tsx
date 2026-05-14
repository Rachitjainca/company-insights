import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "Company Insights — NSE/BSE Investor Relations",
    template: "%s · Company Insights",
  },
  description:
    "Search any NSE/BSE-listed company and instantly access quarterly results, investor presentations, concall transcripts, annual reports and KPI handbooks. Export to Google Sheets with one click.",
  keywords: [
    "NSE",
    "BSE",
    "investor relations",
    "quarterly results",
    "XBRL",
    "concall transcript",
    "investor presentation",
    "financial analysis",
  ],
  applicationName: "Company Insights",
  authors: [{ name: "Company Insights" }],
  robots: { index: true, follow: true },
  openGraph: {
    title: "Company Insights — NSE/BSE Investor Relations",
    description:
      "All Indian-listed company IR documents in one place. Search, browse, and export to Google Sheets.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
