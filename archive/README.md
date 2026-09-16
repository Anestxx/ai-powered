# Archived prototypes

`database-prototype/` is the original standalone PostgreSQL/PostGIS prototype,
moved intact from `database/`. It has a different schema and database from the
active [backend](../backend/README.md). Its earlier duplicate helmet checkpoint
is retained with it.

Use `project.cmd start` at the project root for the active application. The
archived Compose stack publishes the same default ports and is excluded from
normal startup and test discovery. Moving these source files did not alter any
Docker volumes or database records.

`waterlogging-export/` preserves the original `water logging.v3i.yolov8/` export,
including dataset attribution and annotations. The active copy of its labels is
in `road-hazard-ai/datasets/waterlogging/`. Matching images were not included in
the merged checkout.
