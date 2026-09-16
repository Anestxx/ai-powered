import React, {
  lazy,
  Suspense,
  useEffect,
  useState,
} from 'react';

import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  CircleDot,
  Clock3,
  Expand,
  FlaskConical,
  LayoutGrid,
  LockKeyhole,
  Radio,
  RefreshCw,
  TriangleAlert,
  Wrench,
} from 'lucide-react';

import './App.css';

import Sidebar, { NAV_ITEMS } from './components/Sidebar';

import AlertsPanel, {
  EventFeed,
  EventFilters,
} from './components/AlertsPanel';

import EventDetails from './components/EventDetails';
import NearbySearch from './components/NearbySearch';

import StaffWorkspace, {
  LoginDialog,
} from './components/StaffWorkspace';

import SystemStatus, {
  ModuleList,
} from './components/SystemStatus';

import TrafficAnalyses from './components/TrafficAnalyses';

import useCityData from './hooks/useBackendData';

import {
  DEFAULT_FILTERS,
  EVENT_TYPES,
  exportEvents,
  PAGE_SIZE,
} from './lib/events';

const MapView = lazy(() => import('./components/MapView'));

/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

const readTab = () => {
  const hash = window.location.hash.slice(1);

  const exists = NAV_ITEMS.some(
    (item) => item.id === hash
  );

  return exists ? hash : 'overview';
};

const PAGE_COPY = {
  overview: [
    'OPERATIONS OVERVIEW',
    'A clearer view of your city.',
    'Road conditions, emerging incidents, and your response. All in one place.',
  ],

  map: [
    'SPATIAL INTELLIGENCE',
    'The city, in context.',
    'Explore recorded events and find active incidents near any location.',
  ],

  events: [
    'INCIDENT MANAGEMENT',
    'Every observation matters.',
    'Find, inspect, and track the incidents reported to your city.',
  ],

  operations: [
    'CITY OPERATIONS',
    'Turn observations into action.',
    'A shared workspace for the teams keeping your city moving.',
  ],

  traffic: [
    'RECORDED TRAFFIC ANALYSIS',
    'See what the cameras saw.',
    'Watch annotated video and inspect the measurements from your saved AI runs.',
  ],

  system: [
    'PLATFORM HEALTH',
    'Connected. Visible. Accountable.',
    'Check service connections and see which capabilities are available.',
  ],
};

/* =========================================================
   SUMMARY CARDS

   IMPORTANT:
   No fake 0 values are created here.

   If the backend has not returned data, we show —
   instead of pretending the count is zero.
   ========================================================= */

function SummaryCards({
  summary,
  loading,
  summaryError,
}) {
  const cards = [
    {
      key: 'total',
      label: 'Total incidents',
      note: 'All recorded events',
      icon: LayoutGrid,
      tone: 'mint',
    },

    {
      key: 'detected',
      label: 'Awaiting review',
      note: 'Detected, awaiting confirmation',
      icon: TriangleAlert,
      tone: 'amber',
    },

    {
      key: 'under_repair',
      label: 'Under repair',
      note: 'Response in progress',
      icon: Wrench,
      tone: 'blue',
    },

    {
      key: 'resolved',
      label: 'Resolved',
      note: 'Closed after review',
      icon: CheckCheck,
      tone: 'purple',
    },
  ];

  return (
    <div className="summary-grid">
      {cards.map(
        ({
          key,
          label,
          note,
          icon: Icon,
          tone,
        }) => {
          const rawValue = summary?.[key];

          const hasValue =
            rawValue !== undefined &&
            rawValue !== null &&
            rawValue !== '' &&
            Number.isFinite(Number(rawValue));

          let displayValue = '—';

          if (loading && !summary) {
            displayValue = '…';
          } else if (hasValue) {
            displayValue =
              Number(rawValue).toLocaleString();
          }

          return (
            <section
              className={`summary-card ${tone}`}
              key={key}
            >
              <div className="summary-top">
                <span>{label}</span>

                <span className="summary-icon">
                  <Icon size={18} />
                </span>
              </div>

              <strong className="summary-number">
                {displayValue}
              </strong>

              <div className="summary-note">
                <span className="tiny-dot" />

                {summaryError && !summary
                  ? 'Waiting for backend summary'
                  : note}
              </div>
            </section>
          );
        }
      )}
    </div>
  );
}

