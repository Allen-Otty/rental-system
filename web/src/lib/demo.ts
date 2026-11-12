// Demo mode (VITE_DEMO=1): the app runs on sample data so it can be tried and installed before the server is live.
// It is compiled out of normal builds. Sign in with tenant@demo, landlord@demo or provider@demo and any password.
import { ApiError } from "./api";
import type { Me } from "./types";

const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const media = (i: number) => [{ id: i, url: "", kind: "photo", is_cover: true }];
const units = [
  { id: 1, property_name: "Maple Court", estate: "Roysambu", landmark: "Near Thika Road", latitude: -1.2186, longitude: 36.8886, county_name: "Nairobi", ward_name: "Roysambu", label: "B3", unit_type: "2br", bedrooms: 2, bathrooms: 2, rent_amount: "24000.00", deposit_amount: "24000.00", status: "available", amenities: ["parking", "swimming_pool", "gated_community"], description: "Bright corner unit on the 3rd floor, five minutes from the Thika Road bus stop. Water included.", media: media(1) },
  { id: 2, property_name: "Acacia Gardens", estate: "Kasarani", landmark: "", latitude: -1.2214, longitude: 36.8997, county_name: "Nairobi", ward_name: "Kasarani", label: "A1", unit_type: "1br", bedrooms: 1, bathrooms: 1, rent_amount: "14500.00", deposit_amount: "14500.00", status: "available", amenities: ["water_24_7", "security_cctv"], description: "Quiet one bedroom with a balcony.", media: media(2) },
  { id: 3, property_name: "Nyali Heights", estate: "Nyali", landmark: "", latitude: -4.0435, longitude: 39.7185, county_name: "Mombasa", ward_name: "Nyali", label: "C2", unit_type: "bedsitter", bedrooms: 0, bathrooms: 1, rent_amount: "7000.00", deposit_amount: null, status: "available", amenities: ["water_24_7"], description: "Compact studio near the beach road.", media: media(3) },
  { id: 4, property_name: "Karen Close", estate: "Karen", landmark: "", latitude: -1.3197, longitude: 36.7076, county_name: "Nairobi", ward_name: "Karen", label: "House", unit_type: "3br", bedrooms: 3, bathrooms: 3, rent_amount: "85000.00", deposit_amount: "170000.00", status: "available", amenities: ["parking", "gated_community", "backup_generator"], description: "Standalone family house with a garden.", media: media(4) },
];
const land = [
  { id: 1, title: "Quarter acre, Kitengela", description: "", estate: "", ward_name: "Kitengela", county_name: "Kajiado", size_acres: "0.2500", price: "1500000.00", price_negotiable: true, title_type: "freehold", features: ["road_access"], is_verified: true, seller_name: "Savanna Land Co.", seller_phone: null, plot_width_ft: 50, plot_length_ft: 100, plot_count: 2 },
  { id: 2, title: "Half acre, Ruiru", description: "", estate: "", ward_name: "Ruiru", county_name: "Kiambu", size_acres: "0.5000", price: "3200000.00", price_negotiable: false, title_type: "freehold", features: [], is_verified: false, seller_name: "J. Kamau", seller_phone: null, plot_width_ft: null, plot_length_ft: null, plot_count: 1 },
];
const cats = [["movers", "Movers", "Wasafirishaji wa mizigo"], ["cleaning", "Cleaning", "Usafi"], ["laundry", "Laundry", "Ufuaji nguo"], ["plumbing", "Plumbing", "Mafundi bomba"], ["electrical", "Electrical", "Mafundi umeme"], ["gas", "Gas delivery", "Gesi"]].map(([slug, name_en, name_sw], i) => ({ id: i + 1, slug, name_en, name_sw, icon: "" }));
const providers = [{ id: 1, kind: "company", business_name: "Swift Movers Ltd", phone: "+254722000001", bio: "Trucks and a crew of three. Nairobi and nearby counties.", categories: ["movers"], price_from: "6500.00" }, { id: 2, kind: "provider", business_name: "Sparkle Cleaners", phone: "+254722000002", bio: "Deep cleaning for move-in and move-out.", categories: ["cleaning"], price_from: "3000.00" }];
const invoices = [
  { id: 1, lease: 1, tenant_name: "Grace Wanjiru", unit_label: "4C", period: day(-40).slice(0, 8) + "01", amount: "24000.00", due_date: day(-35), paid_amount: "0.00", balance: "24000.00", status: "overdue" },
  { id: 2, lease: 1, tenant_name: "Grace Wanjiru", unit_label: "4C", period: day(-70).slice(0, 8) + "01", amount: "24000.00", due_date: day(-65), paid_amount: "24000.00", balance: "0.00", status: "paid" },
];
const leases = [{ id: 1, unit: 1, unit_label: "4C", property_name: "Maple Court", tenant_name: "Grace Wanjiru", tenant_phone: "+254733000001", start_date: day(-90), end_date: day(270), rent_amount: "24000.00", status: "active" }];
const repairs = [{ id: 1, unit: 1, unit_label: "2B", property_name: "Maple Court", title: "Leaky faucet", description: "Kitchen sink keeps dripping.", priority: "high", status: "open", vendor: null, vendor_name: null, visit_at: null, created_at: day(-2), updates: [{ id: 1, text: "Request created", created_at: day(-2) }] }];
const users: Record<string, Me> = {
  tenant: { id: 1, phone: "+254733000001", email: "tenant@demo", full_name: "Amina Otieno", role: "tenant", language: "en", is_email_verified: true, landlord_verified: false },
  landlord: { id: 2, phone: "+254733000002", email: "landlord@demo", full_name: "Joseph Mwangi", role: "landlord", language: "en", is_email_verified: true, landlord_verified: true },
  provider: { id: 3, phone: "+254733000003", email: "provider@demo", full_name: "Sam Mover", role: "provider", language: "en", is_email_verified: true, landlord_verified: false },
};
let me: Me = users.tenant;
const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });
const wait = () => new Promise((r) => setTimeout(r, 450)); // so the skeleton loaders are visible

