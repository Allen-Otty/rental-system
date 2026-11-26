import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { I18nProvider } from "./lib/i18n";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/pages.css";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode><QueryClientProvider client={qc}><I18nProvider><AuthProvider><BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}><App /></BrowserRouter></AuthProvider></I18nProvider></QueryClientProvider></StrictMode>,
);
