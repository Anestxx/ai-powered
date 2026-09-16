# Codyssey frontend

CityLens is the active React frontend for Codyssey Urban Intelligence.

```bash
npm install
npm start
```

From the project root, `project.cmd start` starts the frontend, FastAPI service,
and database together. Open http://localhost:3000.

## Screens

- **Overview:** backend totals, event map, recent incidents, event breakdown, and
  integration readiness.
- **Live map:** recorded event locations and active-incident searches by latitude,
  longitude, and radius. Location access is requested only when you choose
  **My location**. The layer button includes resolved and rejected records.
- **Incidents:** backend type/status/severity filters, ordering, pagination,
  search within the current page, event details, and CSV export of visible rows.
- **Staff workspace:** existing staff sign-in and vehicle registration. Open an
  incident to load evidence or save a permitted status transition. The backend
  enforces account roles; tokens remain in memory and are cleared on reload,
  expiry, sign-out, or an authentication failure.
- **System status:** API/database connectivity, live channel status, and the
  integration limits of the local AI modules.

Live mode always starts with backend records. An empty database shows an empty
feed. **Explore demo** opens 12 clearly labeled sample records without writing
anything to the database; staff mutations are disabled in demo mode. Returning
to live mode clears sample events and re-fetches the backend.

Overview totals cover the entire backend inventory. The map, type breakdown,
recent feed, search, and CSV export use the current page (up to 50 events).
Browse additional pages in the incident register. Nearby searches include active
incidents only and sort them by distance.

## Connections

Development proxies `/api` and `/ws/events` to `http://localhost:8000` using
`src/setupProxy.js`. Restart the development server after editing this file.
The live channel refreshes REST data after new events and after reconnection;
30-second polling continues as a fallback. Requests time out after 12 seconds,
and interrupted refreshes leave the last successful data visible with a notice.

For a separately hosted API, set these build-time environment variables:

```text
REACT_APP_API_URL=https://your-api-host/api/v1
REACT_APP_WS_URL=wss://your-api-host/ws/events
```

Otherwise, production hosting must reverse-proxy `/api` and `/ws/events` to the
backend and support WebSocket upgrades. Add the frontend origin to the backend's
allowed origins. OpenStreetMap tiles require an internet connection; saved
incident data remains available if map tiles cannot load.

Traffic exports, helmet detections, and road-hazard inference are not yet live
dashboard feeds. Routing and fleet listing do not have backend endpoints yet.
Their current state is described in System status instead of simulated as live.

## Verification

```bash
npm test -- --watchAll=false --runInBand
npm run build
```

Integration tests cover backend filtering/pagination, demo isolation, staff
login/status/evidence/vehicle actions, nearby queries, request timeouts, and
WebSocket reconnects. They use mocked API responses and do not modify your database.

`node scripts/browser-check.cjs` also checks the running frontend against the
real public API and its WebSocket proxy, then exercises demo mode and mobile
layouts. It requires an isolated Chrome instance running with
`--remote-debugging-port=9222`, and saves review screenshots in the OS temp folder.

The `legacy-codyssey/` and `legacy-root-flat/` directories retain earlier frontend copies for reference; they are not part of the active app.