/* =========================================================
   INCIDENT BREAKDOWN
   ========================================================= */

function Breakdown({
  summary,
  onType,
}) {
  const counts = Object.entries(EVENT_TYPES)
    .map(([type, config]) => ({
      type,
      ...config,
      count:
        Number(summary?.by_type?.[type]) || 0,
    }))
    .sort(
      (a, b) =>
        b.count - a.count
    );

  const max = Math.max(
    1,
    ...counts.map(
      (item) => item.count
    )
  );

  return (
    <section className="panel breakdown-panel">
      <div className="panel-heading">
        <div>
          <h2>Incident breakdown</h2>

          <p>
            By type · all recorded incidents
          </p>
        </div>

        <span className="count-pill">
          {summary?.total ?? '—'} events
        </span>
      </div>

      <div className="breakdown-bars">
        {counts.map((type) => (
          <button
            className="breakdown-row"
            key={type.type}
            onClick={() =>
              onType(type.type)
            }
            aria-label={`Filter by ${type.label}`}
          >
            <span className="breakdown-label">
              <i
                style={{
                  background: type.color,
                }}
              />

              {type.label}
            </span>

            <span className="bar-track">
              <i
                style={{
                  width: `${
                    (type.count / max) * 100
                  }%`,
                  background: type.color,
                }}
              />
            </span>

            <strong>
              {type.count}
            </strong>
          </button>
        ))}
      </div>
    </section>
  );
}

/* =========================================================
   MAIN APPLICATION
   ========================================================= */

