"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShoppingCart, CheckCircle2, Package, Tag, Phone } from "lucide-react";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Product {
  id: number;
  name: string;
  description: string;
  price_dollars: number;
  stock: number;
  category: string;
  image_url: string;
}

interface ActiveCoupon {
  id: number;
  code: string;
  discount_type: string;
  discount_value: number;
}

interface ShopDetail {
  id: number;
  name: string;
  slug: string;
  motto?: string;
  description: string;
  logo_url?: string;
  contact_number?: string;
  category?: string;
  theme_color: string;
  products: Product[];
  active_coupons?: ActiveCoupon[];
}

export default function StorefrontPage() {
  const params = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [shop, setShop] = useState<ShopDetail | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [address, setAddress] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [orderDone, setOrderDone] = useState<string>("");
  const [error, setError] = useState("");

  const loadShop = async () => {
    const data = await apiFetch<ShopDetail>(`/api/shops/${params.slug}`);
    setShop(data);
  };

  useEffect(() => {
    if (params.slug) loadShop().catch(() => {});
  }, [params.slug]);

  const addToCart = (pid: number) => {
    setCart((prev) => ({ ...prev, [pid]: (prev[pid] || 0) + 1 }));
  };

  const cartItems = shop
    ? shop.products.filter((p) => (cart[p.id] || 0) > 0).map((p) => ({ ...p, qty: cart[p.id] }))
    : [];
  const total = cartItems.reduce((sum, i) => sum + i.price_dollars * i.qty, 0);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || cartItems.length === 0) return;
    setError("");
    try {
      const res = await apiFetch<{ id: number; total_dollars: number; discount_dollars?: number }>("/api/shops/orders", {
        method: "POST",
        body: JSON.stringify({
          shop_id: shop.id,
          shipping_address: address,
          coupon_code: couponCode,
          payment_method: paymentMethod,
          items: cartItems.map((i) => ({ product_id: i.id, quantity: i.qty })),
        }),
      });
      setOrderDone(
        `Order #${res.id} confirmed ($${res.total_dollars.toFixed(2)}${
          res.discount_dollars ? `, saved $${res.discount_dollars.toFixed(2)}` : ""
        })!`
      );
      setCart({});
      setAddress("");
      setCouponCode("");
      loadShop();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!shop) {
    return <div className="p-8 text-center text-sm text-fb-muted">Loading storefront...</div>;
  }

  return (
    <div className="space-y-5">
      <Link href="/shop" className="inline-flex items-center gap-1.5 text-xs text-fb-muted hover:text-fb-text font-semibold">
        <ArrowLeft className="w-4 h-4" />
        Back to Marketplace
      </Link>

      {/* Shop Header */}
      <div
        className="rounded-xl p-6 border border-fb-border bg-fb-card shadow-sm space-y-3"
        style={{ borderTop: `4px solid ${shop.theme_color}` }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {shop.logo_url ? (
            <img
              src={resolveMediaUrl(shop.logo_url)}
              alt={shop.name}
              className="w-16 h-16 rounded-xl object-cover border border-fb-border shrink-0"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-2xl shrink-0"
              style={{ backgroundColor: shop.theme_color }}
            >
              {shop.name[0]?.toUpperCase()}
            </div>
          )}
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{shop.name}</h1>
              {shop.category && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-fb-input text-xs font-semibold text-fb-muted">
                  <Tag className="w-3 h-3" /> {shop.category}
                </span>
              )}
            </div>
            {shop.motto && <p className="text-sm font-semibold text-fb-blue">{shop.motto}</p>}
            <p className="text-sm text-fb-muted">{shop.description}</p>
            {shop.contact_number && (
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-fb-text pt-0.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" /> {shop.contact_number}
              </p>
            )}
          </div>
        </div>

        {/* Active Offers & Discount Coupons on Shop Header */}
        {shop.active_coupons && shop.active_coupons.length > 0 && (
          <div className="pt-3 border-t border-fb-border flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <Tag className="w-3.5 h-3.5" />
              Special Offers:
            </span>
            {shop.active_coupons.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCouponCode(c.code)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition"
                title="Click to apply coupon at checkout"
              >
                <span>
                  Use <strong>{c.code}</strong> for{" "}
                  {c.discount_type === "percent" ? `${c.discount_value}% OFF` : `$${c.discount_value} OFF`}
                </span>
                <span className="text-[10px] underline">Apply</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {orderDone && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          {orderDone}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {shop.products.map((p) => (
            <div key={p.id} className="bg-fb-card border border-fb-border rounded-xl overflow-hidden flex flex-col shadow-sm">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="h-40 w-full object-cover" />
              ) : (
                <div className="h-32 bg-fb-input flex items-center justify-center text-fb-muted">
                  <Package className="w-8 h-8" />
                </div>
              )}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-fb-muted">{p.category}</span>
                  <h3 className="font-bold text-sm">{p.name}</h3>
                  <p className="text-xs text-fb-muted mt-1">{p.description}</p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-base">${p.price_dollars.toFixed(2)}</div>
                    <div className="text-[11px] text-fb-muted">{p.stock} in stock</div>
                  </div>
                  <button
                    disabled={p.stock <= 0}
                    onClick={() => addToCart(p.id)}
                    className="px-3 py-2 rounded-lg bg-fb-blue hover:bg-fb-blueHover disabled:opacity-40 text-white text-xs font-semibold"
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-fb-card border border-fb-border rounded-xl p-4 h-fit space-y-4 shadow-sm">
          <h2 className="font-bold text-base flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-fb-blue" />
            Your Cart
          </h2>
          {cartItems.length === 0 ? (
            <p className="text-xs text-fb-muted">Your cart is empty.</p>
          ) : (
            <form onSubmit={handleCheckout} className="space-y-3">
              <div className="space-y-2">
                {cartItems.map((i) => (
                  <div key={i.id} className="flex justify-between text-xs">
                    <span>
                      {i.name} × {i.qty}
                    </span>
                    <span className="font-semibold">${(i.price_dollars * i.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-fb-border pt-2 flex justify-between font-bold text-sm">
                <span>Subtotal</span>
                <span>${total.toFixed(2)}</span>
              </div>
              {user ? (
                <>
                  <input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="Coupon code (optional)"
                    className="w-full px-3 py-2 rounded-lg bg-fb-input text-xs uppercase focus:outline-none"
                  />
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-fb-input text-xs"
                  >
                    <option value="cod">Cash on Delivery</option>
                    <option value="bkash_sandbox">bKash (Sandbox)</option>
                    <option value="nagad_sandbox">Nagad (Sandbox)</option>
                    <option value="card_sandbox">Card Payment (Sandbox)</option>
                  </select>
                  <textarea
                    required
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Shipping address..."
                    className="w-full p-2.5 rounded-lg bg-fb-input text-xs focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-xs font-semibold"
                  >
                    Place Order
                  </button>
                </>
              ) : (
                <Link href="/auth" className="block text-center py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold">
                  Sign in to Checkout
                </Link>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
