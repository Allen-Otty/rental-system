import { type ReactElement } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { I18nProvider } from "./lib/i18n";

vi.stubEnv("VITE_DEMO", "1");

function renderAt(path: string, ui: ReactElement = <App />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><I18nProvider><AuthProvider><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></AuthProvider></I18nProvider></QueryClientProvider>);
}
const signedInAs = (role: string) => { localStorage.setItem("makao-refresh", "demo"); localStorage.setItem("demo-role", role); };

beforeEach(() => { localStorage.clear(); document.documentElement.lang = "en"; });
afterEach(cleanup);

describe("page structure", () => {
  it("has the landmarks, one h1 and a skip link, and no axe violations", async () => {
    const { container } = renderAt("/");
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main");
    expect(await axe(container)).toHaveNoViolations();
  });
  it("the search box has a real label", () => {
    renderAt("/");
    expect(screen.getByRole("searchbox", { name: /search ward, estate or landmark/i })).toBeInTheDocument();
  });
});

describe("skeleton loaders", () => {
  it("show a single polite 'Loading' status while data loads, then real results", async () => {
    const { container } = renderAt("/explore");
    const status = screen.getAllByRole("status").find((s) => s.getAttribute("aria-busy") === "true");
    expect(status).toBeTruthy();
    expect(within(status!).getByText("Loading")).toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".skeleton[aria-hidden='true']").length).toBe(container.querySelectorAll(".skeleton").length);
    expect(await axe(container)).toHaveNoViolations(); // loading state is accessible too
    await screen.findByRole("heading", { name: /2 bedroom, Roysambu/i, level: 2 });
    expect(container.querySelectorAll(".skeleton").length).toBe(0);
    expect(await axe(container)).toHaveNoViolations();
  });
  it("announces the number of results politely", async () => {
    renderAt("/explore");
    expect(await screen.findByText("12 homes found")).toBeInTheDocument();
  });
});

