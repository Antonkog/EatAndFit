# Exercise Recognition Architecture

## Status and purpose

This document is the source of truth for camera-guided exercise sessions in Eat & Fit. It defines which models perform each task, the user experience, privacy boundaries, data contracts, supported exercises, rollout sequence, and acceptance criteria.

The first release uses a hybrid architecture:

- MediaPipe Pose Landmarker performs live, on-device body-landmark detection and deterministic repetition counting.
- Meta SAM 3.1 optionally supplies post-set person segmentation and tracking evidence.
- Meta Muse Spark 1.3 optionally converts measured movement evidence into concise coaching.
- Meta models never determine the authoritative repetition count, change completed workout history, or invent numerical scores.
- Camera tracking and the timer fallback remain useful without an API key. Meta analysis is an optional BYOK enhancement.

This separation keeps the live workout responsive and reliable while giving Meta models a visible, useful role that matches their documented capabilities.

## Why the architecture is hybrid

SAM 3.1 detects, segments, and tracks an object through image or video frames. It returns boxes, masks, and stable track identities, but it does not return skeletal joints. It therefore cannot, by itself, reliably measure elbow or knee angles or count repetitions.

Muse Spark 1.3 can interpret video and reason over structured measurements, but a generative model is not an appropriate source of frame-accurate repetition counts. It should explain evidence produced by a deterministic motion engine rather than create the evidence.

MediaPipe Pose Landmarker provides the low-latency body landmarks required for live joint-angle calculations. Running it in the browser avoids a cloud call for every frame and allows the workout to continue when Meta is unavailable.

The selected model roles are therefore:

| Responsibility | Model or component | Authority |
| --- | --- | --- |
| Live skeleton and framing | MediaPipe Pose Landmarker | Local and deterministic |
| Rep state and count | Eat & Fit movement engine | Authoritative |
| ROM, cadence, symmetry, and confidence | Eat & Fit movement engine | Authoritative |
| Person mask and cross-frame tracking | Meta SAM 3.1 | Supporting visual evidence |
| Human-readable coaching | Meta Muse Spark 1.3 | Advisory only |
| Workout completion and calories | Existing Eat & Fit workout logic | Authoritative |

## Model responsibilities

### MediaPipe Pose Landmarker

MediaPipe runs locally in a dedicated web worker at approximately 10–12 analyzed frames per second. The implementation should try GPU acceleration first and fall back to CPU when required.

It produces:

- the live 33-landmark body skeleton;
- joint angles and landmark visibility;
- body framing and camera-position guidance;
- repetition start, peak, and completion events;
- range of motion, cadence, symmetry, and tracking confidence;
- immediate, measurable form cues.

The package version, WASM runtime, and pose model must be pinned and served from Eat & Fit. The live experience must not depend on a third-party CDN.

### Meta SAM 3.1

SAM is used only after a set and only after separate user consent. It must not be presented as the joint-tracking or repetition-counting model.

The preferred request uses the first stable athlete bounding box calculated locally as a box prompt. When no reliable box is available, the fallback concept prompt is `person`. If more than one person is detected, analysis stops and asks the user to record again without bystanders.

SAM output is used for:

- a stable athlete track through the selected rep;
- tracking coverage and visibility evidence;
- compact segmentation masks for a short replay;
- detecting when the selected athlete leaves or is substantially occluded in the frame.

The streamed response should be decoded with the official `@meta-sam/parser`. The result screen should visibly label the replay `Tracked with SAM 3.1`.

### Meta Muse Spark 1.3

Muse receives:

- the selected repetition clip;
- the exercise name and catalog instructions;
- relevant form cues and common mistakes from the catalog;
- deterministic ROM, cadence, symmetry, visibility, and confidence measurements;
- the specific reason that the repetition was selected for review.

Muse returns strict structured data containing:

- one positive observation;
- one primary correction;
- one next-set goal;
- the input measurement that supports the correction;
- a short educational disclaimer when appropriate.

