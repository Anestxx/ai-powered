import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { PAGE_SIZE } from '../lib/events';

/*
  Backend API prefix.

  This works when your frontend proxy is already configured
  to forward /api requests to your backend.
*/
const API_BASE = '/api/v1';

/* =========================================================
   REQUEST HELPERS
   ========================================================= */

async function requestJson(url, signal) {
  const response = await fetch(url, {
    method: 'GET',

    headers: {
      Accept: 'application/json',
    },

    signal,
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body?.detail ||
      body?.message ||
      body?.error?.message ||
      `Backend request failed (${response.status})`;

    const error = new Error(message);

    error.status = response.status;

    throw error;
  }

  return body;
}

function getErrorMessage(error) {
  if (!error) {
    return 'Unable to connect to backend.';
  }

  if (error.name === 'AbortError') {
    return '';
  }

  if (error instanceof TypeError) {
    return 'Unable to reach the CityLens backend. Make sure the backend server is running.';
  }

  return (
    error.message ||
    'Unable to load backend data.'
  );
}

/* =========================================================
   NUMBER HELPERS
   ========================================================= */

function toNumber(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return undefined;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : undefined;
}

function firstNumber(object, keys) {
  for (const key of keys) {
    const value = toNumber(
      object?.[key]
    );

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

/* =========================================================
   NORMALIZE EVENT RESPONSE
   ========================================================= */

function normalizeEvents(response) {
  /*
    Backend may directly return an array.
  */
  if (Array.isArray(response)) {
    return {
      items: response,
      total: response.length,
      page: 1,
      page_size: response.length,
    };
  }

  const source =
    response?.data &&
    !Array.isArray(response.data)
      ? response.data
      : response;

  let items = [];

  if (Array.isArray(source?.items)) {
    items = source.items;
  } else if (
    Array.isArray(source?.events)
  ) {
    items = source.events;
  } else if (
    Array.isArray(source?.results)
  ) {
    items = source.results;
  } else if (
    Array.isArray(response?.data)
  ) {
    items = response.data;
  }

  const total =
    firstNumber(source, [
      'total',
      'count',
      'total_count',
      'total_events',
      'total_incidents',
    ]) ?? items.length;

  const page =
    firstNumber(source, [
      'page',
      'current_page',
    ]) ?? 1;

  const pageSize =
    firstNumber(source, [
      'page_size',
      'pageSize',
      'limit',
    ]) ?? items.length;

  return {
    items,
    total,
    page,
    page_size: pageSize,
  };
}

/* =========================================================
   NORMALIZE SUMMARY RESPONSE
   ========================================================= */

function normalizeSummary(response) {
  const source =
    response?.summary ??
    response?.data ??
    response;

  if (
    !source ||
    typeof source !== 'object'
  ) {
    return null;
  }

  const statuses =
    source.by_status ||
    source.status_counts ||
    source.statuses ||
    {};

  const byType =
    source.by_type ||
    source.byType ||
    source.incidents_by_type ||
    source.event_types ||
    {};

  let total =
    firstNumber(source, [
      'total',
      'total_incidents',
      'total_events',
      'incident_count',
      'count',
    ]);

  const detected =
    firstNumber(source, [
      'detected',
      'awaiting_review',
      'pending_review',
    ]) ??
    firstNumber(statuses, [
      'detected',
      'awaiting_review',
      'pending_review',
    ]);

  const underRepair =
    firstNumber(source, [
      'under_repair',
      'underRepair',
      'repairing',
      'in_repair',
    ]) ??
    firstNumber(statuses, [
      'under_repair',
      'repairing',
      'in_repair',
    ]);

  const resolved =
    firstNumber(source, [
      'resolved',
      'resolved_incidents',
      'closed',
    ]) ??
    firstNumber(statuses, [
      'resolved',
      'closed',
    ]);

  /*
    If backend didn't provide total,
    calculate it from by_type.
  */
  if (
    total === undefined &&
    byType &&
    typeof byType === 'object'
  ) {
    const numbers =
      Object.values(byType)
        .map(toNumber)
        .filter(
          (value) =>
            value !== undefined
        );

    if (numbers.length) {
      total = numbers.reduce(
        (sum, number) =>
          sum + number,
        0
      );
    }
  }

  const hasData =
    total !== undefined ||
    detected !== undefined ||
    underRepair !== undefined ||
    resolved !== undefined ||
    Object.keys(byType).length > 0;

  if (!hasData) {
    return null;
  }

  return {
    total,
    detected,
    under_repair: underRepair,
    resolved,
    by_type: byType,
  };
}

/* =========================================================
   BUILD EVENT URL
   ========================================================= */

function buildEventsUrl({
  filters,
  nearby,
  page,
  q,
}) {
  const isNearby = Boolean(nearby);

  const endpoint = isNearby
    ? `${API_BASE}/events/nearby`
    : `${API_BASE}/events`;

  const params =
    new URLSearchParams();

  /*
    Normal pagination.
  */
  if (!isNearby) {
    params.set(
      'page',
      String(page || 1)
    );

    params.set(
      'page_size',
      String(PAGE_SIZE)
    );
  }

  /*
    Search.
  */
  if (q?.trim()) {
    params.set(
      'q',
      q.trim()
    );
  }

  /*
    Filters.
  */
  if (
    filters &&
    typeof filters === 'object'
  ) {
    Object.entries(filters).forEach(
      ([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          value !== '' &&
          value !== 'all'
        ) {
          params.set(
            key,
            String(value)
          );
        }
      }
    );
  }

  /*
    Nearby coordinates.
  */
  if (isNearby) {
    const latitude =
      nearby.latitude ??
      nearby.lat;

    const longitude =
      nearby.longitude ??
      nearby.lng ??
      nearby.lon;

    const radius =
      nearby.radius ??
      nearby.radius_meters ??
      nearby.radiusMeters;

    if (
      latitude !== undefined
    ) {
      params.set(
        'latitude',
        String(latitude)
      );
    }

    if (
      longitude !== undefined
    ) {
      params.set(
        'longitude',
        String(longitude)
      );
    }

    if (
      radius !== undefined
    ) {
      params.set(
        'radius',
        String(radius)
      );
    }
  }

  const query =
    params.toString();

  return query
    ? `${endpoint}?${query}`
    : endpoint;
}

/* =========================================================
   LOAD HEALTH
   ========================================================= */

async function loadHealth(signal) {
  const response =
    await requestJson(
      `${API_BASE}/health`,
      signal
    );

  const status =
    String(
      response?.status || ''
    ).toLowerCase();

  const database =
    String(
      response?.database || ''
    ).toLowerCase();

  const connected =
    status === 'ok' ||
    status === 'healthy' ||
    status === 'online' ||
    database === 'connected';

  return {
    state:
      connected
        ? 'online'
        : 'offline',

    message:
      connected
        ? 'Backend connected'
        : response?.message ||
          'Backend connection needs attention',

    database:
      response?.database,

    raw: response,
  };
}

/* =========================================================
   LOAD EVENTS
   ========================================================= */

async function loadEvents(
  options,
  signal
) {
  const url =
    buildEventsUrl(options);

  const response =
    await requestJson(
      url,
      signal
    );

  return normalizeEvents(
    response
  );
}

/* =========================================================
   LOAD DASHBOARD SUMMARY
   ========================================================= */

async function loadSummary(signal) {
  const response =
    await requestJson(
      `${API_BASE}/dashboard/summary`,
      signal
    );

  const summary =
    normalizeSummary(response);

  if (!summary) {
    throw new Error(
      'Backend returned an invalid dashboard summary.'
    );
  }

  return summary;
}

/* =========================================================
   FALLBACK SUMMARY USING REAL BACKEND EVENTS

   If /dashboard/summary fails, this loads the
   incidents from your backend and calculates
   the numbers from REAL records.
   ========================================================= */

async function buildSummaryFromBackend(
  signal
) {
  const allEvents = new Map();

  let currentPage = 1;
  let backendTotal = null;

  const MAX_PAGES = 200;

  while (
    currentPage <= MAX_PAGES
  ) {
    const params =
      new URLSearchParams();

    params.set(
      'page',
      String(currentPage)
    );

    params.set(
      'page_size',
      String(PAGE_SIZE)
    );

    const response =
      await requestJson(
        `${API_BASE}/events?${params.toString()}`,
        signal
      );

    const data =
      normalizeEvents(response);

    if (
      backendTotal === null
    ) {
      backendTotal =
        Number(data.total);
    }

    const oldSize =
      allEvents.size;

    data.items.forEach(
      (event, index) => {
        const key =
          event?.id ??
          event?.event_id ??
          `${currentPage}-${index}`;

        allEvents.set(
          String(key),
          event
        );
      }
    );

    /*
      No events returned.
    */
    if (
      data.items.length === 0
    ) {
      break;
    }

    /*
      Loaded everything.
    */
    if (
      Number.isFinite(
        backendTotal
      ) &&
      allEvents.size >=
        backendTotal
    ) {
      break;
    }

    /*
      Backend keeps returning same page.
    */
    if (
      allEvents.size ===
      oldSize
    ) {
      break;
    }

    currentPage += 1;
  }

  const events =
    Array.from(
      allEvents.values()
    );

  const byType = {};

  let detected = 0;
  let underRepair = 0;
  let resolved = 0;

  events.forEach((event) => {
    const status =
      String(
        event?.status || ''
      )
        .trim()
        .toLowerCase()
        .replace(
          /[\s-]+/g,
          '_'
        );

    if (
      status === 'detected'
    ) {
      detected += 1;
    }

    if (
      status ===
      'under_repair'
    ) {
      underRepair += 1;
    }

    if (
      status === 'resolved'
    ) {
      resolved += 1;
    }

    const type =
      event?.event_type;

    if (type) {
      byType[type] =
        (byType[type] || 0) +
        1;
    }
  });

  return {
    total:
      Number.isFinite(
        backendTotal
      )
        ? backendTotal
        : events.length,

    detected,

    under_repair:
      underRepair,

    resolved,

    by_type: byType,
  };
}

/* =========================================================
   DEMO DATA
   ========================================================= */

const DEMO_EVENTS =
  Array.from(
    { length: 12 },
    (_, index) => {
      const types = [
        'pothole',
        'waterlogging',
        'pothole',
        'pothole',
      ];

      const statuses = [
        'detected',
        'detected',
        'under_repair',
        'resolved',
      ];

      return {
        id:
          `demo-${index + 1}`,

        event_type:
          types[
            index %
              types.length
          ],

        status:
          statuses[
            index %
              statuses.length
          ],

        severity:
          index % 3 === 0
            ? 'high'
            : 'medium',

        confidence: 0.85,

        observation_count: 1,

        latitude:
          12.9716 +
          index * 0.001,

        longitude:
          77.5946 +
          index * 0.001,

        first_seen:
          new Date().toISOString(),

        last_seen:
          new Date().toISOString(),

        resolved_at: null,

        assigned_department:
          null,
      };
    }
  );

function createSummary(events) {
  const byType = {};

  let detected = 0;
  let underRepair = 0;
  let resolved = 0;

  events.forEach((event) => {
    if (
      event.status ===
      'detected'
    ) {
      detected += 1;
    }

    if (
      event.status ===
      'under_repair'
    ) {
      underRepair += 1;
    }

    if (
      event.status ===
      'resolved'
    ) {
      resolved += 1;
    }

    if (event.event_type) {
      byType[event.event_type] =
        (byType[
          event.event_type
        ] || 0) + 1;
    }
  });

  return {
    total: events.length,
    detected,
    under_repair:
      underRepair,
    resolved,
    by_type: byType,
  };
}

/* =========================================================
   CITY DATA HOOK
   ========================================================= */

export default function useCityData({
  demo = false,
  filters = {},
  nearby = null,
  page = 1,
  q = '',
}) {
  const [
    items,
    setItems,
  ] = useState([]);

  const [
    total,
    setTotal,
  ] = useState(0);

  const [
    summary,
    setSummary,
  ] = useState(null);

  const [
    summaryError,
    setSummaryError,
  ] = useState('');

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState('');

  const [
    health,
    setHealth,
  ] = useState({
    state: 'checking',
    message:
      'Checking backend connection…',
  });

  const [
    updatedAt,
    setUpdatedAt,
  ] = useState(null);

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);

  /*
    Manual refresh from App.js.
  */
  const refresh =
    useCallback(() => {
      setRefreshKey(
        (value) =>
          value + 1
      );
    }, []);

  /* =======================================================
     LOAD DATA
     ======================================================= */

  useEffect(() => {
    /*
      Demo mode.
    */
    if (demo) {
      let filtered =
        [...DEMO_EVENTS];

      if (
        filters?.event_type
      ) {
        filtered =
          filtered.filter(
            (event) =>
              event.event_type ===
              filters.event_type
          );
      }

      if (
        filters?.status
      ) {
        filtered =
          filtered.filter(
            (event) =>
              event.status ===
              filters.status
          );
      }

      if (
        filters?.severity
      ) {
        filtered =
          filtered.filter(
            (event) =>
              event.severity ===
              filters.severity
          );
      }

      if (q?.trim()) {
        const text =
          q
            .trim()
            .toLowerCase();

        filtered =
          filtered.filter(
            (event) =>
              [
                event.id,
                event.event_type,
                event.status,
                event.assigned_department,
              ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(text)
          );
      }

      const start =
        (page - 1) *
        PAGE_SIZE;

      setItems(
        filtered.slice(
          start,
          start + PAGE_SIZE
        )
      );

      setTotal(
        filtered.length
      );

      setSummary(
        createSummary(
          DEMO_EVENTS
        )
      );

      setSummaryError('');

      setError('');

      setHealth({
        state: 'demo',
        message:
          'Demo data active',
      });

      setLoading(false);

      setUpdatedAt(
        new Date()
      );

      return undefined;
    }

    /*
      Live backend mode.
    */

    const controller =
      new AbortController();

    const { signal } =
      controller;

    let mounted = true;

    async function run() {
      setLoading(true);

      setError('');

      setSummaryError('');

      const results =
        await Promise.allSettled([
          loadHealth(signal),

          loadEvents(
            {
              filters,
              nearby,
              page,
              q,
            },
            signal
          ),

          loadSummary(signal),
        ]);

      if (!mounted) {
        return;
      }

      const [
        healthResult,
        eventResult,
        summaryResult,
      ] = results;

      /* HEALTH */

      if (
        healthResult.status ===
        'fulfilled'
      ) {
        setHealth(
          healthResult.value
        );
      } else {
        setHealth({
          state: 'offline',

          message:
            getErrorMessage(
              healthResult.reason
            ),
        });
      }

      /* EVENTS */

      if (
        eventResult.status ===
        'fulfilled'
      ) {
        setItems(
          eventResult.value.items
        );

        setTotal(
          eventResult.value.total
        );
      } else {
        setItems([]);
        setTotal(0);

        setError(
          getErrorMessage(
            eventResult.reason
          )
        );
      }

      /* SUMMARY */

      if (
        summaryResult.status ===
        'fulfilled'
      ) {
        setSummary(
          summaryResult.value
        );

        setSummaryError('');
      } else if (
        eventResult.status ===
        'fulfilled'
      ) {
        /*
          /dashboard/summary failed.

          Build the counts from actual backend events.
        */
        try {
          const realSummary =
            await buildSummaryFromBackend(
              signal
            );

          if (!mounted) {
            return;
          }

          setSummary(
            realSummary
          );

          setSummaryError('');
        } catch (
          fallbackError
        ) {
          if (!mounted) {
            return;
          }

          setSummary(null);

          setSummaryError(
            getErrorMessage(
              fallbackError
            )
          );
        }
      } else {
        setSummary(null);

        setSummaryError(
          getErrorMessage(
            summaryResult.reason
          )
        );
      }

      if (
        eventResult.status ===
          'fulfilled' ||
        summaryResult.status ===
          'fulfilled'
      ) {
        setUpdatedAt(
          new Date()
        );
      }

      setLoading(false);
    }

    run().catch(
      (loadError) => {
        if (
          !mounted ||
          loadError.name ===
            'AbortError'
        ) {
          return;
        }

        setError(
          getErrorMessage(
            loadError
          )
        );

        setLoading(false);
      }
    );

    return () => {
      mounted = false;

      controller.abort();
    };
  }, [
    demo,
    filters,
    nearby,
    page,
    q,
    refreshKey,
  ]);

  /*
    Refresh backend every 30 seconds.
  */
  useEffect(() => {
    if (demo) {
      return undefined;
    }

    const timer =
      window.setInterval(
        refresh,
        30000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    demo,
    refresh,
  ]);

  let stream =
    'polling';

  if (demo) {
    stream = 'demo';
  } else if (loading) {
    stream =
      'connecting';
  } else if (error) {
    stream = 'offline';
  } else {
    stream = 'live';
  }

  return {
    items,
    total,
    summary,
    summaryError,
    loading,
    error,
    health,
    stream,
    updatedAt,
    refresh,
  };
}