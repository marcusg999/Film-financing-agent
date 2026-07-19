import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Film Funding Agent",
  description: "Discoverable, contactable, correctly-qualified funding sources for indie film.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "Georgia, serif",
          background: "#0a0d13",
          color: "#e7e9ed",
          minHeight: "100vh",
        }}
      >
        <main style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px" }}>{children}</main>
      </body>
    </html>
  );
}