Muse must not invent or alter repetition counts, calories, timestamps, joint measurements, completion state, or numerical scores. A correction that does not reference supplied evidence is rejected. The result should be labelled `Coached by Muse Spark 1.3`.

### Assessment contract

Eat & Fit—not Muse—chooses one authoritative assessment before any cloud request:

```ts
type FormAssessment =
  | { status: 'good_form'; evidence: MovementEvidence[] }
  | { status: 'correction_needed'; issue: SupportedFormIssue; evidence: MovementEvidence[] }
  | { status: 'insufficient_evidence'; reason: TrackingFailure; evidence: MovementEvidence[] };
```

Muse must return the identical status. For `good_form`, a positive observation is required and `primaryCorrection` is null. For `correction_needed`, exactly one correction and its supplied evidence metric are required. For `insufficient_evidence`, both positive judgment and correction are null. The server rejects any contradiction.

### Meta SAM 3D Body

SAM 3D Body is a future experiment, not part of the first release. It reconstructs human pose and body shape from a single image and is available as an open-weight research model rather than the low-latency hosted workflow required here.

Adopting it would require separate GPU hosting, latency and cost measurements, video-frame orchestration, and validation against the eight supported exercises. It should be considered only if it demonstrates a measurable improvement over the local landmark engine.

### Models that should not be added to the critical path

Do not add additional models merely to increase the number of Meta technologies in the demo. Browser speech synthesis can announce repetitions without microphone access or another cloud service. Voice transcription, image generation, and general-purpose open-weight models do not improve the first workout loop enough to justify their latency and complexity.

## Product experience

### Entry point

Calendar shows `Start exercise` only for an incomplete exercise scheduled for the current day. Historical and future workouts remain view-only until moved to today through the existing training editor.

Starting an exercise resumes the first incomplete set. Completed sets remain visible but are not repeated unless the user explicitly reopens them.

### Camera consent

For a camera-supported exercise, show:

**Enable camera?**

> Eat & Fit uses your camera to count repetitions and evaluate movement. Live analysis runs on this device. Video is not uploaded unless you later choose to analyze a rep with Meta.

Actions:

- `Enable camera`
- `Use timer instead`

Camera permission is requested only after `Enable camera` is pressed. General application terms do not count as camera or Meta-upload consent.

### Camera setup

Before counting begins:

1. Show whether the exercise requires a front or side view.
2. Display the exercise demonstration and a simple placement silhouette.
3. Confirm that the required body landmarks are visible.
4. Require stable tracking for one second.
5. Run a three-second countdown.

If framing is poor, show one instruction at a time, such as `Move farther from the camera` or `Turn your left side toward the camera`. Do not start while essential landmarks are missing.

### Active set

The full-screen session displays:

- a mirrored camera preview;
- a high-contrast skeleton overlay;
- current and target repetitions;
- a large progress ring;
- one stable form or framing cue;
- `Undo last rep` and `Add rep` correction controls;
- camera and tracking status.

When a repetition completes, display `Rep 1 complete.`, `Rep 2 complete.`, and so on. A short vibration and optional local speech announcement improve hands-free use. Speech is generated locally and can be muted.

Counting pauses when confidence becomes insufficient. The current count remains visible and no repetition is inferred while the body is not reliably tracked.

The application must never stop the user between individual repetitions. Stopping between repetitions would make normal strength-training cadence awkward and potentially distracting. Interaction occurs between sets instead.

### Set completion and rest

When the target is reached:

1. Mark the set complete locally.
2. Display `Set 1 complete.`
3. Start a skippable 60-second rest timer.
4. Offer `Start next set`.
5. If eligible, offer analysis of one selected repetition with Meta.

Meta processing runs asynchronously during rest and never blocks the next set. If the result arrives later, it becomes the single focus cue for the following set.

### Timer fallback

Timer mode is used when:

- camera permission is denied;
- camera APIs or a secure context are unavailable;
- pose initialization fails;
- the exercise does not yet have a validated movement profile;
- the user chooses not to use the camera.