export async function demoApi(path: string, o: { method?: string; body?: unknown; query?: Record<string, unknown> }): Promise<any> {
  if (import.meta.env.MODE !== "test") await wait();
  const m = o.method ?? "GET";
  const q = o.query ?? {};
  if (path === "/units/") {
    let r = units.filter((u) => (!q.q || JSON.stringify(u).toLowerCase().includes(String(q.q).toLowerCase())) && (!q.max_rent || Number(u.rent_amount) <= Number(q.max_rent)) && (!q.min_bedrooms || u.bedrooms >= Number(q.min_bedrooms)));
    if (q.county) r = r.filter((u) => (u.county_name === "Nairobi" ? "1" : "2") === String(q.county));
    return page(q.scope === "mine" ? units.slice(0, 2) : r);
  }
  const unit = path.match(/^\/units\/(\d+)\/$/); if (unit) return units.find((u) => u.id === Number(unit[1])) ?? Promise.reject(new ApiError(404, "Not found."));
  if (path === "/geo/counties/") return [{ id: 1, name: "Nairobi" }, { id: 2, name: "Mombasa" }, { id: 3, name: "Kiambu" }];
  if (path === "/amenities/") return { rental: [["parking", "Parking"], ["swimming_pool", "Swimming pool"], ["gated_community", "Gated community"], ["water_24_7", "24/7 water"], ["security_cctv", "CCTV and security"], ["backup_generator", "Backup generator"], ["balcony", "Balcony"], ["pets_allowed", "Pets allowed"]].map(([key, label]) => ({ key, label })), land: [] };
  if (path === "/land/") return page(q.verified ? land.filter((l) => l.is_verified) : land);
  if (path === "/service-categories/") return cats;
  if (path === "/providers/") return page(providers.filter((p) => !q.category || p.categories.includes(String(q.category))));
  if (path === "/auth/signup/") return { detail: "Check your email and click the confirmation link to activate your account." };
  if (path === "/auth/email/resend/") return { detail: "ok" };
  if (path === "/auth/email/confirm/") return { detail: "Email confirmed." };
  if (path === "/auth/login/") {
    const id = String((o.body as { identifier?: string })?.identifier ?? "");
    const role = id.startsWith("landlord") ? "landlord" : id.startsWith("provider") ? "provider" : "tenant";
    me = users[role];
    try { localStorage.setItem("demo-role", role); } catch { /* ignore */ }
    return { user: me, access: "demo", refresh: "demo" };
  }
  if (path === "/me/") { try { me = users[localStorage.getItem("demo-role") ?? "tenant"] ?? users.tenant; } catch { /* ignore */ } return me; }
  if (path === "/viewings/" || path === "/quote-requests/" && m === "POST") return { id: 1 };
  if (path === "/requests/") return { id: 7, status: "pending_payment", fee_amount: "200.00" };
  if (/^\/requests\/\d+\/pay\/$/.test(path)) return { id: 1, status: "pending" };
  if (/^\/requests\/\d+\/payment\/$/.test(path)) return { id: 1, status: "success" };
  if (path === "/dashboard/landlord/") return { rent_due: "48000.00", rent_collected: "24000.00", occupancy: { occupied: 1, total: 2, percent: 50 }, arrears: { amount: "24000.00", tenants: 1 }, open_repairs: 1, repairs_needing_vendor: 1, attention: [{ type: "rent_overdue", title: "Rent overdue, 4C", detail: "Grace Wanjiru, 35 days late" }, { type: "lease_ending", title: "Lease ends in 21 days", detail: "2B, Peter Otieno" }, { type: "repair_needs_vendor", title: "Leaky faucet, 2B", detail: "Waiting for a vendor" }] };
  if (path === "/invoices/remind-overdue/") return { sent: 1, skipped: 0 };
  if (path === "/invoices/generate/") return { created: 1 };
  if (path === "/invoices/") return page(invoices);
  if (/^\/invoices\/\d+\/payments\/$/.test(path)) { invoices[0] = { ...invoices[0], status: "paid", balance: "0.00" }; return invoices[0]; }
  if (path === "/leases/") return m === "POST" ? { id: 2 } : page(me.role === "tenant" ? leases : leases);
  if (path === "/repairs/") return m === "POST" ? { id: 2 } : page(repairs);
  if (/^\/repairs\/\d+\/$/.test(path)) return repairs[0];
  if (path === "/vendors/") return page([{ id: 1, name: "Alex Plumbing Co.", trade: "plumber", phone: "+254711222333" }]);
  if (path === "/quote-requests/") return page([{ id: 1, category: "movers", from_place: "Roysambu", to_place: "Kitengela", description: "2 bedroom house, third floor", preferred_date: day(7), quotes_count: 0, is_open: true }]);
  if (/^\/quote-requests\/\d+\/quotes\/$/.test(path)) return { id: 1, provider_name: "Swift Movers Ltd", provider_phone: null, price: "8000", message: "", status: "sent" };
  throw new ApiError(404, "Not available in demo mode.");
}