export default function App() {
  const [
    activeTab,
    setActiveTab,
  ] = useState(readTab);

  const [
    demo,
    setDemo,
  ] = useState(false);

  const [
    filters,
    updateFilters,
  ] = useState(DEFAULT_FILTERS);

  const [
    query,
    setQuery,
  ] = useState('');

  const [
    nearby,
    setNearby,
  ] = useState(null);

  const [
    page,
    setPage,
  ] = useState(1);

  const [
    selected,
    setSelected,
  ] = useState(null);

  const [
    session,
    setSession,
  ] = useState(null);

  const [
    loginOpen,
    setLoginOpen,
  ] = useState(false);

  const [
    notice,
    setNotice,
  ] = useState('');

  const [
    search,
    setSearch,
  ] = useState('');

  /* -------------------------
     SEARCH DEBOUNCE
     ------------------------- */

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  /* -------------------------
     BACKEND DATA
     ------------------------- */

  const data = useCityData({
    demo,
    filters,
    nearby,
    page,
    q: search,
  });

  const events =
    Array.isArray(data.items)
      ? data.items
      : [];

  const summary = data.summary;

  /* -------------------------
     PAGE CONTENT
     ------------------------- */

  const currentPage =
    PAGE_COPY[activeTab] ||
    PAGE_COPY.overview;

  const [
    eyebrow,
    heading,
    description,
  ] = currentPage;

  /* -------------------------
     HASH NAVIGATION
     ------------------------- */

  useEffect(() => {
    const onHashChange = () => {
      setActiveTab(readTab());
    };

    window.addEventListener(
      'hashchange',
      onHashChange
    );

    return () => {
      window.removeEventListener(
        'hashchange',
        onHashChange
      );
    };
  }, []);

  /* -------------------------
     DOCUMENT TITLE
     ------------------------- */

  useEffect(() => {
    const tab =
      NAV_ITEMS.find(
        (item) =>
          item.id === activeTab
      );

    document.title =
      `${tab?.label || 'Overview'} · CityLens`;
  }, [activeTab]);

  /* -------------------------
     PAGINATION SAFETY
     ------------------------- */

  useEffect(() => {
    if (
      data.loading ||
      data.error
    ) {
      return;
    }

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          Number(data.total || 0) /
            PAGE_SIZE
        )
      );

    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [
    data.loading,
    data.error,
    data.total,
    page,
  ]);

  /* -------------------------
     STAFF SESSION EXPIRATION
     ------------------------- */

  useEffect(() => {
    if (
      !session ||
      !session.token
    ) {
      return undefined;
    }

    try {
      const part =
        session.token
          .split('.')[1]
          ?.replaceAll('-', '+')
          .replaceAll('_', '/');

      if (!part) {
        return undefined;
      }

      const claims =
        JSON.parse(
          atob(part)
        );

      if (!claims.exp) {
        return undefined;
      }

      const timeout =
        Math.max(
          0,
          claims.exp * 1000 -
            Date.now()
        );

      const timer =
        setTimeout(() => {
          setSession(null);

          setNotice(
            'Your staff session expired. Sign in again to continue.'
          );
        }, timeout);

      return () =>
        clearTimeout(timer);
    } catch {
      return undefined;
    }
  }, [session]);

  /* =========================================================
     ACTIONS
     ========================================================= */

  const navigate = (tab) => {
    const valid =
      NAV_ITEMS.some(
        (item) =>
          item.id === tab
      );

    const target =
      valid
        ? tab
        : 'overview';

    setActiveTab(target);

    if (
      window.location.hash !==
      `#${target}`
    ) {
      window.location.hash =
        target;
    }

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const reset = () => {
    updateFilters(DEFAULT_FILTERS);
    setNearby(null);
    setQuery('');
    setSearch('');
    setPage(1);
  };

  const setFilters = (value) => {
    updateFilters(value);
    setPage(1);
  };

  const toggleDemo = () => {
    setDemo(
      (value) => !value
    );

    reset();

    setSelected(null);
    setLoginOpen(false);
  };

  const openLogin = () => {
    setSelected(null);
    setLoginOpen(true);
  };

  const authError = (error) => {
    if (
      error?.status === 401
    ) {
      setSession(null);

      setNotice(
        'Your session is no longer valid. Please sign in again.'
      );
    }
  };

  const filterType = (type) => {
    setNearby(null);
    setQuery('');
    setSearch('');

    setFilters({
      ...DEFAULT_FILTERS,
      event_type: type,
    });

    navigate('events');
  };

  const hasFilters =
    Boolean(query) ||
    Boolean(nearby) ||
    Object.entries(filters).some(
      ([key, value]) =>
        value !== DEFAULT_FILTERS[key]
    );

  /* -------------------------
     MAP
     ------------------------- */

  const renderMap = (expanded) => (
    <Suspense
      fallback={
        <div className="map-loading">
          Loading city map…
        </div>
      }
    >
      <MapView
        events={events}
        nearby={nearby}
        onSelect={setSelected}
        loading={data.loading}
        demo={demo}
        expanded={expanded}
      />
    </Suspense>
  );

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <div className="app">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();

          document
            .getElementById(
              'main-content'
            )
            ?.focus();
        }}
      >
        Skip to content
      </a>

      <Sidebar
        activeTab={activeTab}
        navigate={navigate}
        health={data.health}
        demo={demo}
        toggleDemo={toggleDemo}
        total={summary?.total}
      />

      <div className="main-shell">
        {/* TOP BAR */}

        <header className="topbar">
          <div className="breadcrumb">
            Workspace

            <span>/</span>

            <strong>
              {NAV_ITEMS.find(
                (item) =>
                  item.id === activeTab
              )?.label || 'Overview'}
            </strong>
          </div>

          <div className="topbar-actions">
            <span className="date-display">
              <CalendarDays size={14} />

              {new Date().toLocaleDateString(
                undefined,
                {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }
              )}
            </span>

            <span className="topbar-divider" />

            <button
              className="account-button"
              onClick={
                session
                  ? () =>
                      navigate(
                        'operations'
                      )
                  : openLogin
              }
              disabled={demo}
            >
              <span className="account-avatar">
                {session ? (
                  session.email
                    ?.charAt(0)
                    .toUpperCase()
                ) : (
                  <LockKeyhole
                    size={14}
                  />
                )}
              </span>

              <span>
                {session
                  ? 'Staff account'
                  : 'Staff sign in'}
              </span>
            </button>
          </div>
        </header>

        <main
          className="main"
          id="main-content"
          tabIndex={-1}
        >
          {/* DEMO */}

          {demo && (
            <div
              className="demo-banner"
              role="status"
            >
              <FlaskConical size={18} />

              <div>
                <strong>
                  Demo preview
                </strong>

                <span>
                  Sample events for exploration.
                  Your backend data is unchanged.
                </span>
              </div>

              <button
                onClick={toggleDemo}
              >
                Return to live data

                <ArrowRight
                  size={15}
                />
              </button>
            </div>
          )}

          {/* NOTICE */}

          {notice && (
            <div
              className="notice-banner"
              role="status"
            >
              {notice}

              <button
                className="text-button"
                onClick={() =>
                  setNotice('')
                }
              >
                Dismiss
              </button>
            </div>
          )}

          {/* HEADING */}

          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {eyebrow}
              </span>

              <h1>{heading}</h1>

              <p>{description}</p>
            </div>

            <div className="page-actions">
              <button
                className={`button secondary ${
                  data.loading
                    ? 'is-loading'
                    : ''
                }`}
                onClick={data.refresh}
                disabled={data.loading}
              >
                <RefreshCw size={15} />

                Refresh
              </button>

              {[
                'overview',
                'map',
              ].includes(
                activeTab
              ) && (
                <button
                  className="button primary"
                  onClick={() =>
                    exportEvents(events)
                  }
                  disabled={
                    events.length === 0
                  }
                >
                  <ArrowDownToLine
                    size={15}
                  />

                  Export page
                </button>
              )}
            </div>
          </div>

          {/* BACKEND ERROR */}

          {!demo &&
            (data.error ||
              data.health?.state ===
                'offline') && (
              <div
                className="error-banner"
                role="alert"
              >
                <TriangleAlert
                  size={18}
                />

                <div>
                  <strong>
                    {data.error
                      ? 'Event feed unavailable'
                      : 'Backend connection needs attention'}
                  </strong>

                  <p>
                    {data.error ||
                      data.health?.message ||
                      'Unable to connect to backend.'}
                  </p>
                </div>

                <button
                  className="button secondary small"
                  onClick={data.refresh}
                >
                  Retry
                </button>
              </div>
            )}

          {/* EVENT DATA STATUS */}

          {[
            'overview',
            'map',
            'events',
          ].includes(
            activeTab
          ) && (
            <>
              <div className="data-context">
                <span>
                  <span
                    className={`status-dot ${
                      demo
                        ? 'demo'
                        : data.error
                          ? 'offline'
                          : data.stream ===
                              'live'
                            ? 'online'
                            : 'checking'
                    }`}
                  />

                  {demo
                    ? 'DEMO DATA'
                    : data.error
                      ? 'SYNC INTERRUPTED'
                      : data.stream ===
                          'live'
                        ? 'LIVE EVENT FEED'
                        : data.stream ===
                            'connecting'
                          ? 'CONNECTING LIVE FEED'
                          : 'UPDATES EVERY 30 SECONDS'}
                </span>

                <span>
                  <Clock3 size={12} />

                  {data.updatedAt
                    ? `Synced ${data.updatedAt.toLocaleTimeString()}`
                    : 'Waiting for data'}
                </span>
              </div>

              {/* REAL BACKEND SUMMARY */}

              {activeTab ===
                'overview' && (
                <SummaryCards
                  summary={summary}
                  loading={data.loading}
                  summaryError={
                    data.summaryError
                  }
                />
              )}

              {/* FILTERS */}

              <div className="filter-section">
                <EventFilters
                  filters={filters}
                  setFilters={setFilters}
                  query={query}
                  setQuery={setQuery}
                  nearby={nearby}
                  clearNearby={() => {
                    setNearby(null);
                    setPage(1);
                  }}
                />

                {hasFilters && (
                  <button
                    className="text-button reset-button"
                    onClick={reset}
                  >
                    Reset filters
                  </button>
                )}
              </div>
            </>
          )}

          {/* =================================================
              OVERVIEW
              ================================================= */}

          {activeTab ===
            'overview' && (
            <>
              <div className="overview-grid">
                <section className="panel map-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        <span className="heading-dot" />

                        City event map
                      </h2>

                      <p>
                        Active events from the
                        current page of results
                      </p>
                    </div>

                    <button
                      className="icon-button"
                      onClick={() =>
                        navigate('map')
                      }
                      aria-label="Expand city map"
                    >
                      <Expand size={17} />
                    </button>
                  </div>

                  {renderMap(false)}
                </section>

                <section className="panel feed-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Recent incidents
                      </h2>

                      <p>
                        Latest observations in
                        your results
                      </p>
                    </div>

                    <Radio
                      size={17}
                      className="muted"
                    />
                  </div>

                  <EventFeed
                    events={events}
                    loading={data.loading}
                    onSelect={setSelected}
                    onDemo={toggleDemo}
                    demo={demo}
                  />

                  <button
                    className="feed-footer"
                    onClick={() =>
                      navigate('events')
                    }
                  >
                    View all incidents

                    <ArrowRight
                      size={15}
                    />
                  </button>
                </section>
              </div>

              <div className="overview-bottom">
                <Breakdown
                  summary={summary}
                  onType={filterType}
                />

                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Intelligence modules
                      </h2>

                      <p>
                        Your platform at a glance
                      </p>
                    </div>

                    <CircleDot
                      size={18}
                      className="muted"
                    />
                  </div>

                  <ModuleList compact />

                  <button
                    className="feed-footer"
                    onClick={() =>
                      navigate('system')
                    }
                  >
                    View integration status

                    <ArrowUpRight
                      size={15}
                    />
                  </button>
                </section>
              </div>

              <div className="scope-note">
                Overview totals and breakdown
                cover all recorded events.
                Map and recent incidents use
                up to {PAGE_SIZE} events from
                page {page}.

                <button
                  className="text-button"
                  onClick={() =>
                    navigate('events')
                  }
                >
                  Browse all pages

                  <ArrowRight
                    size={13}
                  />
                </button>
              </div>
            </>
          )}

          {/* =================================================
              LIVE MAP
              ================================================= */}

          {activeTab === 'map' && (
            <>
              <NearbySearch
                nearby={nearby}
                onSearch={(area) => {
                  setNearby(area);
                  setQuery('');
                  setSearch('');
                  setPage(1);
                }}
                onClear={reset}
              />

              <section className="panel map-panel full-map">
                <div className="panel-heading">
                  <div>
                    <h2>
                      {nearby
                        ? 'Nearby active incidents'
                        : 'City event map'}
                    </h2>

                    <p>
                      {nearby
                        ? `Within ${
                            nearby.radius /
                            1000
                          } km · nearest first`
                        : 'Active events from your current results'}

                      {' · '}

                      {events.length} loaded of{' '}
                      {data.total}
                    </p>
                  </div>

                  <button
                    className="text-button"
                    onClick={() =>
                      navigate('events')
                    }
                  >
                    Browse results

                    <ArrowRight
                      size={15}
                    />
                  </button>
                </div>

                {renderMap(true)}
              </section>
            </>
          )}

          {/* =================================================
              INCIDENTS
              ================================================= */}

          {activeTab ===
            'events' && (
            <AlertsPanel
              events={events}
              total={data.total}
              page={page}
              setPage={setPage}
              onSelect={setSelected}
              loading={data.loading}
              query={query}
              onReset={reset}
              error={data.error}
            />
          )}

          {/* =================================================
              STAFF
              ================================================= */}

          {activeTab ===
            'operations' && (
            <StaffWorkspace
              onObservation={(event) => {
                data.refresh();
                setSelected(event);
              }}
              revision={data.updatedAt}
              session={session}
              onSignIn={openLogin}
              onSignOut={() =>
                setSession(null)
              }
              onAuthError={authError}
              demo={demo}
              navigate={navigate}
            />
          )}

          {/* TRAFFIC */}

          {activeTab ===
            'traffic' && (
            <TrafficAnalyses
              revision={data.updatedAt}
            />
          )}

          {/* SYSTEM */}

          {activeTab ===
            'system' && (
            <SystemStatus
              health={data.health}
              stream={data.stream}
              updatedAt={data.updatedAt}
              refresh={data.refresh}
              demo={demo}
            />
          )}

          {/* FOOTER */}

          <footer className="main-footer">
            <span>
              <span className="footer-mark">
                ◈
              </span>{' '}
              Built for safer streets.
            </span>

            <span>
              CityLens Urban Intelligence

              <span className="footer-separator">
                ·
              </span>

              {demo
                ? 'Demo workspace'
                : 'Connected city workspace'}
            </span>
          </footer>
        </main>
      </div>

      {/* EVENT DETAILS */}

      {selected && (
        <EventDetails
          key={selected.id}
          event={selected}
          demo={demo}
          session={session}
          onClose={() =>
            setSelected(null)
          }
          onSignIn={openLogin}
          onAuthError={authError}
          onChange={data.refresh}
          revision={data.updatedAt}
        />
      )}

      {/* LOGIN */}

      {loginOpen && (
        <LoginDialog
          onClose={() =>
            setLoginOpen(false)
          }
          onLogin={(value) => {
            setSession(value);
            setLoginOpen(false);

            setNotice(
              'Signed in. Staff actions are now available for your account.'
            );
          }}
        />
      )}
    </div>
  );
}