The timer measures the complete set rather than each repetition. It uses the entered set duration when available and otherwise uses the existing local duration estimate.

At the end, ask `Did you complete set 1?` and offer:

- `Yes, mark complete`
- `Retry timer`
- `Exit`

The timer then continues through the same rest and next-set workflow as camera mode.

### Session lifecycle

When the session closes, the page hides, or the component unmounts:

- stop every camera track;
- stop recording;
- terminate the pose worker;
- release Screen Wake Lock;
- revoke object URLs;
- discard unsubmitted video buffers;
- save completed and partially counted repetitions.

Returning to the workout resumes from the saved partial count without restoring camera video.

## Meta analysis experience

### Analyze one useful repetition, not the whole set

The complete set is recorded locally in memory without audio. The deterministic engine records start and end timestamps for each repetition and ranks repetitions by measurable issues.

Selection order:

1. The repetition with the largest valid ROM, symmetry, cadence, or visibility issue.
2. When no meaningful issue exists, a representative median-confidence repetition.
3. Never select a repetition whose tracking confidence is too low to support a conclusion.

After the set, show a card such as:

**Analyze rep 3 with Meta**

> Rep 3 was selected because its knee range of motion differed most from the other repetitions.

The user can preview the locally stored window before consenting. This makes the analysis understandable and avoids sending more video than Meta needs.

### Separate upload consent

The analysis action must state:

> This set recording will temporarily pass through Eat & Fit so the selected repetition can be converted. Only the selected 4–12 second muted clip will be sent to Meta. Temporary Eat & Fit and Meta files are deleted after analysis. This uses your Meta API key and may incur provider charges.

`Analyze with Meta` is an explicit action for each set. It is never preselected or triggered automatically.

### Processing flow

1. The browser keeps the full set only in memory.
2. The user previews and approves the selected repetition.
3. The browser uploads the temporary full-set recording and selected timestamps to Eat & Fit.
4. The server trims the approved window, removes audio, and converts it to H.264 MP4 at no more than 720p and 12 FPS.
5. Only the 4–12 second result is uploaded to Meta.
6. SAM tracks the athlete and produces masks.
7. Muse receives the same selected clip plus deterministic evidence.
8. The server deletes its temporary files and the Meta file in a `finally` path.
9. The browser displays the short SAM overlay and Muse coaching.
10. The browser discards its original set recording and mask data.

This approach is faster, cheaper, and more focused than analyzing every frame of every set. At SAM's published price of $0.20 per 1,000 video frames, a 6–12 second clip sampled at 12 FPS contains approximately 72–144 frames before Meta's documented minimum-frame billing behavior. Current pricing and promotional-credit terms must be verified before release.

### Results

Show the immediate deterministic result first:

- completed repetitions;
- actual set duration;
- average cadence;
- ROM and symmetry indicators;
- tracking confidence;
- locally detected cues.

When Meta finishes, add:

- a short replay with the SAM mask or track overlay;
- one positive observation;
- either positive confirmation or one evidence-grounded correction, according to the application-selected assessment;
- one goal for the next set;
- model labels and an AI disclaimer.

Do not replace the local result. If Meta fails, keep the completed set and show a non-blocking retry option while the in-memory recording is still available.

## Initially supported exercises

The first camera-aware release supports eight catalog exercises. Three bodyweight profiles are included specifically so the complete camera flow can be tested at home without gym equipment.

| Exercise | Catalog ID | Required view | Primary measurement |
| --- | --- | --- | --- |
| Barbell Back Squat | `freeexercise:1435` | Side | Knee-angle cycle |
| Dumbbell Deadlift | `freeexercise:0300` | Side | Hip-angle cycle |
| Barbell Bench Press | `freeexercise:0025` | Side | Elbow extension cycle |
| Pull-Up / Chin-Up | `freeexercise:drv-chin-ups-pull-ups` | Front | Elbow-angle cycle |
| Military Press | `freeexercise:0553` | Front | Elbow-extension cycle |
| Squat | `freeexercise:drv-squat` | Side | Knee-angle cycle |
| Push-Up | `freeexercise:drv-push-ups` | Side | Elbow-angle cycle |
| Jumping Jack | `freeexercise:new-low-impact-jumping-jack` | Front | Wrist position and foot-separation ratio |

