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
  search across all records, event details, and CSV export of visible rows.
- **Traffic AI:** saved analysis summaries, frame classifications, vehicle counts,
  and annotated recording playback from `traffic-ai/outputs/`.
- **Staff workspace:** staff sign-in, searchable fleet, vehicle registration, and
  observation submission. Open an incident to load evidence, assign a department,
  or save a permitted status transition. The backend
  enforces account roles; tokens remain in memory and are cleared on reload,
  expiry, sign-out, or an authentication failure.
- **System status:** API/database connectivity, live channel status, and the
  integration limits of the local AI modules.

Live mode always starts with backend records. An empty database shows an empty
feed. **Explore demo** opens 12 clearly labeled sample records without writing
anything to the database; staff mutations are disabled in demo mode. Returning
to live mode clears sample events and re-fetches the backend.

Overview totals and the type breakdown cover the entire backend inventory.
Search and filters run on the backend before pagination. The map, recent feed,
and CSV export use the current page (up to 50 events).
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

Traffic recordings are saved analyses, not a live traffic feed. Helmet detections,
road-hazard inference, and routing still need their respective model/backend work.
Their current state is described in System status. The Docker API includes FFmpeg
and mounts saved traffic outputs read-only. A directly launched API needs FFmpeg
on PATH for recording playback; `TRAFFIC_OUTPUTS_DIR` can override the library path.

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
It also verifies saved recording playback. To exercise real staff writes without
changing operational data, start `backend/scripts/browser_fixture.py` with
`--credentials-file` pointing into the OS temp directory, then run
`node scripts/preview-check.cjs` after building the frontend. Set `CITYLENS_URL`
to `http://localhost:3001` and `CITYLENS_TEST_LOGIN_FILE` to that temporary file
before running the browser check. The fixture uses API port 8017 and removes its
own disposable database and credentials when stopped with Ctrl+C.

The `legacy-codyssey/` and `legacy-root-flat/` directories retain earlier frontend copies for reference; they are not part of the active app.
