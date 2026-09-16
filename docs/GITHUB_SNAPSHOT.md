# Laptop snapshot on GitHub

The repository snapshot includes the laptop's current source layout, enhanced
frontend, FastAPI backend, migrations, tests, launch scripts, AI code, supplied
helmet checkpoint, Traffic AI models, sample road video, saved training runs,
and video/JSON outputs. Binary models, videos, images, arrays, and archives use
Git LFS. Install Git LFS before cloning, or run `git lfs pull` after cloning.

The earlier model/dataset files in the old folder layout remain accessible in
Git history at commit `200e431`. This snapshot uses the folders currently on the
laptop rather than restoring those old folders into the active project.

Local-only files are intentionally excluded:

- `.env` credentials and other local environment overrides.
- Installed `node_modules` and Python `.venv` environments.
- Build output, caches, and PostgreSQL/Docker runtime volumes.
- About 2.2 GB of downloaded Traffic AI training datasets and archives. The
  dataset preparation scripts and source URLs are included; `project.cmd train`
  prepares the required training data when needed.

To recreate the development setup, install Node.js, Python 3.12, Docker Desktop,
and Git LFS. Run `npm install` in `frontend`, then run `project.cmd setup` and
`project.cmd start` from the project root. Setup creates new local credentials;
staff accounts and any operational database records must be created in the new
database. The frontend's demo preview does not require seeded database events.

The sample footage and available models are included, but this does not change
the integration limits documented in the project README: Traffic AI exports
remain local, and the road-hazard module still needs its missing weights/inputs.
