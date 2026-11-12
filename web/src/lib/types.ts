export type Role = "tenant" | "landlord" | "agent" | "provider" | "admin" | "staff";
export interface Me { id: number; phone: string; email: string; full_name: string; role: Role; language: "en" | "sw"; is_email_verified: boolean; landlord_verified: boolean; verification_status?: string }
export interface Media { id: number; url: string; kind: string; is_cover: boolean }
export interface Unit {
  id: number; property_name: string; estate: string; landmark: string; latitude: number; longitude: number;
  county_name: string | null; ward_name: string | null; label: string; unit_type: string; bedrooms: number; bathrooms: number;
  rent_amount: string; deposit_amount: string | null; status: string; amenities: string[]; description: string; media: Media[];
}
export interface Land {
  id: number; title: string; description: string; estate: string; ward_name: string | null; county_name: string | null;
  size_acres: string; price: string; price_negotiable: boolean; title_type: string; features: string[]; is_verified: boolean;
  seller_name: string; seller_phone: string | null; plot_width_ft: number | null; plot_length_ft: number | null; plot_count: number;
}
export interface Category { id: number; slug: string; name_en: string; name_sw: string; icon: string }
export interface Provider { id: number; kind: string; business_name: string; phone: string; bio: string; categories: string[]; price_from: string | null }
export interface Dashboard {
  rent_due: string; rent_collected: string; occupancy: { occupied: number; total: number; percent: number };
  arrears: { amount: string; tenants: number }; open_repairs: number; repairs_needing_vendor: number;
  attention: { type: string; title: string; detail: string; invoice?: number; lease?: number; repair?: number; amount?: string }[];
}
export interface Invoice { id: number; lease: number; tenant_name: string; unit_label: string; period: string; amount: string; due_date: string; paid_amount: string; balance: string; status: "paid" | "partial" | "overdue" | "unpaid" }
export interface Lease { id: number; unit: number; unit_label: string; property_name: string; tenant_name: string; tenant_phone: string; start_date: string; end_date: string; rent_amount: string; status: string }
export interface Repair { id: number; unit: number; unit_label: string; property_name: string; title: string; description: string; priority: string; status: string; vendor: number | null; vendor_name: string | null; visit_at: string | null; created_at: string; updates: { id: number; text: string; created_at: string }[] }
export interface Vendor { id: number; name: string; trade: string; phone: string }
export interface Quote { id: number; provider_name: string; provider_phone: string | null; price: string; message: string; status: string }
export interface QuoteRequest { id: number; category: string; from_place: string; to_place: string; description: string; preferred_date: string | null; quotes_count: number; is_open: boolean }
export interface Amenities { rental: { key: string; label: string }[]; land: { key: string; label: string }[] }
export interface County { id: number; name: string }