`High Knees` is not included because the current Eat & Fit catalog has no matching exercise. It can be considered only after a real catalog entry, instructions, media, and source attribution are added.

Each profile is versioned and contains required landmarks, camera orientation, confidence threshold, start/peak/return states, timing limits, and measurable cues.

Initial implemented heuristic thresholds use a broader peak threshold to recognize a completed movement and a stricter threshold to classify good form. This lets a shallow repetition be counted while still producing one correction:

- Squat and Barbell Back Squat: ready knee angle at least 150 degrees, count at 125 degrees or lower, and classify good form at 110 degrees or lower.
- Deadlift: ready hip angle at least 150 degrees, count at 125 degrees or lower, and classify good form at 110 degrees or lower.
- Bench press and Push-Up: ready elbow angle at least 145 degrees, count at 115 degrees or lower, and classify good form at 100 degrees or lower.
- Pull-up: ready elbow angle at least 145 degrees, count at 110 degrees or lower, and classify good form at 90 degrees or lower.
- Military press: start elbow angle at most 115 degrees, count at 145 degrees or higher, and classify good form at 155 degrees or higher.
- Jumping jack: start with wrists below the shoulders and feet within 1.25 shoulder widths, count when wrists are above the shoulders and feet reach at least 1.55 shoulder widths, and classify good form at 1.8 shoulder widths or wider.

A transition requires:

- five consecutive valid frames;
- required-landmark visibility of at least 0.6;
- a minimum repetition duration of 0.8 seconds;
- a maximum repetition duration of 8 seconds;
- 0.7 seconds of duplicate-count protection.

These values are product heuristics that require testing. They are not clinical standards and must not be described as injury-prevention or medical analysis.

## Public interfaces and persisted data

### Workout-set additions

Workout sets gain backward-compatible optional fields:

```ts
type TrackingMode = 'camera' | 'timer' | 'manual';

type MovementSummary = {
  profileId: string;
  profileVersion: number;
  mode: 'camera' | 'timer';
  completedReps: number;
  elapsedSeconds: number;
  reps: RepMeasurement[];
  selectedRep?: number;
  metaAnalysis?: StoredMetaMovementAnalysis; // coaching and aggregate tracking metrics only; no boxes or masks
};
```

`WorkoutSet` adds optional `completedReps`, `actualDurationSeconds`, `trackingMode`, and `movementSummary` fields. The existing IndexedDB and backup schema remain compatible because the additions are optional.

When all sets complete, the existing workout-completion path freezes burned calories for Balance. Reopening a set clears the reopened set's tracking result and the workout's frozen completion value until all sets are complete again.

No video, landmark timeline, SAM mask, or API key is persisted.

### Meta analysis endpoint

Add a BYOK-only endpoint:

```text
POST /api/ai/movement/analyze
Authorization: Bearer <user Meta key>
Content-Type: multipart/form-data
```

Request fields:

- `video`: temporary full-set recording, maximum 90 seconds and 30 MiB;
- `exerciseId`;
- `setNumber`;
- `selectedRep`;
- `repStartMs` and `repEndMs`;
- deterministic ROM, cadence, symmetry, visibility, confidence, and cue metrics;
- adult-confirmation metadata without weight, height, sex, or exact age.

The server validates the key, adult confirmation, size, timestamps, exercise ID, and measurements. It converts files only in container tmpfs and uses random filenames.

Response shape:

```ts
type MetaMovementAnalysisResponse = {
  sam: {
    model: 'sam-3.1';
    coverage: number;
    confidence: number | null;
    sourceWidth: number;
    sourceHeight: number;
    boxes: SamTrackBox[];
  };
  coaching: MetaCoaching;
  museModel: 'muse-spark-1.3';
  processedAt: string;
};
```

