"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DollarSign, Package, ShoppingBag, Tag, AlertTriangle, TrendingUp } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface OrderItemInfo {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price_dollars: number;
}

interface SellerOrder {
  id: number;
  shop_id: number;
  shop_name: string;
  buyer_username: string;
  buyer_display_name: string;
  total_dollars: number;
  payment_method: string;
  coupon_code: string;
  status: string;
  shipping_address: string;
  items: OrderItemInfo[];
  created_at: string;
}

interface ProductSale {
  product_id: number;
  name: string;
  sold_quantity: number;
  stock: number;
  revenue_dollars: number;
}

interface CouponInfo {
  id: number;
  shop_id: number;
  shop_name: string;
  code: string;
  discount_type: string;
  discount_value: number;
}

interface SellerOverview {
  shops_count: number;
  products_count: number;
  orders_count: number;
  total_revenue_dollars: number;
  low_stock_products?: string[];
  product_sales: ProductSale[];
  coupons: CouponInfo[];
  recent_orders: SellerOrder[];
}

interface Shop {
  id: number;
  owner_id: number;
  name: string;
}

export default function SellerDashboardPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<SellerOverview | null>(null);
  const [myShops, setMyShops] = useState<Shop[]>([]);
  const [couponShopId, setCouponShopId] = useState<number>(0);
  const [couponCode, setCouponCode] = useState("");
  const [discountType, setDiscountType] = useState("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [msg, setMsg] = useState("");

  const loadData = async () => {
    const [ov, shops] = await Promise.all([
      apiFetch<SellerOverview>("/api/shops/seller/overview"),
      apiFetch<Shop[]>("/api/shops"),
    ]);
    setOverview(ov);
    const mine = shops.filter((s) => s.owner_id === user?.id);
    setMyShops(mine);
    if (mine.length > 0 && !couponShopId) setCouponShopId(mine[0].id);
  };

  useEffect(() => {
    if (user) loadData().catch(() => {});
  }, [user?.id]);

  const handleStatusChange = async (orderId: number, status: string) => {
    await apiFetch(`/api/shops/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setMsg(`Order #${orderId} updated to "${status}".`);
    loadData();
  };

  const handleAdjustStock = async (productId: number, currentStock: number) => {
    const val = prompt("Enter new inventory stock count:", String(currentStock));
    if (val === null) return;
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 0) {
      alert("Invalid stock number");
      return;
    }
    try {
      await apiFetch(`/api/shops/products/${productId}/stock`, {
        method: "PATCH",
        body: JSON.stringify({ stock: num }),
      });
      setMsg(`Product inventory updated to ${num} units.`);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to update stock");
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponShopId) return;
    await apiFetch(`/api/shops/${couponShopId}/coupons`, {
      method: "POST",
      body: JSON.stringify({
        code: couponCode,
        discount_type: discountType,
        discount_value: parseInt(discountValue, 10),
      }),
    });
    setMsg(`Offer coupon ${couponCode.toUpperCase()} is now live on your shop header!`);
    setCouponCode("");
    loadData();
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-10 bg-fb-card border border-fb-border rounded-xl p-6 text-center space-y-3">
        <h1 className="text-lg font-bold">Merchant Dashboard</h1>
        <Link href="/auth" className="inline-block px-4 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-fb-card border border-fb-border rounded-xl p-4 flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-xl font-bold">Merchant Dashboard</h1>
          <p className="text-xs text-fb-muted">
            Track customer orders, product sales quantities, and publish offers &amp; discount coupons on your shop header.
          </p>
        </div>
        <Link href="/shop" className="px-4 py-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs font-semibold">
          Back to Shops
        </Link>
      </div>

      {msg && <div className="p-3 rounded-lg bg-fb-card border border-fb-border text-xs font-medium">{msg}</div>}

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Revenue", val: `$${overview.total_revenue_dollars.toFixed(2)}`, icon: DollarSign },
            { label: "Total Orders", val: overview.orders_count, icon: ShoppingBag },
            { label: "Products Listed", val: overview.products_count, icon: Package },
            { label: "Active Shops", val: overview.shops_count, icon: Tag },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-fb-card border border-fb-border rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-fb-muted">
                  <span>{s.label}</span>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold mt-1">{s.val}</div>
              </div>
            );
          })}
        </div>
      )}

      {overview?.low_stock_products && overview.low_stock_products.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Low stock alert: {overview.low_stock_products.join(", ")}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Customer Orders List */}
        <div className="lg:col-span-2 bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="font-bold text-sm">Customer Orders</h2>
          {overview?.recent_orders.length ? (
            <div className="space-y-3">
              {overview.recent_orders.map((o) => (
                <div key={o.id} className="p-3.5 rounded-xl bg-fb-input space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-sm">Order #{o.id}</span>{" "}
                      <span className="text-fb-muted">by</span>{" "}
                      <strong className="text-fb-blue">{o.buyer_display_name}</strong>{" "}
                      <span className="text-fb-muted">(@{o.buyer_username})</span>
                    </div>
                    <select
                      value={o.status}
                      onChange={(e) => handleStatusChange(o.id, e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-fb-card border border-fb-border text-xs font-semibold"
                    >
                      {["pending", "accepted", "processing", "packed", "shipped", "delivered", "completed", "cancelled", "refunded"].map((st) => (
                        <option key={st} value={st}>
                          {st.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1 border-t border-fb-border pt-2">
                    {o.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          {it.product_name} × <strong>{it.quantity}</strong>
                        </span>
                        <span>${(it.unit_price_dollars * it.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap justify-between gap-2 border-t border-fb-border pt-2 text-fb-muted">
                    <span>
                      Ship to: <strong className="text-fb-text">{o.shipping_address}</strong> • {o.payment_method}
                      {o.coupon_code ? ` • Coupon: ${o.coupon_code}` : ""}
                    </span>
                    <span className="font-bold text-fb-text">Total: ${o.total_dollars.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-fb-muted">No customer orders yet.</p>
          )}
        </div>

        {/* Right Column: Offers & Coupons + Product Sales */}
        <div className="space-y-5">
          <form onSubmit={handleCreateCoupon} className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
            <h2 className="font-bold text-sm flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-fb-blue" />
              Create Offer &amp; Discount Coupon
            </h2>
            <p className="text-[11px] text-fb-muted">
              Active coupons appear automatically on your Shop Header for customers.
            </p>
            <select value={couponShopId} onChange={(e) => setCouponShopId(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-fb-input text-xs">
              <option value={0}>Select shop</option>
              {myShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input required value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="Coupon Code (e.g. SAVE20)" className="w-full px-3 py-2 rounded-lg bg-fb-input text-xs uppercase" />
            <div className="grid grid-cols-2 gap-2">
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} className="px-2.5 py-2 rounded-lg bg-fb-input text-xs">
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed ($)</option>
              </select>
              <input required type="number" min={1} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="px-2.5 py-2 rounded-lg bg-fb-input text-xs" />
            </div>
            <button type="submit" className="w-full py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold">
              Publish Offer Coupon
            </button>

            {overview?.coupons && overview.coupons.length > 0 && (
              <div className="pt-2 border-t border-fb-border space-y-1.5">
                <div className="text-[11px] font-semibold text-fb-muted">Active Coupons</div>
                {overview.coupons.map((c) => (
                  <div key={c.id} className="flex justify-between text-xs p-2 rounded-lg bg-fb-input">
                    <span className="font-bold text-fb-blue">{c.code}</span>
                    <span>
                      {c.discount_type === "percent" ? `${c.discount_value}% OFF` : `$${c.discount_value} OFF`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </form>

          {/* Product Sales Breakdown */}
          <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
            <h2 className="font-bold text-sm flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Products Sold Breakdown
            </h2>
            {overview?.product_sales && overview.product_sales.length > 0 ? (
              <div className="space-y-2">
                {overview.product_sales.map((ps) => (
                  <div key={ps.product_id} className="flex items-center justify-between p-2.5 rounded-lg bg-fb-input text-xs">
                    <div>
                      <div className="font-semibold">{ps.name}</div>
                      <div className="text-[11px] text-fb-muted flex items-center gap-1.5 mt-0.5">
                        <span>Stock left: <strong>{ps.stock}</strong></span>
                        <button
                          type="button"
                          onClick={() => handleAdjustStock(ps.product_id, ps.stock)}
                          className="text-[10px] text-fb-blue underline font-semibold hover:opacity-80"
                        >
                          Adjust
                        </button>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{ps.sold_quantity} sold</div>
                      <div className="text-[11px] text-emerald-600">${ps.revenue_dollars.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-fb-muted">No products yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
