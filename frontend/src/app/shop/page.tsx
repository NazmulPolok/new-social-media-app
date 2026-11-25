"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ShoppingBag, Plus, ExternalLink, Package, BarChart3, Phone, Tag } from "lucide-react";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Shop {
  id: number;
  owner_id: number;
  name: string;
  slug: string;
  motto?: string;
  description: string;
  logo_url?: string;
  contact_number?: string;
  category?: string;
  theme_color: string;
  products_count: number;
}

interface Product {
  id: number;
  shop_id: number;
  shop_name: string;
  shop_slug: string;
  name: string;
  description: string;
  price_dollars: number;
  stock: number;
  category: string;
  image_url: string;
}

export default function ShopHubPage() {
  const { user } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [msg, setMsg] = useState("");

  const [targetShopId, setTargetShopId] = useState<number>(0);
  const [prodName, setProdName] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [prodPrice, setProdPrice] = useState("29.99");
  const [prodStock, setProdStock] = useState("25");
  const [prodCat, setProdCat] = useState("Electronics");
  const [prodImg, setProdImg] = useState("");

  const loadAll = async () => {
    const [s, p] = await Promise.all([
      apiFetch<Shop[]>("/api/shops"),
      apiFetch<Product[]>("/api/shops/products/all"),
    ]);
    setShops(s);
    setProducts(p);
  };

  useEffect(() => {
    loadAll().catch(() => {});
  }, []);

  const myShops = shops.filter((s) => s.owner_id === user?.id);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetShopId) {
      setMsg("Please select one of your shops.");
      return;
    }
    try {
      await apiFetch(`/api/shops/${targetShopId}/products`, {
        method: "POST",
        body: JSON.stringify({
          name: prodName,
          description: prodDesc,
          price_dollars: parseFloat(prodPrice),
          stock: parseInt(prodStock, 10),
          category: prodCat,
          image_url: prodImg,
        }),
      });
      setProdName("");
      setProdDesc("");
      setProdImg("");
      setShowAddProduct(false);
      setMsg("Product added to your shop!");
      loadAll();
    } catch (err: any) {
      setMsg(err.message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-fb-card border border-fb-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            Marketplace &amp; ShopBuilder
          </h1>
          <p className="text-xs text-fb-muted">
            Open your own e-commerce storefront, list products, and manage orders.
          </p>
        </div>
        {user && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/seller"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs font-semibold"
            >
              <BarChart3 className="w-4 h-4 text-fb-blue" />
              Merchant Dashboard
            </Link>
            <button
              onClick={() => {
                if (myShops.length > 0 && !targetShopId) setTargetShopId(myShops[0].id);
                setShowAddProduct(!showAddProduct);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-fb-card border border-fb-border text-xs font-medium">
          {msg}
        </div>
      )}

      {showAddProduct && (
        <form onSubmit={handleAddProduct} className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="text-sm font-bold">Add Product to Store</h2>
          {myShops.length === 0 ? (
            <p className="text-xs text-fb-muted">
              Open a shop in{" "}
              <Link href="/settings" className="text-fb-blue font-semibold hover:underline">
                Settings
              </Link>{" "}
              first before adding products.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={targetShopId}
                  onChange={(e) => setTargetShopId(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg bg-fb-input text-sm"
                >
                  <option value={0}>Select your shop</option>
                  {myShops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (/{s.slug})
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="Product Name"
                  className="px-3 py-2 rounded-lg bg-fb-input text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  required
                  type="number"
                  step="0.01"
                  value={prodPrice}
                  onChange={(e) => setProdPrice(e.target.value)}
                  placeholder="Price ($)"
                  className="px-3 py-2 rounded-lg bg-fb-input text-sm"
                />
                <input
                  required
                  type="number"
                  value={prodStock}
                  onChange={(e) => setProdStock(e.target.value)}
                  placeholder="Stock"
                  className="px-3 py-2 rounded-lg bg-fb-input text-sm"
                />
                <input
                  value={prodCat}
                  onChange={(e) => setProdCat(e.target.value)}
                  placeholder="Category"
                  className="px-3 py-2 rounded-lg bg-fb-input text-sm"
                />
              </div>
              <input
                value={prodImg}
                onChange={(e) => setProdImg(e.target.value)}
                placeholder="Optional product image URL..."
                className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm"
              />
              <input
                value={prodDesc}
                onChange={(e) => setProdDesc(e.target.value)}
                placeholder="Product description..."
                className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm"
              />
              <button type="submit" className="px-4 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold">
                Save Product
              </button>
            </>
          )}
        </form>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-fb-muted uppercase tracking-wider">Storefronts</h2>
        {shops.length === 0 ? (
          <div className="bg-fb-card border border-fb-border rounded-xl p-6 text-center text-xs text-fb-muted">
            No shops created yet. Go to{" "}
            <Link href="/settings" className="text-fb-blue font-semibold hover:underline">
              Settings
            </Link>{" "}
            to open your shop!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shops.map((s) => (
              <Link
                key={s.id}
                href={`/shop/${s.slug}`}
                className="group bg-fb-card border border-fb-border hover:border-fb-blue rounded-xl p-4 transition flex flex-col justify-between shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {s.logo_url ? (
                        <img
                          src={resolveMediaUrl(s.logo_url)}
                          alt={s.name}
                          className="w-11 h-11 rounded-lg object-cover border border-fb-border shrink-0"
                        />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-lg flex items-center justify-center text-white font-bold text-base shrink-0"
                          style={{ backgroundColor: s.theme_color }}
                        >
                          {s.name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-bold text-base truncate">{s.name}</h3>
                        {s.motto && <p className="text-[11px] text-fb-blue font-medium truncate">{s.motto}</p>}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-fb-muted group-hover:text-fb-blue shrink-0" />
                  </div>
                  <p className="text-xs text-fb-muted line-clamp-2">
                    {s.description || "Custom e-commerce storefront"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-fb-muted">
                    {s.category && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fb-input font-medium">
                        <Tag className="w-3 h-3" /> {s.category}
                      </span>
                    )}
                    {s.contact_number && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {s.contact_number}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-fb-border flex items-center justify-between text-xs text-fb-muted">
                  <span>/shop/{s.slug}</span>
                  <span>{s.products_count} products</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-fb-muted uppercase tracking-wider">Marketplace Products</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
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
                  <div className="text-[11px] text-fb-blue font-semibold">{p.shop_name}</div>
                  <h3 className="font-bold text-sm mt-0.5">{p.name}</h3>
                  <p className="text-xs text-fb-muted line-clamp-2 mt-1">{p.description}</p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-bold text-base">${p.price_dollars.toFixed(2)}</span>
                  <Link
                    href={`/shop/${p.shop_slug}`}
                    className="px-3 py-1.5 rounded-lg bg-fb-input hover:bg-fb-hover text-xs font-semibold"
                  >
                    Visit Store
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
