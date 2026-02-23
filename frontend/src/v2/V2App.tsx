import { Navigate, Route, Routes } from "react-router-dom";

import { V2Panel, V2State } from "./components/V2Primitives";
import { DashboardLayout } from "@/components/v2/DashboardLayout";
import DashboardV2 from "@/pages/DashboardV2";
import "./v2.css";

const V2NotFound = () => (
  <div className="V2Page">
    <V2Panel title="Page Not Found" caption="This route does not exist in v2.">
      <V2State kind="empty">Route not found in v2 layer.</V2State>
    </V2Panel>
  </div>
);

export default function V2App() {
  return (
    <DashboardLayout>
      <Routes>
        <Route path="insights" element={<DashboardV2 />} />
        <Route path="" element={<Navigate to="insights" replace />} />
        <Route path="*" element={<V2NotFound />} />
      </Routes>
    </DashboardLayout>
  );
}
