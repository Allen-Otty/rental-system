import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useT } from "../lib/i18n";
import { ListSkeleton } from "./ui";

/** One place that handles loading (skeleton), error (retry) and empty states for any query. */
export function Async<T>({ q, skeleton = <ListSkeleton />, empty, isEmpty, children }: { q: UseQueryResult<T>; skeleton?: ReactNode; empty?: ReactNode; isEmpty?: (d: T) => boolean; children: (d: T) => ReactNode }) {
  const t = useT();
  if (q.isPending) return <>{skeleton}</>;
  if (q.isError) return <div className="card" role="alert"><p>{q.error instanceof Error ? q.error.message : t("common.error")}</p><p style={{ marginTop: 12 }}><button type="button" className="btn btn-sm" onClick={() => q.refetch()}>{t("common.retry")}</button></p></div>;
  if (isEmpty?.(q.data)) return <>{empty ?? <p className="muted">{t("common.none")}</p>}</>;
  return <>{children(q.data)}</>;
}
