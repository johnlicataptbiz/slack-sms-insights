import { Analytics } from "@vercel/analytics/react";
import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ApiError, client, setUnauthorizedHandler } from "./api/client";
import { PasswordGate } from "./components/PasswordGate";
import SeoMetadata from "./components/SeoMetadata";
import { type UiMode, parseUiMode } from "./uiMode";

const V2App = lazy(() => import("./v2/V2App"));

const resolveUiMode = (): UiMode => {
  const envMode = parseUiMode(import.meta.env.VITE_UI_VERSION);
  return envMode || "v2";
};

const DefaultRoute = () => {
  return <Navigate to="/v2/insights" replace />;
};

const AppRoutes = () => (
  <BrowserRouter>
    <SeoMetadata />
    <Routes>
      <Route path="/legacy" element={<Navigate to="/v2/insights" replace />} />
      <Route
        path="/legacy/*"
        element={<Navigate to="/v2/insights" replace />}
      />
      <Route
        path="/v2/*"
        element={
          <Suspense
            fallback={
              <div className="text-muted-foreground">Loading dashboard...</div>
            }
          >
            <V2App />
          </Suspense>
        }
      />
      <Route path="*" element={<DefaultRoute />} />
    </Routes>
  </BrowserRouter>
);

export default function App() {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [v2ApiUnavailable, setV2ApiUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const bootstrapTimeout = window.setTimeout(() => {
      if (!cancelled) {
        setIsAuthed(false);
      }
    }, 10000);

    setUnauthorizedHandler(() => {
      if (!cancelled) {
        setIsAuthed(false);
      }
    });

    const verifySession = async () => {
      try {
        await client.get("/api/auth/verify");

        try {
          await client.get("/api/v2/insights/summary?range=7d");
          if (!cancelled) {
            setV2ApiUnavailable(false);
          }
        } catch (error) {
          if (
            !cancelled &&
            error instanceof ApiError &&
            (error.status === 404 ||
              error.status === 502 ||
              error.status === 503)
          ) {
            setV2ApiUnavailable(true);
          }
        }

        if (!cancelled) {
          setIsAuthed(true);
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && error.status === 401) {
            setIsAuthed(false);
          } else {
            setIsAuthed(false);
          }
        }
      }
    };

    void verifySession().finally(() => {
      clearTimeout(bootstrapTimeout);
    });

    return () => {
      cancelled = true;
      clearTimeout(bootstrapTimeout);
      setUnauthorizedHandler(() => {});
    };
  }, []);

  if (isAuthed === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "var(--muted-foreground, #888)",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <>
        <PasswordGate onUnlock={() => setIsAuthed(true)} />
        <Analytics />
      </>
    );
  }

  if (v2ApiUnavailable) {
    return (
      <>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f1115",
            color: "#f8fafc",
            padding: "24px",
          }}
        >
          <div
            style={{
              width: "min(720px, 100%)",
              border: "1px solid rgba(148, 163, 184, 0.35)",
              borderRadius: "16px",
              padding: "24px",
              background: "rgba(15, 23, 42, 0.75)",
              backdropFilter: "blur(6px)",
              boxShadow: "0 20px 50px rgba(2, 6, 23, 0.45)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#fbbf24",
                fontWeight: 700,
              }}
            >
              Dashboard Status
            </p>
            <h1 style={{ margin: "10px 0 8px", fontSize: "30px" }}>
              Data services are reconnecting
            </h1>
            <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.6 }}>
              We can still verify authentication, but core V2 data endpoints are
              currently unavailable. This is usually temporary while backend
              deployment settings are being corrected.
            </p>

            <div
              style={{
                marginTop: "18px",
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  border: "none",
                  borderRadius: "10px",
                  padding: "10px 16px",
                  background: "#06b6d4",
                  color: "#05202a",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Retry now
              </button>
              <a
                href="/api/health"
                target="_blank"
                rel="noreferrer"
                style={{
                  borderRadius: "10px",
                  padding: "10px 16px",
                  border: "1px solid rgba(148, 163, 184, 0.45)",
                  color: "#e2e8f0",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Open API health check
              </a>
            </div>
          </div>
        </div>
        <Analytics />
      </>
    );
  }

  return (
    <>
      <AppRoutes />
      <Analytics />
    </>
  );
}

export const detectUiMode = resolveUiMode;