The response never contains a generated repetition count or numerical movement score. There is no automatic fallback to Gemini.

## Privacy, availability, and safety

- Local camera tracking and timer mode work in Core and BYOK editions.
- Meta analysis is available only to users aged 19 or older with a verified Meta key.
- A saved Meta key can be used for movement analysis even when Gemini is selected for ingredient or recipe features.
- Camera consent and Meta-upload consent are separate decisions.
- Meta upload is off by default and requested for every selected repetition.
- Audio is never recorded or uploaded.
- Video, raw landmarks, masks, and API keys are excluded from IndexedDB, backups, analytics, logs, and service-worker caches.
- Only concise derived measurements and accepted coaching text are persisted.
- Clips containing minors, multiple people, or unconsenting bystanders are not uploaded.
- The product must not identify people, infer health conditions, diagnose injuries, or make biometric identity claims.
- The interface explains that Meta feedback can be incorrect and is not medical advice.
- While promotional credits are used, the applicable notice about content being used for product improvement is displayed before consent.

## Alternatives and tradeoffs

### Fully local analysis

Advantages:

- strongest privacy;
- lowest latency;
- no inference cost;
- works without connectivity or an API key.

Disadvantages:

- no visible Meta perception result;
- coaching is limited to deterministic cues;
- weaker demonstration of Meta model integration.

Fully local analysis remains the default and fallback experience.

### Optional Meta post-set analysis — selected

Advantages:

- visible SAM tracking evidence;
- focused, natural-language Muse coaching;
- cloud latency never interrupts live counting;
- explicit consent and a short selected clip limit exposure and cost;
- provides a clear hackathon story: local measurement, Meta perception, Meta coaching.

Disadvantages:

- video leaves the device after consent;
- the application server temporarily handles the full set for conversion;
- requires a verified Meta key, connectivity, extra dependencies, and careful cleanup;
- introduces inference latency and provider charges;
- SAM still cannot replace the pose engine.

### Real-time Meta streaming

This option is rejected. Sending every camera frame to the cloud would increase cost, latency, battery use, failure risk, and privacy exposure without providing the skeletal landmarks needed for deterministic counting.

### Browser-side FFmpeg conversion

This option is rejected for the first release. FFmpeg WASM would substantially increase bundle size and memory use on mobile devices. Temporary server conversion is more predictable across iPhone and Android browser recording formats.

## Execution plan

### Phase 1 — Technical spike

- Create the development branch from the current stable main branch.
- Use a staged recording from a consenting adult.
- Complete one real SAM 3.1 video request and parse its streamed track and masks.
- Complete one Muse Spark 1.3 video request with strict structured output.
- Verify Files API upload and deletion.
- Measure conversion time, SAM latency, Muse latency, response size, and approximate cost.
- Confirm model availability for the actual hackathon key, including contributor and standard Muse variants.
- Stop cloud integration and retain local-only mode if deletion or structured parsing cannot be proven.

### Phase 2 — Session foundation

- Add the Calendar `Start exercise` action.
- Build the full-screen session, camera-consent dialog, camera setup, timer fallback, rest timer, and next-set flow.
- Add Screen Wake Lock, local speech, haptics, visibility cleanup, and resumable partial progress.
- Extend workout-set persistence with optional tracking fields and preserve backup compatibility.

### Phase 3 — Local movement engine

- Add the lazy MediaPipe worker and self-hosted model assets.
- Implement the eight versioned movement profiles, beginning with the three bodyweight profiles for home testing.
- Add confidence gating, state transitions, duplicate protection, form cues, and manual count correction.
- Store repetition timestamps and rank repetitions for optional review.
- Validate performance on representative mobile hardware before enabling recording.

### Phase 4 — Meta evidence path

- Record camera-supported sets locally in memory without audio.
- Build the selected-rep explanation and preview.
- Add separate, per-set Meta consent.
- Add multipart upload, tmpfs conversion, selected-window trimming, SAM streaming, and Muse schema validation.
- Render compact mask evidence and attach one Muse goal to the next set.
- Guarantee server and Meta-file deletion on success, timeout, cancellation, and parse failure.

