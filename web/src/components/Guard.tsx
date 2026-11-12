import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Loading, Skeleton } from "./ui";
import type { Role } from "../lib/types";

export default function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="wrap page"><Loading><Skeleton h={40} w="40%" /></Loading></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!roles.includes(user.role) && !["admin", "staff"].includes(user.role)) return <div className="wrap page"><h1 className="page-title">403</h1><p className="muted" style={{ marginTop: 12 }}>This page is for a different kind of account.</p></div>;
  return <>{children}</>;
}
