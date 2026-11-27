import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Guard from "./components/Guard";
import { Loading, Skeleton } from "./components/ui";
import Landing from "./pages/Landing";
import { ConfirmEmail, Login, Signup } from "./pages/Auth";
import { NotFound } from "./pages/Other";
import { TenantHome } from "./pages/Tenant";
import { ProHome } from "./pages/Pro";
import { Account, Workspaces } from "./pages/Account";
import { AddProperty, Properties } from "./pages/Properties";
import { Overview, Rent, Repairs, Tenants } from "./pages/Manage";

const Explore = lazy(() => import("./pages/Explore"));
const Listing = lazy(() => import("./pages/Listing"));
const LandPage = lazy(() => import("./pages/Land"));
const Services = lazy(() => import("./pages/Services"));
const AdminHome = lazy(() => import("./pages/Admin"));
const Mpesa = lazy(() => import("./pages/Mpesa"));
const Chat = lazy(() => import("./pages/Chat"));
const RequestHome = lazy(() => import("./pages/RequestHome"));

const M = ["landlord", "agent"] as const;
export default function App() {
  return (
    <Suspense fallback={<div className="wrap page"><Loading><Skeleton h={44} w="45%" /></Loading></div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="explore" element={<Explore />} />
          <Route path="listing/:id" element={<Listing />} />
          <Route path="land" element={<LandPage />} />
          <Route path="services" element={<Services />} />
          <Route path="request" element={<RequestHome />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route path="confirm-email" element={<ConfirmEmail />} />
          <Route path="my" element={<Guard roles={["tenant"]}><TenantHome /></Guard>} />
          <Route path="pro" element={<Guard roles={["provider"]}><ProHome /></Guard>} />
          <Route path="manage" element={<Guard roles={[...M]}><Overview /></Guard>} />
          <Route path="manage/tenants" element={<Guard roles={[...M]}><Tenants /></Guard>} />
          <Route path="manage/rent" element={<Guard roles={[...M]}><Rent /></Guard>} />
          <Route path="manage/repairs" element={<Guard roles={[...M]}><Repairs /></Guard>} />
          <Route path="admin" element={<Guard roles={["admin", "staff"]}><AdminHome /></Guard>} />
          <Route path="mpesa" element={<Guard roles={["tenant", "landlord", "agent", "provider", "admin", "staff"]}><Mpesa /></Guard>} />
          <Route path="chat" element={<Guard roles={["tenant", "landlord", "agent", "provider"]}><Chat /></Guard>} />
          <Route path="account" element={<Guard roles={["tenant", "landlord", "agent", "provider", "admin", "staff"]}><Account /></Guard>} />
          <Route path="workspaces" element={<Guard roles={["tenant", "landlord", "agent", "provider", "admin", "staff"]}><Workspaces /></Guard>} />
          <Route path="manage/properties" element={<Guard roles={[...M]}><Properties /></Guard>} />
          <Route path="manage/properties/new" element={<Guard roles={[...M]}><AddProperty /></Guard>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
