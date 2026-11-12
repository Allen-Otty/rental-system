export const kes = (v: string | number) => `KES ${Math.round(Number(v)).toLocaleString("en-KE")}`;
export const dateShort = (iso: string, lang = "en") => new Date(iso).toLocaleDateString(lang === "sw" ? "sw-KE" : "en-KE", { day: "numeric", month: "short", year: "numeric" });
export const monthLabel = (iso: string, lang = "en") => new Date(iso).toLocaleDateString(lang === "sw" ? "sw-KE" : "en-KE", { month: "long", year: "numeric" });
