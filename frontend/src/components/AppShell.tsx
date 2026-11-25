"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Home,
  MessageCircle,
  PlaySquare,
  Search,
  Settings,
  ShoppingBag,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { resolveMediaUrl } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/tube", label: "Creator", icon: PlaySquare },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/messenger", label: "Messenger", icon: MessageCircle },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, liveEvents } = useAuth();
  const [showNotifs, setShowNotifs] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="min-h-screen bg-fb-canvas text-fb-text flex flex-col">
      {/* Top Header Bar (Facebook-style, no sidebar) */}
      <header className="sticky top-0 z-40 h-14 bg-fb-card border-b border-fb-border shadow-sm px-3 sm:px-5 flex items-center justify-between gap-3">
        {/* Left: Brand + Search */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 rounded-full bg-fb-blue flex items-center justify-center font-extrabold text-white text-lg tracking-tight shadow-sm">
              N
            </div>
            <span className="font-bold text-xl tracking-tight text-fb-blue hidden sm:inline">
              NexusHub
            </span>
          </Link>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (searchTerm.trim()) router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
            }}
            className="hidden lg:flex items-center gap-2 bg-fb-input rounded-full px-3.5 py-2 w-56"
          >
            <Search className="w-4 h-4 text-fb-muted shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search NexusHub"
              className="bg-transparent text-sm text-fb-text placeholder:text-fb-muted focus:outline-none w-full"
            />
          </form>
        </div>

        {/* Center: Primary Navigation Tabs */}
        <nav className="hidden md:flex items-center h-full gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`relative h-full px-5 lg:px-7 flex items-center gap-2 text-sm font-semibold transition-colors rounded-lg my-1 ${
                  active
                    ? "text-fb-blue"
                    : "text-fb-muted hover:bg-fb-hover hover:text-fb-text"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="hidden xl:inline">{item.label}</span>
                {active && (
                  <span className="absolute bottom-0 inset-x-1 h-[3px] bg-fb-blue rounded-t-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right: Notifications, Settings, Profile */}
        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            title="Notifications"
            className="relative w-9 h-9 rounded-full bg-fb-input hover:bg-fb-hover flex items-center justify-center text-fb-text transition"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {liveEvents.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-[10px] font-bold flex items-center justify-center text-white">
                {liveEvents.length}
              </span>
            )}
          </button>

          <Link
            href="/settings"
            title="Settings"
            className={`w-9 h-9 rounded-full flex items-center justify-center transition ${
              pathname === "/settings"
                ? "bg-fb-blue text-white"
                : "bg-fb-input hover:bg-fb-hover text-fb-text"
            }`}
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>

          <Link
            href={user ? "/profile" : "/auth"}
            title={user ? "Profile" : "Sign In"}
            className={`flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full text-sm font-semibold transition ${
              pathname === "/profile"
                ? "bg-fb-blue text-white"
                : "bg-fb-input hover:bg-fb-hover text-fb-text"
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-fb-blue text-white flex items-center justify-center text-xs font-bold overflow-hidden">
              {user ? (
                user.avatar_url ? (
                  <img
                    src={resolveMediaUrl(user.avatar_url)}
                    alt={user.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  user.display_name[0]?.toUpperCase()
                )
              ) : (
                <UserIcon className="w-4 h-4" />
              )}
            </div>
            <span className="hidden sm:inline max-w-[90px] truncate">
              {user ? user.display_name.split(" ")[0] : "Sign In"}
            </span>
          </Link>

          {/* Notifications Dropdown */}
          {showNotifs && (
            <div className="absolute right-0 top-12 w-80 max-w-[92vw] bg-fb-card border border-fb-border rounded-xl shadow-xl p-3 z-50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-fb-border">
                <span className="text-sm font-bold">Notifications</span>
                <button
                  onClick={() => setShowNotifs(false)}
                  className="text-xs text-fb-blue font-semibold hover:underline"
                >
                  Close
                </button>
              </div>
              {liveEvents.length === 0 ? (
                <p className="text-xs text-fb-muted py-6 text-center">
                  No new notifications yet. Activity from Messenger, Creator, and Shop webhooks appears here live.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {liveEvents.map((ev, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-fb-input text-xs space-y-0.5"
                    >
                      <div className="font-semibold text-fb-blue">{ev.event}</div>
                      {ev.title && <div className="font-medium text-fb-text">{ev.title}</div>}
                      {ev.body && <div className="text-fb-muted truncate">{ev.body}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Page Content */}
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-3 sm:px-5 py-4 sm:py-5 pb-20 md:pb-6">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 h-14 bg-fb-card border-t border-fb-border flex justify-around items-center">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-semibold ${
                active ? "text-fb-blue" : "text-fb-muted"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
