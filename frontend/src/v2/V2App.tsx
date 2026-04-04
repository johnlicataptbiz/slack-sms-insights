import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';

import { ErrorBoundary } from './components/ErrorBoundary';
import { V2Panel, V2State } from './components/V2Primitives';
import V2Shell from './layout/V2Shell';
import InsightsV2 from './pages/InsightsV2';
import RunsV2 from './pages/RunsV2';
import SequencesV2 from './pages/SequencesV2';
import { easing } from './utils/motion';
import './v2.css';
import './styles/components.css';

// Enhanced page transition variants
const enhancedPageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.98,
    filter: 'blur(4px)',
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.4,
      ease: easing.smooth,
      staggerChildren: 0.08,
    },
  },
  exit: {
    opacity: 0,
    y: -15,
    scale: 0.99,
    filter: 'blur(2px)',
    transition: {
      duration: 0.25,
      ease: 'easeIn' as const,
    },
  },
};

const V2NotFound = () => (
  <motion.div
    className="V2Page"
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.3 }}
  >
    <V2Panel title="Page Not Found" caption="This route does not exist in v2.">
      <V2State kind="empty">Route not found in v2 layer.</V2State>
    </V2Panel>
  </motion.div>
);

// Error fallback component
const PageErrorFallback = () => (
  <motion.div
    className="V2Page"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
  >
    <V2Panel title="Something went wrong" caption="An error occurred while loading this page.">
      <V2State kind="error">
        Please try refreshing the page or contact support if the issue persists.
      </V2State>
    </V2Panel>
  </motion.div>
);

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={enhancedPageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ display: 'contents' }}
      >
        <Routes location={location}>
          <Route
            path="insights"
            element={
              <ErrorBoundary fallback={<PageErrorFallback />}>
                <InsightsV2 />
              </ErrorBoundary>
            }
          />
          <Route
            path="inbox"
            element={
              <ErrorBoundary fallback={<PageErrorFallback />}>
                <Suspense fallback={<V2Panel title="Inbox" caption="Loading messages..."><V2State kind="loading">Loading inbox…</V2State></V2Panel>}>
                  <InboxV2 />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="runs"
            element={
              <ErrorBoundary fallback={<PageErrorFallback />}>
                <RunsV2 />
              </ErrorBoundary>
            }
          />
          <Route path="rep/jack" element={<Navigate to="/v2/insights?rep=jack" replace />} />
          <Route path="rep/brandon" element={<Navigate to="/v2/insights?rep=brandon" replace />} />
          <Route
            path="sequences"
            element={
              <ErrorBoundary fallback={<PageErrorFallback />}>
                <SequencesV2 />
              </ErrorBoundary>
            }
          />
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
    <ErrorBoundary>
      {/* Skip to main content link for accessibility */}
      <a href="#main-content" className="V2SkipLink">
        Skip to main content
      </a>

      <V2Shell>
        <main id="main-content" role="main">
          <AnimatedRoutes />
        </main>
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
    </ErrorBoundary>
  );
}
const InboxV2 = lazy(() => import('./pages/InboxV2'));
