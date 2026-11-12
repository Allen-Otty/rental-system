import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Guard from "./components/Guard";
import { Loading, Skeleton } from "./components/ui";
import Landing from "./pages/Landing";
import { ConfirmEmail, Login, Signup } from "./pages/Auth";
import { NotFound, ProInbox, TenantHome } from "./pages/Other";
import { Overview, Rent, Repairs, Tenants } from "./pages/Manage";

const Explore = lazy(() => import("./pages/Explore"));
const Listing = lazy(() => import("./pages/Listing"));
const LandPage = lazy(() => import("./pages/Land"));
const Services = lazy(() => import("./pages/Services"));
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
          <Route path="pro" element={<Guard roles={["provider"]}><ProInbox /></Guard>} />
          <Route path="manage" element={<Guard roles={[...M]}><Overview /></Guard>} />
          <Route path="manage/tenants" element={<Guard roles={[...M]}><Tenants /></Guard>} />
          <Route path="manage/rent" element={<Guard roles={[...M]}><Rent /></Guard>} />
          <Route path="manage/repairs" element={<Guard roles={[...M]}><Repairs /></Guard>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