### Phase 5 — Privacy and documentation

- Add the Legal/Data Sources disclosures for MediaPipe, SAM, Muse, temporary processing, provider charges, promotional credits, and educational limitations.
- Update `ProductSpecifications.md` with the released behavior.
- Keep this document current whenever a movement profile, model, consent rule, endpoint, or persisted field changes.

### Phase 6 — Validation and polish

- Test different body sizes, clothing, lighting, camera distances, device orientations, pauses, partial reps, occlusion, and left/right positioning.
- Reject multiple-person scenes and verify that no bystander clip reaches Meta.
- Tune thresholds only from recorded validation evidence, not from generative-model suggestions.
- Verify that Meta failure never loses locally completed repetitions or blocks the next set.
- Rehearse the hackathon demo with both a successful Meta result and an intentional provider failure.

## Test plan

### Movement engine

- Synthetic landmark sequences for each supported exercise.
- Valid repetitions, incomplete ROM, jitter, duplicate frames, pauses, low visibility, asymmetry, invalid tempo, and incorrect camera orientation.
- Manual `Add rep` and `Undo last rep` behavior.
- State restoration after closing during an incomplete set.

### Browser and PWA behavior

- Camera approval and denial.
- No-camera and insecure-context fallback.
- GPU initialization and CPU fallback.
- Camera, worker, recorder, wake-lock, and object-URL cleanup on close, navigation, page hide, and unmount.
- iPhone, Android, and desktop HTTPS/PWA testing.
- Mobile safe-area and fixed-navigation compatibility.

### Persistence and workout integration

- Partial and completed repetition persistence.
- Timer completion.
- Reopening a set.
- Workout calorie freezing only after every set completes.
- Backup/import compatibility with and without optional tracking fields.
- Confirmation that raw video and landmarks are absent from persisted storage.

### Meta endpoint

- Correct and incorrect API keys.
- Adult eligibility.
- MIME type, size, duration, and timestamp validation.
- WebM, MOV, and MP4 conversion.
- Audio removal and selected-window trimming.
- SAM stream parsing, zero matches, multiple people, incomplete streams, and timeouts.
- Muse schema validation, unsupported model errors, content blocking, rate limits, and timeouts.
- Temporary server-file and Meta-file deletion on every exit path.
- Confirmation that keys and media never appear in application logs.

### Edition behavior

- Core edition retains local camera and timer functionality.
- BYOK edition exposes Meta analysis only with a verified Meta key.
- Active Gemini selection does not hide a separately verified Meta movement key.
- There is no provider fallback from Meta movement analysis to Gemini.

## Acceptance criteria

- The eight supported exercises reach at least 95% repetition-count accuracy on controlled validation clips.
- Live feedback appears within approximately 150 ms of analyzed frames on supported test devices.
- No duplicate repetition is recorded during pauses or threshold jitter.
- Camera denial and unsupported exercises complete successfully through timer mode.
- A completed set is saved before any Meta request begins.
- Meta processing never blocks rest or the next set.
- A real SAM mask or track is visible for the selected repetition.
- Every Muse correction references a supplied deterministic measurement.
- No raw video, landmark timeline, mask, or API key persists after the session.
- Temporary local and Meta files are deleted after success and failure.
- The feature remains fully usable in local-only mode when Meta is unavailable.

## Sources

- [Meta SAM 3.1 overview](https://dev.meta.ai/docs/sam/overview)
- [Meta SAM prompting and video tracking](https://dev.meta.ai/docs/sam/segmenting)
- [Meta SAM 3.1 model and pricing](https://dev.meta.ai/models/sam-3-1)
- [Meta Muse video understanding](https://dev.meta.ai/docs/video-understanding)
- [Meta Muse Spark 1.3](https://dev.meta.ai/models/muse-spark)
- [Meta SAM 3D](https://ai.meta.com/sam3d)
- [MediaPipe Pose Landmarker](https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision/PoseLandmarker)
