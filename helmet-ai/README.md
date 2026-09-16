# Helmet model

The supplied `models/helmet_detector.pt` was previously stored under
`ai/traffic/models/`. Its class metadata lists `with helmet`, `without helmet`,
`rider` and `number plate`. Its training dataset and field accuracy have not been
verified in this project.

From the project root:

```powershell
.\project.cmd helmet-check
```

This loads the checkpoint and prints its classes. It uses the existing Traffic AI
Python environment, which provides Ultralytics, instead of maintaining a second
copy of PyTorch. A successful load is not an accuracy evaluation. This module is
not connected to backend violation reporting or automatic enforcement.
