"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Bookmark,
  ExternalLink,
  Film,
  Flag,
  Globe,
  History,
  Home,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Moon,
  PlaySquare,
  ShoppingBag,
  Store,
  Sun,
  Upload,
  Users,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, resolveMediaUrl } from "@/lib/api";

interface Channel {
  id: number;
  owner_id: number;
  name: string;
  handle: string;
  description: string;
  image_url?: string;
}

interface Shop {
  id: number;
  owner_id: number;
  name: string;
  slug: string;
  motto?: string;
  category?: string;
  logo_url?: string;
}

interface PageItem {
  id: number;
  owner_id: number;
  name: string;
  handle: string;
  category: string;
  about: string;
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const router = useRouter();
  const [lang, setLang] = useState("en");
  const [currency, setCurrency] = useState("BDT");
  const [savedMsg, setSavedMsg] = useState("");

  // Existing user channels, shops & pages
  const [myChannels, setMyChannels] = useState<Channel[]>([]);
  const [myShops, setMyShops] = useState<Shop[]>([]);
  const [myPages, setMyPages] = useState<PageItem[]>([]);

  // Active setup tab in Settings ("none" | "channel" | "shop" | "page")
  const [activeForm, setActiveForm] = useState<"none" | "channel" | "shop" | "page">("none");
  const [setupMsg, setSetupMsg] = useState("");
  const [setupErr, setSetupErr] = useState("");

  // Create Channel state
  const [chName, setChName] = useState("");
  const [chHandle, setChHandle] = useState("");
  const [chDesc, setChDesc] = useState("");
  const [chImageUrl, setChImageUrl] = useState("");
  const [uploadingChImg, setUploadingChImg] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const chImgInputRef = useRef<HTMLInputElement | null>(null);

  // Open Shop state
  const [shopName, setShopName] = useState("");
  const [shopSlug, setShopSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [shopMotto, setShopMotto] = useState("");
  const [shopDesc, setShopDesc] = useState("");
  const [shopLogoUrl, setShopLogoUrl] = useState("");
  const [shopContact, setShopContact] = useState("");
  const [shopCategory, setShopCategory] = useState("Electronics");
  const [themeColor, setThemeColor] = useState("#DE4018");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [creatingShop, setCreatingShop] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Create Page state
  const [pageName, setPageName] = useState("");
  const [pageHandle, setPageHandle] = useState("");
  const [pageHandleEdited, setPageHandleEdited] = useState(false);
  const [pageCategory, setPageCategory] = useState("Business");
  const [pageAbout, setPageAbout] = useState("");
  const [pageWebsite, setPageWebsite] = useState("");
  const [creatingPage, setCreatingPage] = useState(false);

  const loadMyAssets = async () => {
    if (!user) return;
    const [chs, shops, pages] = await Promise.all([
      apiFetch<Channel[]>("/api/videos/channels"),
      apiFetch<Shop[]>("/api/shops"),
      apiFetch<PageItem[]>("/api/communities/pages"),
    ]);
    setMyChannels(chs.filter((c) => c.owner_id === user.id));
    setMyShops(shops.filter((s) => s.owner_id === user.id));
    setMyPages(pages.filter((p) => p.owner_id === user.id));
  };

  useEffect(() => {
    if (user) loadMyAssets().catch(() => {});
  }, [user?.id]);

  const saveLocalization = async () => {
    if (!user) return;
    await apiFetch("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ language: lang, currency }),
    });
    setSavedMsg("Language & currency preferences saved!");
  };

  const handleSignOut = () => {
    logout();
    router.push("/auth");
  };

