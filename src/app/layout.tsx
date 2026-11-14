import type { ReactNode } from "react";
import { SideNav } from "./components/SideNav";
import { SessionPicker } from "./components/SessionPicker";
import { getServer } from "./server";
import { Geist, Geist_Mono } from "next/font/google";
import "./theme.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata = { title: "Governed Memory Layer" };
export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: ReactNode }) {
  const { sessions } = await getServer();
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <div className="shell">
          <SideNav>
            <SessionPicker sessions={sessions} />
          </SideNav>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
