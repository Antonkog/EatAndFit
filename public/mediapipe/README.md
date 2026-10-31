# Self-hosted MediaPipe assets

- Runtime: `@mediapipe/tasks-vision` 1.2.0, copied from the package's `wasm/` directory without modification.
- Pose model: Pose Landmarker Lite, float16, version 1, downloaded from `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`.
- Purpose: keep live exercise tracking local and avoid a runtime dependency on a third-party CDN.

MediaPipe is distributed under the Apache License 2.0. Model and runtime attribution is also presented in the application's Legal, data sources & safety disclosure.