  const handleChannelImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSetupErr("");
    setUploadingChImg(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<{ url: string }>("/api/videos/channels/upload-image", {
        method: "POST",
        body: form,
      });
      setChImageUrl(res.url);
    } catch (err: any) {
      setSetupErr(err.message || "Failed to upload channel image");
    } finally {
      setUploadingChImg(false);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupErr("");
    setSetupMsg("");
    if (!chImageUrl.trim()) {
      setSetupErr("Please upload a channel image or provide an image URL.");
      return;
    }
    setCreatingChannel(true);
    try {
      const created = await apiFetch<Channel>("/api/videos/channels", {
        method: "POST",
        body: JSON.stringify({
          name: chName,
          handle: chHandle,
          description: chDesc,
          image_url: chImageUrl,
        }),
      });
      setMyChannels((prev) => [created, ...prev]);
      setChName("");
      setChHandle("");
      setChDesc("");
      setChImageUrl("");
      setActiveForm("none");
      setSetupMsg(`Creator channel @${created.handle} created!`);
    } catch (err: any) {
      setSetupErr(err.message || "Failed to create channel");
    } finally {
      setCreatingChannel(false);
    }
  };

  const handleShopLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSetupErr("");
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<{ url: string }>("/api/shops/upload-logo", {
        method: "POST",
        body: form,
      });
      setShopLogoUrl(res.url);
    } catch (err: any) {
      setSetupErr(err.message || "Failed to upload shop logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupErr("");
    setSetupMsg("");
    if (!shopLogoUrl.trim()) {
      setSetupErr("Please upload a shop logo/image or provide an image URL.");
      return;
    }
    setCreatingShop(true);
    try {
      const created = await apiFetch<Shop>("/api/shops", {
        method: "POST",
        body: JSON.stringify({
          name: shopName,
          slug: shopSlug,
          motto: shopMotto,
          description: shopDesc,
          logo_url: shopLogoUrl,
          contact_number: shopContact,
          category: shopCategory,
          theme_color: themeColor,
        }),
      });
      setMyShops((prev) => [created, ...prev]);
      setShopName("");
      setShopSlug("");
      setSlugEdited(false);
      setShopMotto("");
      setShopDesc("");
      setShopLogoUrl("");
      setShopContact("");
      setShopCategory("Electronics");
      setActiveForm("none");
      setSetupMsg(`Shop /shop/${created.slug} opened!`);
    } catch (err: any) {
      setSetupErr(err.message || "Failed to open shop");
    } finally {
      setCreatingShop(false);
    }
  };

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupErr("");
    setSetupMsg("");
    setCreatingPage(true);
    try {
      const created = await apiFetch<PageItem>("/api/communities/pages", {
        method: "POST",
        body: JSON.stringify({
          name: pageName,
          handle: pageHandle,
          category: pageCategory,
          about: pageAbout,
          website: pageWebsite,
        }),
      });
      setMyPages((prev) => [created, ...prev]);
      setPageName("");
      setPageHandle("");
      setPageHandleEdited(false);
      setPageCategory("Business");
      setPageAbout("");
      setPageWebsite("");
      setActiveForm("none");
      setSetupMsg(`Page "${created.name}" (@${created.handle}) created!`);
    } catch (err: any) {
      setSetupErr(err.message || "Failed to create page");
    } finally {
      setCreatingPage(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-xs text-fb-muted mt-0.5">Manage preferences, workspaces, and creation tools</p>
        </div>
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-fb-blue font-semibold hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>

      {/* Workspaces & Services Hub */}
      <div className="bg-fb-card border border-fb-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-fb-blue/10 text-fb-blue flex items-center justify-center font-bold">
            <LayoutGrid className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold">Workspaces &amp; Services</h2>
            <p className="text-xs text-fb-muted">
              Quick access to all platform modules, creator suites, seller hubs, and community workspaces.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
          <Link
            href="/"
            className="p-3 rounded-xl bg-fb-input hover:bg-fb-hover transition space-y-1 block border border-transparent hover:border-fb-border"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-fb-blue flex items-center justify-center font-bold">
              <Home className="w-4 h-4" />
            </div>
            <div className="font-bold text-sm">Social Feed</div>
            <div className="text-[11px] text-fb-muted">Posts, stories &amp; reactions</div>
          </Link>

          <Link
            href="/saved"
            className="p-3 rounded-xl bg-fb-input hover:bg-fb-hover transition space-y-1 block border border-transparent hover:border-fb-border"
          >
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
              <Bookmark className="w-4 h-4" />
            </div>
            <div className="font-bold text-sm">Saved Items</div>
            <div className="text-[11px] text-fb-muted">Bookmarks &amp; collections</div>
          </Link>

          <Link
            href="/memories"
            className="p-3 rounded-xl bg-fb-input hover:bg-fb-hover transition space-y-1 block border border-transparent hover:border-fb-border"
          >
            <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-600 flex items-center justify-center font-bold">
              <History className="w-4 h-4" />
            </div>
            <div className="font-bold text-sm">Memories</div>
            <div className="text-[11px] text-fb-muted">On this day retrospectives</div>
          </Link>

          <Link
            href="/activity-log"
            className="p-3 rounded-xl bg-fb-input hover:bg-fb-hover transition space-y-1 block border border-transparent hover:border-fb-border"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
              <Activity className="w-4 h-4" />
            </div>
            <div className="font-bold text-sm">Activity Log</div>
            <div className="text-[11px] text-fb-muted">Audit trail &amp; interactions</div>
          </Link>

          <Link
            href="/tube"
            className="p-3 rounded-xl bg-fb-input hover:bg-fb-hover transition space-y-1 block border border-transparent hover:border-fb-border"
          >
            <div className="w-8 h-8 rounded-lg bg-fb-blue/10 text-fb-blue flex items-center justify-center font-bold">
              <PlaySquare className="w-4 h-4" />
            </div>
            <div className="font-bold text-sm">Tube &amp; Watch</div>
            <div className="text-[11px] text-fb-muted">Videos, shorts &amp; watch later</div>
          </Link>

          <Link
            href="/studio"
            className="p-3 rounded-xl bg-fb-input hover:bg-fb-hover transition space-y-1 block border border-transparent hover:border-fb-border"
          >
            <div className="w-8 h-8 rounded-lg bg-fb-blue/10 text-fb-blue flex items-center justify-center font-bold">
              <Film className="w-4 h-4" />
            </div>
            <div className="font-bold text-sm">Creator Studio</div>
            <div className="text-[11px] text-fb-muted">Uploads, analytics &amp; edit videos</div>
          </Link>

          <Link
            href="/shop"
            className="p-3 rounded-xl bg-fb-input hover:bg-fb-hover transition space-y-1 block border border-transparent hover:border-fb-border"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div className="font-bold text-sm">Storefronts</div>
            <div className="text-[11px] text-fb-muted">Shop products &amp; checkout</div>
          </Link>

          <Link
            href="/seller"
            className="p-3 rounded-xl bg-fb-input hover:bg-fb-hover transition space-y-1 block border border-transparent hover:border-fb-border"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
              <Store className="w-4 h-4" />
            </div>
            <div className="font-bold text-sm">Seller Hub</div>
            <div className="text-[11px] text-fb-muted">Inventory, stock &amp; orders</div>
          </Link>

          <Link
            href="/messenger"
            className="p-3 rounded-xl bg-fb-input hover:bg-fb-hover transition space-y-1 block border border-transparent hover:border-fb-border"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-fb-blue flex items-center justify-center font-bold">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div className="font-bold text-sm">Messenger</div>
            <div className="text-[11px] text-fb-muted">Direct chats &amp; group voice</div>
          </Link>

          <Link
            href="/communities"
            className="p-3 rounded-xl bg-fb-input hover:bg-fb-hover transition space-y-1 block border border-transparent hover:border-fb-border"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
              <Users className="w-4 h-4" />
            </div>
            <div className="font-bold text-sm">Communities</div>
            <div className="text-[11px] text-fb-muted">Pages, groups &amp; discussions</div>
          </Link>
        </div>
      </div>

      {/* Create Channel & Open Shop (Unified Setup Hub in Settings) */}
      <div className="bg-fb-card border border-fb-border rounded-xl p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold">Creator Channel, Shop &amp; Page Setup</h2>
          <p className="text-xs text-fb-muted">
            Create your Creator channel, open your e-commerce shop, or create your Page directly from Settings.
          </p>
        </div>

        {!user ? (
          <div className="p-3 rounded-lg bg-fb-input flex items-center justify-between text-xs">
            <span className="text-fb-muted">Sign in to create a channel, shop, or page.</span>
            <Link href="/auth" className="px-3.5 py-1.5 rounded-lg bg-fb-blue text-white font-semibold">
              Sign In
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  setSetupErr("");
                  setSetupMsg("");
                  setActiveForm(activeForm === "channel" ? "none" : "channel");
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition ${
                  activeForm === "channel"
                    ? "border-fb-blue bg-fb-blue/10 text-fb-blue"
                    : "border-fb-border bg-fb-input hover:bg-fb-hover"
                }`}
              >
                <PlaySquare className="w-4 h-4 text-fb-blue" />
                Create a Channel
              </button>

              <button
                type="button"
                onClick={() => {
                  setSetupErr("");
                  setSetupMsg("");
                  setActiveForm(activeForm === "shop" ? "none" : "shop");
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition ${
                  activeForm === "shop"
                    ? "border-emerald-600 bg-emerald-600/10 text-emerald-600"
                    : "border-fb-border bg-fb-input hover:bg-fb-hover"
                }`}
              >
                <Store className="w-4 h-4 text-emerald-600" />
                Open a Shop
              </button>

              <button
                type="button"
                onClick={() => {
                  setSetupErr("");
                  setSetupMsg("");
                  setActiveForm(activeForm === "page" ? "none" : "page");
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold transition ${
                  activeForm === "page"
                    ? "border-fb-blue bg-fb-blue/10 text-fb-blue"
                    : "border-fb-border bg-fb-input hover:bg-fb-hover"
                }`}
              >
                <Flag className="w-4 h-4 text-fb-blue" />
                Create a Page
              </button>
            </div>

            {setupMsg && <p className="text-xs font-medium text-emerald-600">{setupMsg}</p>}
            {setupErr && <p className="text-xs font-medium text-red-600">{setupErr}</p>}

            {/* Create a Channel Form */}
            {activeForm === "channel" && (
              <form onSubmit={handleCreateChannel} className="pt-3 border-t border-fb-border space-y-3">
                <h3 className="text-sm font-bold">Create Creator Channel</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    required
                    minLength={2}
                    value={chName}
                    onChange={(e) => setChName(e.target.value)}
                    placeholder="Channel Name"
                    className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  />
                  <input
                    required
                    minLength={2}
                    value={chHandle}
                    onChange={(e) => setChHandle(e.target.value)}
                    placeholder="Username / Handle (e.g. tech_studio)"
                    className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  />
                </div>
                <textarea
                  required
                  minLength={5}
                  rows={2}
                  value={chDesc}
                  onChange={(e) => setChDesc(e.target.value)}
                  placeholder="Channel description..."
                  className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none resize-none"
                />
                <div className="space-y-2">
                  <input
                    ref={chImgInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleChannelImageUpload}
                    className="hidden"
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                    <button
                      type="button"
                      disabled={uploadingChImg}
                      onClick={() => chImgInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs font-semibold shrink-0 disabled:opacity-60"
                    >
                      <Upload className="w-3.5 h-3.5 text-fb-blue" />
                      {uploadingChImg ? "Uploading..." : "Upload Channel Image"}
                    </button>
                    <input
                      required
                      value={chImageUrl}
                      onChange={(e) => setChImageUrl(e.target.value)}
                      placeholder="Channel Image URL (or upload from PC)"
                      className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                    />
                    {chImageUrl && (
                      <img
                        src={resolveMediaUrl(chImageUrl)}
                        alt="Channel preview"
                        className="w-9 h-9 rounded-full object-cover border border-fb-border shrink-0"
                      />
                    )}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={creatingChannel}
                  className="px-4 py-2 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-xs font-semibold disabled:opacity-60"
                >
                  {creatingChannel ? "Creating..." : "Create Channel"}
                </button>
              </form>
            )}

            {/* Open a Shop Form */}
            {activeForm === "shop" && (
              <form onSubmit={handleCreateShop} className="pt-3 border-t border-fb-border space-y-3">
                <h3 className="text-sm font-bold">Open Your E-Commerce Shop</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    required
                    minLength={2}
                    value={shopName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setShopName(val);
                      if (!slugEdited) {
                        setShopSlug(
                          val
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-+|-+$/g, "")
                        );
                      }
                    }}
                    placeholder="Shop Name (e.g. Dhaka Gadgets)"
                    className="px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  />
                  <input
                    required
                    minLength={2}
                    value={shopSlug}
                    onChange={(e) => {
                      setSlugEdited(true);
                      setShopSlug(e.target.value);
                    }}
                    placeholder="URL Slug (e.g. dhaka-gadgets)"
                    className="px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  />
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fb-input">
                    <span className="text-xs text-fb-muted">Theme:</span>
                    <input
                      type="color"
                      value={themeColor}
                      onChange={(e) => setThemeColor(e.target.value)}
                      className="w-8 h-6 bg-transparent border-0 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    required
                    minLength={2}
                    value={shopMotto}
                    onChange={(e) => setShopMotto(e.target.value)}
                    placeholder="Shop Motto"
                    className="px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  />
                  <input
                    required
                    minLength={5}
                    value={shopContact}
                    onChange={(e) => setShopContact(e.target.value)}
                    placeholder="Contact Number"
                    className="px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  />
                  <select
                    required
                    value={shopCategory}
                    onChange={(e) => setShopCategory(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  >
                    <option value="Electronics">Electronics</option>
                    <option value="Fashion">Fashion &amp; Apparel</option>
                    <option value="Groceries">Groceries &amp; Food</option>
                    <option value="Home & Living">Home &amp; Living</option>
                    <option value="Beauty & Health">Beauty &amp; Health</option>
                    <option value="Books & Stationery">Books &amp; Stationery</option>
                    <option value="Sports & Outdoors">Sports &amp; Outdoors</option>
                    <option value="Digital Goods">Digital Goods</option>
                    <option value="General">General</option>
                  </select>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleShopLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs font-semibold shrink-0 disabled:opacity-60"
                  >
                    <Upload className="w-3.5 h-3.5 text-fb-blue" />
                    {uploadingLogo ? "Uploading..." : "Upload Shop Logo / Image"}
                  </button>
                  <input
                    required
                    value={shopLogoUrl}
                    onChange={(e) => setShopLogoUrl(e.target.value)}
                    placeholder="Shop Logo / Image URL (or upload from PC)"
                    className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  />
                  {shopLogoUrl && (
                    <img
                      src={resolveMediaUrl(shopLogoUrl)}
                      alt="Shop logo preview"
                      className="w-9 h-9 rounded-lg object-cover border border-fb-border shrink-0"
                    />
                  )}
                </div>

                <textarea
                  required
                  minLength={5}
                  rows={2}
                  value={shopDesc}
                  onChange={(e) => setShopDesc(e.target.value)}
                  placeholder="Shop description..."
                  className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none resize-none"
                />
                <button
                  type="submit"
                  disabled={creatingShop}
                  className="px-4 py-2 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-xs font-semibold disabled:opacity-60"
                >
                  {creatingShop ? "Launching..." : "Launch Storefront"}
                </button>
              </form>
            )}

            {/* Create a Page Form */}
            {activeForm === "page" && (
              <form onSubmit={handleCreatePage} className="pt-3 border-t border-fb-border space-y-3">
                <h3 className="text-sm font-bold">Create a Page</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    required
                    minLength={2}
                    value={pageName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPageName(val);
                      if (!pageHandleEdited) {
                        setPageHandle(
                          val
                            .toLowerCase()
                            .replace(/[^a-z0-9_]+/g, "_")
                            .replace(/^_+|_+$/g, "")
                        );
                      }
                    }}
                    placeholder="Page Name"
                    className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  />
                  <input
                    required
                    minLength={2}
                    value={pageHandle}
                    onChange={(e) => {
                      setPageHandleEdited(true);
                      setPageHandle(e.target.value);
                    }}
                    placeholder="Page Username / Handle (e.g. my_page)"
                    className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    required
                    value={pageCategory}
                    onChange={(e) => setPageCategory(e.target.value)}
                    placeholder="Category (e.g. Business, Creator, Tech)"
                    className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  />
                  <input
                    value={pageWebsite}
                    onChange={(e) => setPageWebsite(e.target.value)}
                    placeholder="Optional Website URL"
                    className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
                  />
                </div>
                <textarea
                  required
                  minLength={5}
                  rows={2}
                  value={pageAbout}
                  onChange={(e) => setPageAbout(e.target.value)}
                  placeholder="About this page..."
                  className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none resize-none"
                />
                <button
                  type="submit"
                  disabled={creatingPage}
                  className="px-4 py-2 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-xs font-semibold disabled:opacity-60"
                >
                  {creatingPage ? "Creating..." : "Create Page"}
                </button>
              </form>
            )}

            {/* User's existing Channels, Shops & Pages summary */}
            {(myChannels.length > 0 || myShops.length > 0 || myPages.length > 0) && (
              <div className="pt-3 border-t border-fb-border grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {myChannels.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="font-bold text-fb-muted uppercase tracking-wider text-[11px]">Your Channels</div>
                    {myChannels.map((c) => (
                      <Link
                        key={c.id}
                        href="/tube"
                        className="flex items-center justify-between p-2 rounded-lg bg-fb-input hover:bg-fb-hover"
                      >
                        <span className="font-semibold truncate">{c.name} (@{c.handle})</span>
                        <ExternalLink className="w-3.5 h-3.5 text-fb-muted shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
                {myShops.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="font-bold text-fb-muted uppercase tracking-wider text-[11px]">Your Shops</div>
                    {myShops.map((s) => (
                      <Link
                        key={s.id}
                        href={`/shop/${s.slug}`}
                        className="flex items-center justify-between p-2 rounded-lg bg-fb-input hover:bg-fb-hover"
                      >
                        <span className="font-semibold truncate">{s.name}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-fb-muted shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
                {myPages.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="font-bold text-fb-muted uppercase tracking-wider text-[11px]">Your Pages</div>
                    {myPages.map((p) => (
                      <Link
                        key={p.id}
                        href={`/pages/${p.handle}`}
                        className="flex items-center justify-between p-2 rounded-lg bg-fb-input hover:bg-fb-hover"
                      >
                        <span className="font-semibold truncate">{p.name}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-fb-muted shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Theme Settings */}
      <div className="bg-fb-card border border-fb-border rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="text-base font-bold">Display &amp; Theme</h2>
        <p className="text-xs text-fb-muted">Switch between clean Light Mode and Dark Mode across NexusHub.</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setTheme("light")}
            className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold ${
              theme === "light" ? "border-fb-blue bg-fb-blue/10 text-fb-blue" : "border-fb-border bg-fb-input"
            }`}
          >
            <Sun className="w-4 h-4" />
            Light
          </button>
          <button
            onClick={() => setTheme("dark")}
            className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-semibold ${
              theme === "dark" ? "border-fb-blue bg-fb-blue/10 text-fb-blue" : "border-fb-border bg-fb-input"
            }`}
          >
            <Moon className="w-4 h-4" />
            Dark
          </button>
        </div>
      </div>

      {/* Localization & Currency */}
      <div className="bg-fb-card border border-fb-border rounded-xl p-5 shadow-sm space-y-3">
        <h2 className="text-base font-bold flex items-center gap-2">
          <Globe className="w-4 h-4 text-fb-blue" />
          Language &amp; Region
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fb-muted mb-1">Language</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm">
              <option value="en">English (EN)</option>
              <option value="bn">বাংলা (Bangla)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fb-muted mb-1">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm">
              <option value="BDT">BDT (৳ — Bangladesh)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
        </div>
        {user && (
          <button onClick={saveLocalization} className="px-4 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold">
            Save Preferences
          </button>
        )}
        {savedMsg && <p className="text-xs text-emerald-600">{savedMsg}</p>}
      </div>

      {/* Account / Sign Out */}
      <div className="bg-fb-card border border-fb-border rounded-xl p-5 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Account</h2>
          <p className="text-xs text-fb-muted">
            {user ? `Signed in as ${user.display_name} (@${user.username})` : "Not signed in"}
          </p>
        </div>
        {user ? (
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600/10 text-red-600 dark:text-red-400 hover:bg-red-600/20 text-sm font-semibold"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        ) : (
          <Link href="/auth" className="px-4 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold">
            Sign In
          </Link>
        )}
      </div>
    </div>
  );
}
