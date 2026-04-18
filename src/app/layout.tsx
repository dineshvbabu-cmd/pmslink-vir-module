import "./globals.css";

export const metadata = {
  title: "VIR Module",
  description: "Standalone Vessel Inspection Report module for management review and phased delivery.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
