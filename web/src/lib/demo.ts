// Demo mode (VITE_DEMO=1): the app runs on sample data so it can be tried and installed before the server is live.
// It is compiled out of normal builds. Sign in with tenant@demo, landlord@demo or provider@demo and any password.
import { ApiError } from "./api";
import type { Land, Me } from "./types";

const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const media = (i: number) => [{ id: i, url: "", kind: "photo", is_cover: true }];
const units = [
  { id: 1, property_name: "Maple Court", estate: "Roysambu", landmark: "Near Thika Road", latitude: -1.2186, longitude: 36.8886, county_name: "Nairobi", ward_name: "Roysambu", label: "B3", unit_type: "2br", bedrooms: 2, bathrooms: 2, rent_amount: "24000.00", deposit_amount: "24000.00", status: "available", amenities: ["parking", "swimming_pool", "gated_community"], description: "Bright corner unit on the 3rd floor, five minutes from the Thika Road bus stop. Water included.", media: media(1) },
  { id: 2, property_name: "Acacia Gardens", estate: "Kasarani", landmark: "", latitude: -1.2214, longitude: 36.8997, county_name: "Nairobi", ward_name: "Kasarani", label: "A1", unit_type: "1br", bedrooms: 1, bathrooms: 1, rent_amount: "14500.00", deposit_amount: "14500.00", status: "available", amenities: ["water_24_7", "security_cctv"], description: "Quiet one bedroom with a balcony.", media: media(2) },
  { id: 3, property_name: "Nyali Heights", estate: "Nyali", landmark: "", latitude: -4.0435, longitude: 39.7185, county_name: "Mombasa", ward_name: "Nyali", label: "C2", unit_type: "bedsitter", bedrooms: 0, bathrooms: 1, rent_amount: "7000.00", deposit_amount: null, status: "available", amenities: ["water_24_7"], description: "Compact studio near the beach road.", media: media(3) },
  { id: 4, property_name: "Karen Close", estate: "Karen", landmark: "", latitude: -1.3197, longitude: 36.7076, county_name: "Nairobi", ward_name: "Karen", label: "House", unit_type: "3br", bedrooms: 3, bathrooms: 3, rent_amount: "85000.00", deposit_amount: "170000.00", status: "available", amenities: ["parking", "gated_community", "backup_generator"], description: "Standalone family house with a garden.", media: media(4) },
];
const mk = (id: number, property_name: string, estate: string, county_name: string, lat: number, lng: number, label: string, unit_type: string, bedrooms: number, bathrooms: number, rent: number, amenities: string[], description: string, status = "available") => ({ id, property_name, estate, landmark: "", latitude: lat, longitude: lng, county_name, ward_name: estate, label, unit_type, bedrooms, bathrooms, rent_amount: rent.toFixed(2), deposit_amount: rent.toFixed(2), status, amenities, description, media: media(id) });
units.push(
  mk(5, "Garden Estate Apartments", "Garden Estate", "Nairobi", -1.2306, 36.8913, "D4", "2br", 2, 2, 32000, ["parking", "security_cctv", "balcony", "water_24_7"], "Modern two bedroom with a DSQ, ten minutes from Thika Road Mall."),
  mk(6, "Kileleshwa Towers", "Kileleshwa", "Nairobi", -1.2765, 36.7843, "9A", "3br", 3, 3, 78000, ["parking", "swimming_pool", "gated_community", "backup_generator"], "Top floor three bedroom with a city view and a gym in the building."),
  mk(7, "Kilimani Suites", "Kilimani", "Nairobi", -1.2921, 36.7872, "5F", "1br", 1, 1, 42000, ["security_cctv", "backup_generator", "balcony"], "Furnished one bedroom, walking distance to Yaya Centre."),
  mk(8, "Ruaka Palms", "Ruaka", "Kiambu", -1.2069, 36.7708, "B2", "2br", 2, 2, 28000, ["parking", "gated_community", "water_24_7"], "Family apartment in a gated block, close to Two Rivers."),
  mk(9, "Thindigua Court", "Thindigua", "Kiambu", -1.2192, 36.8333, "A5", "bedsitter", 0, 1, 8500, ["water_24_7", "security_cctv"], "Clean bedsitter with tiled floors and a shared compound.", "occupied"),
  mk(10, "Bamburi Beach Villas", "Bamburi", "Mombasa", -4.0192, 39.7253, "V1", "3br", 3, 3, 65000, ["parking", "swimming_pool", "gated_community", "pets_allowed"], "Villa with a pool, two minutes from the beach."),
  mk(11, "Tudor Flats", "Tudor", "Mombasa", -4.0549, 39.6636, "T7", "1br", 1, 1, 16000, ["water_24_7", "balcony"], "Sunny one bedroom, close to Mombasa Island."),
  mk(12, "Roysambu Heights", "Roysambu", "Nairobi", -1.2203, 36.8869, "C9", "bedsitter", 0, 1, 9000, ["water_24_7", "security_cctv"], "Affordable bedsitter near Roysambu stage."),
);
const land: Land[] = [
  { id: 1, title: "Quarter acre, Kitengela", description: "", estate: "", ward_name: "Kitengela", county_name: "Kajiado", size_acres: "0.2500", price: "1500000.00", price_negotiable: true, title_type: "freehold", features: ["road_access"], is_verified: true, seller_name: "Savanna Land Co.", seller_phone: null, plot_width_ft: 50, plot_length_ft: 100, plot_count: 2 },
  { id: 2, title: "Half acre, Ruiru", description: "", estate: "", ward_name: "Ruiru", county_name: "Kiambu", size_acres: "0.5000", price: "3200000.00", price_negotiable: false, title_type: "freehold", features: [], is_verified: false, seller_name: "J. Kamau", seller_phone: null, plot_width_ft: null, plot_length_ft: null, plot_count: 1 },
];
const plot = (id: number, title: string, ward_name: string, county_name: string, acres: string, price: number, negotiable: boolean, title_type: string, features: string[], verified: boolean, seller_name: string, w: number | null, l: number | null, count: number, description = "") => ({ id, title, description, estate: "", ward_name, county_name, size_acres: acres, price: price.toFixed(2), price_negotiable: negotiable, title_type, features, is_verified: verified, seller_name, seller_phone: null, plot_width_ft: w, plot_length_ft: l, plot_count: count });
land.push(
  plot(3, "50x100 plots, Juja Farm", "Juja", "Kiambu", "0.1148", 950000, true, "freehold", ["road_access", "water", "electricity"], true, "Juja Plots Ltd", 50, 100, 24, "Subdivided project with ready title deeds and murram roads."),
  plot(4, "One acre, Athi River", "Athi River", "Machakos", "1.0000", 4800000, false, "freehold", ["road_access", "fenced"], true, "Eastern Land Agency", null, null, 1, "Flat land near the Mombasa highway, good for a godown or homes."),
  plot(5, "Eighth acre, Ngong", "Ngong", "Kajiado", "0.1250", 2200000, true, "leasehold", ["water", "electricity"], false, "M. Wanjiku", 50, 100, 1),
  plot(6, "Quarter acre, Thika", "Thika Town", "Kiambu", "0.2500", 2800000, true, "freehold", ["road_access", "water"], true, "Savanna Land Co.", null, null, 3, "Three plots left in a gated project."),
  plot(7, "Beach plot, Vipingo", "Vipingo", "Kilifi", "0.5000", 6500000, false, "freehold", ["road_access"], false, "A. Mwalimu", null, null, 1),
);
const cats = [["movers", "Movers", "Wasafirishaji wa mizigo"], ["cleaning", "Cleaning", "Usafi"], ["laundry", "Laundry", "Ufuaji nguo"], ["plumbing", "Plumbing", "Mafundi bomba"], ["electrical", "Electrical", "Mafundi umeme"], ["gas", "Gas delivery", "Gesi"]].map(([slug, name_en, name_sw], i) => ({ id: i + 1, slug, name_en, name_sw, icon: "" }));
const providers = [{ id: 1, kind: "company", business_name: "Swift Movers Ltd", phone: "+254722000001", bio: "Trucks and a crew of three. Nairobi and nearby counties.", categories: ["movers"], price_from: "6500.00" }, { id: 2, kind: "provider", business_name: "Sparkle Cleaners", phone: "+254722000002", bio: "Deep cleaning for move-in and move-out.", categories: ["cleaning"], price_from: "3000.00" },
  { id: 3, kind: "provider", business_name: "FlowFix Plumbers", phone: "+254722000003", bio: "Leaks, blocked drains and water tank fitting. Same-day call-outs.", categories: ["plumbing"], price_from: "1500.00" },
  { id: 4, kind: "provider", business_name: "BrightWire Electricals", phone: "+254722000004", bio: "Wiring, token meter fixes and security lighting.", categories: ["electrical"], price_from: "2000.00" },
  { id: 5, kind: "company", business_name: "Kasi Gas Express", phone: "+254722000005", bio: "6kg and 13kg gas refills delivered in 30 minutes.", categories: ["gas"], price_from: "1100.00" },
  { id: 6, kind: "provider", business_name: "FreshFold Laundry", phone: "+254722000006", bio: "Wash, dry and fold with pickup and delivery.", categories: ["laundry"], price_from: "500.00" },
  { id: 7, kind: "company", business_name: "Pamoja Movers & Cleaners", phone: "+254722000007", bio: "Moving plus move-out cleaning in one booking.", categories: ["movers", "cleaning"], price_from: "5500.00" }];
