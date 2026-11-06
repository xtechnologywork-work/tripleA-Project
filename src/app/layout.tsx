import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/auth-context";
import { LanguageProvider } from "@/context/language-context";
import { ThemeProvider } from "@/context/theme-context";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TripleA Car Care",
  description: "Order a car wash from your parking bay. Track it live, from queue to handover.",
  icons: { apple: "/pwa-icon?size=180" },
  appleWebApp: { capable: true, title: "TripleA", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* White mode lives on the admin only: apply the saved choice there before the first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(location.pathname.indexOf("/admin")!==0)return;var t=localStorage.getItem("triplea_theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} antialiased min-h-screen bg-canvas text-ink font-sans`}
      >
        <ThemeProvider>
        <AuthProvider>
          <LanguageProvider>
            <div className="flex flex-col min-h-screen">
              <main className="flex-1">{children}</main>
            </div>
          </LanguageProvider>
        </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
