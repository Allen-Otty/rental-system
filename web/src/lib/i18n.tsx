import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "sw";
const en = {
  "skip": "Skip to main content", "brand": "Makao",
  "nav.explore": "Explore", "nav.land": "Land", "nav.services": "Services", "nav.request": "Request a home", "nav.overview": "Overview",
  "nav.tenants": "Tenants", "nav.money": "Rent", "nav.repairs": "Repairs", "nav.inbox": "Job requests", "nav.home": "My home",
  "nav.signin": "Sign in", "nav.signup": "Create account", "nav.signout": "Sign out", "nav.main": "Main", "nav.account": "Account",
  "common.loading": "Loading", "common.retry": "Try again", "common.search": "Search", "common.filters": "Filters", "common.save": "Save",
  "common.cancel": "Cancel", "common.send": "Send", "common.back": "Back", "common.verified": "Verified", "common.unverified": "Not verified",
  "common.from": "From", "common.perMonth": "/month", "common.all": "All", "common.close": "Close", "common.none": "Nothing here yet.",
  "common.theme": "Switch theme", "common.language": "Language", "common.required": "required", "common.error": "Something went wrong.",
  "landing.title1": "Find your", "landing.title2": "Makao.", "landing.sub": "Rent a home, buy land, book movers and settle in. All in one place, across Kenya.",
  "landing.search": "Search ward, estate or landmark", "landing.cta": "Start exploring",
  "landing.how": "How Makao helps you", "landing.rent": "Rent", "landing.rentDesc": "Browse verified homes by ward, view them on a map and book a viewing.",
  "landing.land": "Buy land", "landing.landDesc": "Plots and parcels with a Verified badge when ownership papers are checked.",
  "landing.move": "Move", "landing.moveDesc": "Compare quotes from movers, cleaners, plumbers and more.",
  "landing.manage": "Manage", "landing.manageDesc": "Landlords: tenants, rent, repairs and reminders in one dashboard.",
  "landing.closing": "Your next Makao is waiting.", "landing.closingCta": "Browse homes",
  "explore.title": "Explore homes", "explore.list": "List", "explore.map": "Map", "explore.county": "County", "explore.anyCounty": "Any county",
  "explore.maxRent": "Maximum rent (KES)", "explore.beds": "Bedrooms", "explore.any": "Any", "explore.results": "{n} homes found",
  "explore.empty": "No homes match these filters. Try a wider area or a higher budget.", "explore.mapNote": "The map shows the same homes as the list.",
  "listing.book": "Book a viewing", "listing.when": "Preferred date and time", "listing.message": "Message (optional)", "listing.booked": "Viewing requested. The landlord will confirm.",
  "listing.amenities": "Amenities", "listing.deposit": "Deposit", "listing.beds": "{n} bed", "listing.baths": "{n} bath", "listing.signin": "Sign in to book a viewing",
  "land.title": "Land and plots", "land.verifiedOnly": "Verified only", "land.size": "Size", "land.title_type": "Title", "land.acres": "{n} acres", "land.negotiable": "Price negotiable",
  "svc.title": "Home services", "svc.sub": "Movers, cleaning, repairs and deliveries from approved providers.", "svc.request": "Request quotes", "svc.providers": "Providers",
  "svc.from": "Moving from", "svc.to": "Moving to", "svc.details": "What do you need?", "svc.date": "Preferred date", "svc.sent": "Request sent. Providers will reply with quotes.",
  "auth.signin": "Sign in", "auth.signup": "Create your account", "auth.email": "Email", "auth.phone": "Phone number", "auth.password": "Password", "auth.name": "Full name",
  "auth.identifier": "Email or phone number", "auth.role": "I am a", "auth.consent": "I agree to be contacted about my account, listings and requests.",
  "auth.tenant": "Tenant or home seeker", "auth.landlord": "Landlord", "auth.agent": "Property agent", "auth.provider": "Service provider",
  "auth.checkEmail": "Check your email", "auth.checkEmailBody": "We sent a confirmation link to {email}. Your account turns on when you click it.",
  "auth.resend": "Send the link again", "auth.resent": "If that email is waiting for confirmation, we sent a new link.",
  "auth.confirming": "Confirming your email", "auth.confirmed": "Email confirmed. You can sign in now.", "auth.passwordHint": "At least 8 characters, not too common.",
  "req.title": "Request a home", "req.sub": "Tell us what you want. We alert you when a match is listed.", "req.area": "Where do you want to live?", "req.budget": "Budget per month (KES)",
  "req.min": "From", "req.max": "To", "req.amenities": "Amenities", "req.notes": "Anything else?", "req.fee": "Request fee, paid by M-Pesa", "req.pay": "Pay {fee} and place request",
  "req.waiting": "Check your phone and enter your M-Pesa PIN.", "req.paid": "Payment received. Your request is active.", "req.failed": "The payment did not go through. You can try again.",
  "mg.title": "Overview", "mg.collected": "Rent collected", "mg.due": "Rent due this month", "mg.occupancy": "Occupancy", "mg.arrears": "Arrears", "mg.repairs": "Open repairs",
  "mg.attention": "Needs attention", "mg.remind": "Send rent reminders", "mg.reminded": "{n} reminders sent", "mg.generate": "Create this month's invoices", "mg.generated": "{n} invoices created",
  "mg.invoices": "Rent invoices", "mg.record": "Record payment", "mg.amount": "Amount (KES)", "mg.method": "Method", "mg.reference": "M-Pesa code", "mg.paidOn": "Date paid",
  "mg.tenants": "Tenants and leases", "mg.addTenant": "Add tenant", "mg.unit": "Unit", "mg.tenantName": "Tenant name", "mg.start": "Lease starts", "mg.end": "Lease ends", "mg.rent": "Monthly rent (KES)",
  "mg.repairsTitle": "Repair requests", "mg.assign": "Assign vendor", "mg.schedule": "Visit date and time",
  "status.paid": "Paid", "status.partial": "Part paid", "status.overdue": "Overdue", "status.unpaid": "Unpaid", "status.open": "Open", "status.scheduled": "Scheduled", "status.in_progress": "In progress",
  "status.available": "Available", "status.occupied": "Occupied", "status.done": "Done", "status.closed": "Closed", "status.active": "Active", "status.ended": "Ended",
  "th.home": "My home", "th.report": "Report a problem", "th.problem": "What is wrong?", "th.reported": "Problem reported. Your landlord has been told.",
  "pro.title": "Job requests", "pro.quote": "Send a quote", "pro.price": "Your price (KES)", "pro.note": "Message to the customer", "pro.sent": "Quote sent.",
} as const;
export type Key = keyof typeof en;
const sw: Record<Key, string> = {
  "skip": "Ruka hadi maudhui makuu", "brand": "Makao",
  "nav.explore": "Tafuta", "nav.land": "Ardhi", "nav.services": "Huduma", "nav.request": "Omba nyumba", "nav.overview": "Muhtasari",
  "nav.tenants": "Wapangaji", "nav.money": "Kodi", "nav.repairs": "Matengenezo", "nav.inbox": "Maombi ya kazi", "nav.home": "Nyumbani kwangu",
  "nav.signin": "Ingia", "nav.signup": "Fungua akaunti", "nav.signout": "Toka", "nav.main": "Kuu", "nav.account": "Akaunti",
  "common.loading": "Inapakia", "common.retry": "Jaribu tena", "common.search": "Tafuta", "common.filters": "Vichujio", "common.save": "Hifadhi",
  "common.cancel": "Ghairi", "common.send": "Tuma", "common.back": "Rudi", "common.verified": "Imethibitishwa", "common.unverified": "Haijathibitishwa",
  "common.from": "Kuanzia", "common.perMonth": "/mwezi", "common.all": "Yote", "common.close": "Funga", "common.none": "Hakuna kitu bado.",
  "common.theme": "Badilisha mwonekano", "common.language": "Lugha", "common.required": "inahitajika", "common.error": "Kuna tatizo.",
  "landing.title1": "Pata", "landing.title2": "Makao yako.", "landing.sub": "Panga nyumba, nunua ardhi, ita wasafirishaji na uhamie. Yote mahali pamoja, kote Kenya.",
  "landing.search": "Tafuta wadi, mtaa au alama", "landing.cta": "Anza kutafuta",
  "landing.how": "Makao inavyokusaidia", "landing.rent": "Panga", "landing.rentDesc": "Tazama nyumba zilizothibitishwa kwa wadi, kwenye ramani, na uombe kuziona.",
  "landing.land": "Nunua ardhi", "landing.landDesc": "Viwanja vyenye alama ya Imethibitishwa baada ya hati za umiliki kukaguliwa.",
  "landing.move": "Hamia", "landing.moveDesc": "Linganisha bei kutoka kwa wasafirishaji, wasafishaji, mafundi bomba na wengine.",
  "landing.manage": "Simamia", "landing.manageDesc": "Wamiliki: wapangaji, kodi, matengenezo na vikumbusho kwenye ukurasa mmoja.",
  "landing.closing": "Makao yako ijayo inakungoja.", "landing.closingCta": "Tazama nyumba",
  "explore.title": "Tafuta nyumba", "explore.list": "Orodha", "explore.map": "Ramani", "explore.county": "Kaunti", "explore.anyCounty": "Kaunti yoyote",
  "explore.maxRent": "Kodi ya juu (KES)", "explore.beds": "Vyumba vya kulala", "explore.any": "Yoyote", "explore.results": "Nyumba {n} zimepatikana",
  "explore.empty": "Hakuna nyumba zinazolingana. Jaribu eneo pana au bajeti kubwa zaidi.", "explore.mapNote": "Ramani inaonyesha nyumba zilezile za orodha.",
  "listing.book": "Omba kuiona", "listing.when": "Tarehe na saa unayopendelea", "listing.message": "Ujumbe (si lazima)", "listing.booked": "Ombi limetumwa. Mwenye nyumba atathibitisha.",
  "listing.amenities": "Huduma zilizopo", "listing.deposit": "Amana", "listing.beds": "Vyumba {n}", "listing.baths": "Bafu {n}", "listing.signin": "Ingia ili uombe kuona nyumba",
  "land.title": "Ardhi na viwanja", "land.verifiedOnly": "Zilizothibitishwa pekee", "land.size": "Ukubwa", "land.title_type": "Hati", "land.acres": "Ekari {n}", "land.negotiable": "Bei inajadilika",
  "svc.title": "Huduma za nyumbani", "svc.sub": "Wasafirishaji, usafi, matengenezo na usafirishaji kutoka kwa watoa huduma walioidhinishwa.", "svc.request": "Omba bei", "svc.providers": "Watoa huduma",
  "svc.from": "Unahama kutoka", "svc.to": "Unahamia", "svc.details": "Unahitaji nini?", "svc.date": "Tarehe unayopendelea", "svc.sent": "Ombi limetumwa. Watoa huduma watatuma bei.",
  "auth.signin": "Ingia", "auth.signup": "Fungua akaunti yako", "auth.email": "Barua pepe", "auth.phone": "Nambari ya simu", "auth.password": "Nenosiri", "auth.name": "Jina kamili",
  "auth.identifier": "Barua pepe au nambari ya simu", "auth.role": "Mimi ni", "auth.consent": "Nakubali kuwasiliana nami kuhusu akaunti, nyumba na maombi yangu.",
  "auth.tenant": "Mpangaji au mtafutaji nyumba", "auth.landlord": "Mwenye nyumba", "auth.agent": "Wakala wa mali", "auth.provider": "Mtoa huduma",
  "auth.checkEmail": "Angalia barua pepe yako", "auth.checkEmailBody": "Tumetuma kiungo cha uthibitisho kwa {email}. Akaunti yako itawashwa ukikibonyeza.",
  "auth.resend": "Tuma kiungo tena", "auth.resent": "Ikiwa barua pepe hiyo inasubiri uthibitisho, tumetuma kiungo kipya.",
  "auth.confirming": "Tunathibitisha barua pepe yako", "auth.confirmed": "Barua pepe imethibitishwa. Unaweza kuingia sasa.", "auth.passwordHint": "Angalau herufi 8, isiwe ya kawaida sana.",
  "req.title": "Omba nyumba", "req.sub": "Tuambie unachotaka. Tutakuarifu nyumba inayolingana ikipatikana.", "req.area": "Unataka kuishi wapi?", "req.budget": "Bajeti kwa mwezi (KES)",
  "req.min": "Kuanzia", "req.max": "Hadi", "req.amenities": "Huduma", "req.notes": "Kingine chochote?", "req.fee": "Ada ya ombi, inalipwa kwa M-Pesa", "req.pay": "Lipa {fee} na utume ombi",
  "req.waiting": "Angalia simu yako na uweke PIN yako ya M-Pesa.", "req.paid": "Malipo yamepokelewa. Ombi lako linafanya kazi.", "req.failed": "Malipo hayakukamilika. Unaweza kujaribu tena.",
  "mg.title": "Muhtasari", "mg.collected": "Kodi iliyokusanywa", "mg.due": "Kodi ya mwezi huu", "mg.occupancy": "Nyumba zilizojaa", "mg.arrears": "Madeni ya kodi", "mg.repairs": "Matengenezo yaliyo wazi",
  "mg.attention": "Yanahitaji uangalizi", "mg.remind": "Tuma vikumbusho vya kodi", "mg.reminded": "Vikumbusho {n} vimetumwa", "mg.generate": "Tengeneza ankara za mwezi huu", "mg.generated": "Ankara {n} zimetengenezwa",
  "mg.invoices": "Ankara za kodi", "mg.record": "Andika malipo", "mg.amount": "Kiasi (KES)", "mg.method": "Njia", "mg.reference": "Nambari ya M-Pesa", "mg.paidOn": "Tarehe ya malipo",
  "mg.tenants": "Wapangaji na mikataba", "mg.addTenant": "Ongeza mpangaji", "mg.unit": "Nyumba", "mg.tenantName": "Jina la mpangaji", "mg.start": "Mkataba unaanza", "mg.end": "Mkataba unaisha", "mg.rent": "Kodi ya mwezi (KES)",
  "mg.repairsTitle": "Maombi ya matengenezo", "mg.assign": "Mpe fundi", "mg.schedule": "Tarehe na saa ya ziara",
  "status.paid": "Imelipwa", "status.partial": "Imelipwa nusu", "status.overdue": "Imechelewa", "status.unpaid": "Haijalipwa", "status.open": "Wazi", "status.scheduled": "Imepangwa", "status.in_progress": "Inaendelea",
  "status.available": "Inapatikana", "status.occupied": "Imejaa", "status.done": "Imekamilika", "status.closed": "Imefungwa", "status.active": "Inatumika", "status.ended": "Imeisha",
  "th.home": "Nyumbani kwangu", "th.report": "Ripoti tatizo", "th.problem": "Tatizo ni nini?", "th.reported": "Tatizo limeripotiwa. Mwenye nyumba ameambiwa.",
  "pro.title": "Maombi ya kazi", "pro.quote": "Tuma bei", "pro.price": "Bei yako (KES)", "pro.note": "Ujumbe kwa mteja", "pro.sent": "Bei imetumwa.",
};
const dict = { en, sw } as const;

interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (k: Key, vars?: Record<string, string | number>) => string }
const I18n = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k) => en[k] });

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initial ?? ((typeof localStorage !== "undefined" && (localStorage.getItem("makao-lang") as Lang)) || "en"));
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem("makao-lang", l); } catch { /* ignore */ } }, []);
  const t = useCallback((k: Key, vars?: Record<string, string | number>) => {
    let s: string = dict[lang][k] ?? en[k];
    if (vars) for (const [n, v] of Object.entries(vars)) s = s.replace(`{${n}}`, String(v));
    return s;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
export const useI18n = () => useContext(I18n);
export const useT = () => useContext(I18n).t;
/** Inline English/Kiswahili for the newer screens: L("English", "Kiswahili"). */
export const useL = () => { const { lang } = useContext(I18n); return (en: string, sw: string) => (lang === "sw" ? sw : en); };