const invoices = [
  { id: 1, lease: 1, tenant_name: "Grace Wanjiru", unit_label: "4C", period: day(-40).slice(0, 8) + "01", amount: "24000.00", due_date: day(-35), paid_amount: "0.00", balance: "24000.00", status: "overdue" },
  { id: 2, lease: 1, tenant_name: "Grace Wanjiru", unit_label: "4C", period: day(-70).slice(0, 8) + "01", amount: "24000.00", due_date: day(-65), paid_amount: "24000.00", balance: "0.00", status: "paid" },
  { id: 3, lease: 2, tenant_name: "Peter Otieno", unit_label: "2B", period: day(-10).slice(0, 8) + "01", amount: "22000.00", due_date: day(-5), paid_amount: "10000.00", balance: "12000.00", status: "partial" },
  { id: 4, lease: 3, tenant_name: "Faith Njeri", unit_label: "A3", period: day(-10).slice(0, 8) + "01", amount: "14500.00", due_date: day(-5), paid_amount: "14500.00", balance: "0.00", status: "paid" },
  { id: 5, lease: 4, tenant_name: "David Kimani", unit_label: "House", period: day(5).slice(0, 8) + "01", amount: "85000.00", due_date: day(5), paid_amount: "0.00", balance: "85000.00", status: "pending" },
];
const leases = [
  { id: 1, unit: 1, unit_label: "4C", property_name: "Maple Court", tenant_name: "Grace Wanjiru", tenant_phone: "+254733000001", start_date: day(-90), end_date: day(270), rent_amount: "24000.00", status: "active" },
  { id: 2, unit: 2, unit_label: "2B", property_name: "Maple Court", tenant_name: "Peter Otieno", tenant_phone: "+254733000011", start_date: day(-340), end_date: day(21), rent_amount: "22000.00", status: "active" },
  { id: 3, unit: 3, unit_label: "A3", property_name: "Acacia Gardens", tenant_name: "Faith Njeri", tenant_phone: "+254733000012", start_date: day(-200), end_date: day(165), rent_amount: "14500.00", status: "active" },
  { id: 4, unit: 4, unit_label: "House", property_name: "Karen Close", tenant_name: "David Kimani", tenant_phone: "+254733000013", start_date: day(-30), end_date: day(335), rent_amount: "85000.00", status: "active" },
  { id: 5, unit: 5, unit_label: "B1", property_name: "Maple Court", tenant_name: "Mary Achieng", tenant_phone: "+254733000014", start_date: day(-400), end_date: day(-35), rent_amount: "21000.00", status: "ended" },
];
const repairs = [{ id: 1, unit: 1, unit_label: "2B", property_name: "Maple Court", title: "Leaky faucet", description: "Kitchen sink keeps dripping.", priority: "high", status: "open", vendor: null, vendor_name: null, visit_at: null, created_at: day(-2), updates: [{ id: 1, text: "Request created", created_at: day(-2) }] },
  { id: 2, unit: 3, unit_label: "A3", property_name: "Acacia Gardens", title: "Broken gate lock", description: "Compound gate does not lock at night.", priority: "medium", status: "scheduled", vendor: 1, vendor_name: "Alex Plumbing Co.", visit_at: day(2), created_at: day(-6), updates: [{ id: 2, text: "Request created", created_at: day(-6) }, { id: 3, text: "Vendor scheduled", created_at: day(-4) }] },
  { id: 3, unit: 4, unit_label: "House", property_name: "Karen Close", title: "Garden light not working", description: "Front path light is off.", priority: "low", status: "done", vendor: 2, vendor_name: "BrightWire Electricals", visit_at: day(-8), created_at: day(-12), updates: [{ id: 4, text: "Request created", created_at: day(-12) }, { id: 5, text: "Fixed and tested", created_at: day(-8) }] }];
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
    if (q.county) r = r.filter((u) => ({ Nairobi: "1", Mombasa: "2", Kiambu: "3" } as Record<string, string>)[u.county_name ?? ""] === String(q.county));
    return page(q.scope === "mine" ? units.slice(0, 5) : r);
  }
  const unit = path.match(/^\/units\/(\d+)\/$/); if (unit) return units.find((u) => u.id === Number(unit[1])) ?? Promise.reject(new ApiError(404, "Not found."));
  if (path === "/geo/counties/") return [{ id: 1, name: "Nairobi" }, { id: 2, name: "Mombasa" }, { id: 3, name: "Kiambu" }];
  if (path === "/amenities/") return { rental: [["parking", "Parking"], ["swimming_pool", "Swimming pool"], ["gated_community", "Gated community"], ["water_24_7", "24/7 water"], ["security_cctv", "CCTV and security"], ["backup_generator", "Backup generator"], ["balcony", "Balcony"], ["pets_allowed", "Pets allowed"]].map(([key, label]) => ({ key, label })), land: [] };
  if (path === "/land/") return page(q.verified ? land.filter((l) => l.is_verified) : land);
  if (path === "/service-categories/") return cats;
  if (path === "/providers/") return page(providers.filter((p) => !q.category || p.categories.includes(String(q.category))));
  if (path === "/auth/signup/") {
    const b = (o.body ?? {}) as { full_name?: string; email?: string; phone?: string; role?: Me["role"] };
    me = { id: 100, phone: b.phone ?? "", email: b.email ?? "", full_name: b.full_name || "New user", role: b.role ?? "tenant", language: "en", is_email_verified: true, landlord_verified: false };
    return { detail: "Account created.", user: me, access: "demo", refresh: "demo" };
  }
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
  if (path === "/dashboard/landlord/") return { rent_due: "145500.00", rent_collected: "38500.00", occupancy: { occupied: 4, total: 5, percent: 80 }, arrears: { amount: "36000.00", tenants: 2 }, open_repairs: 2, repairs_needing_vendor: 1, attention: [{ type: "rent_overdue", title: "Rent overdue, 4C", detail: "Grace Wanjiru, 35 days late" }, { type: "lease_ending", title: "Lease ends in 21 days", detail: "2B, Peter Otieno" }, { type: "repair_needs_vendor", title: "Leaky faucet, 2B", detail: "Waiting for a vendor" }] };
  if (path === "/invoices/remind-overdue/") return { sent: 1, skipped: 0 };
  if (path === "/invoices/generate/") return { created: 1 };
  if (path === "/invoices/") return page(invoices);
  const pay = path.match(/^\/invoices\/(\d+)\/payments\/$/); if (pay) { const i = Math.max(0, invoices.findIndex((v) => v.id === Number(pay[1]))); invoices[i] = { ...invoices[i], status: "paid", paid_amount: invoices[i].amount, balance: "0.00" }; return invoices[i]; }
  if (path === "/leases/") return m === "POST" ? { id: 2 } : page(me.role === "tenant" ? leases : leases);
  if (path === "/repairs/") return m === "POST" ? { id: 2 } : page(repairs);
  const rep = path.match(/^\/repairs\/(\d+)\/$/); if (rep) return repairs.find((r) => r.id === Number(rep[1])) ?? repairs[0];
  if (path === "/vendors/") return page([{ id: 1, name: "Alex Plumbing Co.", trade: "plumber", phone: "+254711222333" }, { id: 2, name: "BrightWire Electricals", trade: "electrician", phone: "+254711222444" }, { id: 3, name: "Mwangi Painters", trade: "painter", phone: "+254711222555" }]);
  if (path === "/quote-requests/") return page([{ id: 1, category: "movers", from_place: "Roysambu", to_place: "Kitengela", description: "2 bedroom house, third floor", preferred_date: day(7), quotes_count: 0, is_open: true }, { id: 2, category: "cleaning", from_place: "Kilimani", to_place: "", description: "Deep clean for a 3 bedroom before move-in", preferred_date: day(3), quotes_count: 2, is_open: true }, { id: 3, category: "gas", from_place: "Ruaka", to_place: "", description: "13kg refill, delivery today", preferred_date: day(0), quotes_count: 1, is_open: false }]);
  if (/^\/quote-requests\/\d+\/quotes\/$/.test(path)) return { id: 1, provider_name: "Swift Movers Ltd", provider_phone: null, price: "8000", message: "", status: "sent" };
  throw new ApiError(404, "Not available in demo mode.");
}
