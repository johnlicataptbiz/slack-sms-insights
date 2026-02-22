import { Navigate, Route, Routes } from 'react-router-dom';

import V2Shell from './layout/V2Shell';
import InboxV2 from './pages/InboxV2';
import InsightsV2 from './pages/InsightsV2';
import RepV2 from './pages/RepV2';
import RunsV2 from './pages/RunsV2';
import SequencesV2 from './pages/SequencesV2';
import './v2.css';

const V2NotFound = () => (
  <div className="V2Page">
    <h1 className="V2NotFound">Route not found in v2 layer.</h1>
  </div>
);

export default function V2App() {
  return (
    <V2Shell>
      <Routes>
        <Route path="insights" element={<InsightsV2 />} />
        <Route path="inbox" element={<InboxV2 />} />
        <Route path="runs" element={<RunsV2 />} />
        <Route path="rep/jack" element={<RepV2 rep="jack" />} />
        <Route path="rep/brandon" element={<RepV2 rep="brandon" />} />
        <Route path="sequences" element={<SequencesV2 />} />
        <Route path="attribution" element={<Navigate to="/v2/sequences" replace />} />
        <Route path="" element={<Navigate to="insights" replace />} />
        <Route path="*" element={<V2NotFound />} />
      </Routes>
    </V2Shell>
  );
}
