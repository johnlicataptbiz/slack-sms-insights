import { AnimatePresence, motion } from 'framer-motion';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';

import { V2Panel, V2State } from './components/V2Primitives';
import V2Shell from './layout/V2Shell';
import InboxV2 from './pages/InboxV2';
import InsightsV2 from './pages/InsightsV2';
import RepV2 from './pages/RepV2';
import RunsV2 from './pages/RunsV2';
import SequencesV2 from './pages/SequencesV2';
import './v2.css';

const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.18, ease: 'easeIn' as const } },
};

const V2NotFound = () => (
  <div className="V2Page">
    <V2Panel title="Page Not Found" caption="This route does not exist in v2.">
      <V2State kind="empty">Route not found in v2 layer.</V2State>
    </V2Panel>
  </div>
);

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ display: 'contents' }}
      >
        <Routes location={location}>
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
      </motion.div>
    </AnimatePresence>
  );
}

export default function V2App() {
  return (
    <>
      <V2Shell>
        <AnimatedRoutes />
      </V2Shell>
      {/* Sonner toast container — themed to match v2 design system */}
      <Toaster
        position="bottom-right"
        expand={false}
        richColors
        closeButton
        toastOptions={{
          classNames: {
            toast: 'v2-sonner-toast',
            title: 'v2-sonner-title',
            description: 'v2-sonner-description',
            actionButton: 'v2-sonner-action',
            closeButton: 'v2-sonner-close',
          },
        }}
      />
    </>
  );
}
