import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { cn } from "@/lib/utils";

// Reuse the installed, licensed Expo font assets so a clean web build never
// depends on downloading Google Fonts during localhost startup.
const inter = localFont({
  src: [
    { path: '../node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf', weight: '400', style: 'normal' },
    { path: '../node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf', weight: '500', style: 'normal' },
    { path: '../node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf', weight: '700', style: 'normal' },
  ], variable: '--font-sans', display: 'swap', preload: false,
});

export const metadata: Metadata = {
  title: "Rentral | Find your next. Homes, cars & boats in Lagos",
  description:
    "Find your next home, car or day on the water. Discover Lagos rentals, explore walkthroughs and connect with hosts on Rentral.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", "font-sans", inter.variable)}
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