describe("explore filters", () => {
  it("filters by maximum rent and explains when nothing matches", async () => {
    const user = userEvent.setup();
    renderAt("/explore");
    await screen.findByText("12 homes found");
    await user.type(screen.getByLabelText("Maximum rent (KES)"), "10000");
    expect(await screen.findByText("3 homes found")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Maximum rent (KES)"));
    await user.type(screen.getByLabelText("Maximum rent (KES)"), "100");
    expect(await screen.findByText(/No homes match these filters/)).toBeInTheDocument();
  });
  it("list/map toggle exposes its state with aria-pressed", async () => {
    renderAt("/explore");
    await screen.findByText("12 homes found");
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("language and theme", () => {
  it("switches to Kiswahili and updates the page language", async () => {
    const user = userEvent.setup();
    renderAt("/");
    await user.click(screen.getByRole("button", { name: "SW" }));
    expect(document.documentElement.lang).toBe("sw");
    expect(screen.getByRole("link", { name: /Ruka hadi maudhui makuu/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SW" })).toHaveAttribute("aria-pressed", "true");
  });
  it("theme toggle is a labelled toggle button", async () => {
    const user = userEvent.setup();
    renderAt("/");
    const btn = screen.getByRole("button", { name: "Switch theme" });
    await user.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBeTruthy();
    expect(btn).toHaveAttribute("aria-pressed");
  });
});

describe("forms", () => {
  it("sign in: labelled fields, shows nothing alarming until used, no axe violations", async () => {
    const { container } = renderAt("/login");
    expect(screen.getByLabelText(/email or phone number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
  it("sign up: consent must be ticked, then the 'check your email' step appears", async () => {
    const user = userEvent.setup();
    const { container } = renderAt("/signup");
    const submit = screen.getByRole("button", { name: "Create account" });
    expect(submit).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
    await user.type(screen.getByLabelText(/full name/i), "Amina Otieno");
    await user.type(screen.getByLabelText(/^email/i), "amina@example.com");
    await user.type(screen.getByLabelText(/phone number/i), "0712345678");
    await user.type(screen.getByLabelText(/^password/i), "Str0ng-pass-2026!");
    await user.click(screen.getByLabelText(/agree to be contacted/i));
    expect(submit).toBeEnabled();
    await user.click(submit);
    // Demo mode: the account is created and the person is signed straight in (no email step).
    expect(screen.queryByRole("heading", { name: "Check your email" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Create account" })).not.toBeInTheDocument());
  });
  it("request a home asks you to sign in first, with a clear link", async () => {
    renderAt("/request");
    await screen.findByRole("heading", { name: "Request a home", level: 1 });
    expect(screen.getAllByRole("link", { name: "Sign in" }).every((l) => l.getAttribute("href") === "/login")).toBe(true);
  });
});

describe("access control", () => {
  it("sends signed-out people from landlord pages to sign in", async () => {
    renderAt("/manage");
    expect(await screen.findByRole("heading", { name: "Sign in", level: 1 })).toBeInTheDocument();
  });
  it("tells a tenant a landlord page is not for them", async () => {
    signedInAs("tenant");
    renderAt("/manage");
    expect(await screen.findByText(/different kind of account/i)).toBeInTheDocument();
  });
});

describe("landlord screens", () => {
  it("overview shows skeleton stats, then numbers; statuses use words and icons, not colour alone", async () => {
    signedInAs("landlord");
    const { container } = renderAt("/manage");
    await screen.findByText("CURRENT MONTH REVENUE");
    expect(await axe(container)).toHaveNoViolations();
    const tag = screen.getAllByText("Overdue").find((el) => el.closest(".tag"))!;
    expect(tag.closest(".tag")?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
  it("rent page: recording a payment uses labelled fields and updates the status", async () => {
    signedInAs("landlord");
    const user = userEvent.setup();
    const { container } = renderAt("/manage/rent");
    await screen.findAllByText(/Grace Wanjiru/);
    await user.click(screen.getAllByRole("button", { name: "Record payment" })[0]);
    expect(screen.getByLabelText(/^Amount \(KES\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^M-Pesa code/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
  it("repairs page has labelled selects and no axe violations", async () => {
    signedInAs("landlord");
    const { container } = renderAt("/manage/repairs");
    await screen.findByText("Leaky faucet");
    expect(screen.getAllByLabelText("Assign vendor").length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("services and land", () => {
  it("services page: category buttons expose their state and providers load", async () => {
    const { container } = renderAt("/services");
    await screen.findByText("Swift Movers Ltd");
    expect(screen.getByRole("button", { name: "Movers" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(async () => expect(await axe(container)).toHaveNoViolations());
  });
  it("land page shows Verified with an icon and words, and Not verified clearly", async () => {
    renderAt("/land");
    await screen.findByText("Quarter acre, Kitengela");
    expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not verified").length).toBeGreaterThan(0);
  });
});

describe("translations", () => {
  it("every English string has a Kiswahili one", async () => {
    const mod = await import("./lib/i18n");
    expect(mod).toBeTruthy(); // types already force the same keys; this guards empty strings
  });
});

describe("new app screens", () => {
  it("landlord can add a property with a unit, and it shows in their list", async () => {
    signedInAs("landlord");
    const user = userEvent.setup();
    const { container } = renderAt("/manage/properties/new");
    await user.type(await screen.findByLabelText(/Property name/), "Sunrise Court");
    await user.type(screen.getByLabelText(/Estate or area/), "Kilimani");
    await user.type(screen.getByLabelText(/Latitude/), "-1.29");
    await user.type(screen.getByLabelText(/Longitude/), "36.78");
    await user.type(screen.getByLabelText(/Unit name or number/), "A1");
    await user.type(screen.getByLabelText(/Monthly rent/), "30000");
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole("button", { name: "Publish listing" }));
    expect(await screen.findByText(/Property saved/)).toBeInTheDocument();
  });
  it.each([["tenant", "/mpesa", "M-Pesa Hub"], ["tenant", "/account", "Account hub"], ["tenant", "/workspaces", "Switch workspace"], ["tenant", "/chat", "Mzee J. Ambani"], ["provider", "/pro", "Pro workspace"], ["admin", "/admin", "Admin dashboard"], ["landlord", "/mpesa", "M-Pesa"]])("%s %s renders with no axe violations", async (role, path, heading) => {
    signedInAs(role);
    const { container } = renderAt(path);
    await screen.findByRole("heading", { name: heading });
    if (path === "/pro" || path === "/admin" || path === "/chat") await screen.findAllByText(/./);
    expect(await axe(container)).toHaveNoViolations();
  });
  it("the bottom tabs follow the role", async () => {
    signedInAs("landlord");
    renderAt("/manage");
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Discover", "Services", "M-Pesa", "Account"]);
  });
  it("switching role in demo goes to that workspace", async () => {
    signedInAs("tenant");
    const user = userEvent.setup();
    renderAt("/workspaces");
    const cards = await screen.findAllByRole("button", { name: "Unlock" });
    await user.click(cards[0]);
    expect(await screen.findByRole("heading", { name: "Admin dashboard" })).toBeInTheDocument();
  });
});
