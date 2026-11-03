# Exercise Recognition Architecture

## Status and purpose

This document is the source of truth for camera-guided exercise sessions in Eat & Fit. It defines which models perform each task, the user experience, privacy boundaries, data contracts, supported exercises, rollout sequence, and acceptance criteria.

Implementation status as of November 2, 2026: the local MediaPipe session, eight movement profiles, timer fallback, provider-neutral full-set recording, direct-browser SAM/Muse review, generic AI recording for catalog exercises without a validated profile, and explicit count reconciliation are implemented on `main`. Meta is the enabled movement-review provider; the Gemini adapter is intentionally disabled pending a configured movement model and implementation.

The first release uses a hybrid architecture:

- MediaPipe Pose Landmarker performs live, on-device body-landmark detection and deterministic repetition counting.
- Meta SAM 3.1 optionally supplies post-set person segmentation and tracking evidence.
- Meta Muse Spark 1.3 optionally converts measured movement evidence into concise coaching.
- Meta Muse may propose a second full-set repetition count, but it never changes completed workout history until the user explicitly accepts it and never invents deterministic movement measurements or numerical scores.
- Camera tracking and the timer fallback remain useful without an API key. Meta analysis is an optional BYOK enhancement. Generic recordings use no skeleton or MediaPipe-derived measurements.

This separation keeps the live workout responsive and reliable while giving Meta models a visible, useful role that matches their documented capabilities.

## Why the architecture is hybrid

SAM 3.1 detects, segments, and tracks an object through image or video frames. It returns boxes, masks, and stable track identities, but it does not return skeletal joints. It therefore cannot, by itself, reliably measure elbow or knee angles or count repetitions.

Muse Spark 1.3 can interpret the complete set and provide an advisory second repetition count, but it is not the frame-accurate live counter. MediaPipe remains authoritative during exercise; any Muse difference is presented to the user for confirmation. Muse also explains evidence produced by the deterministic motion engine rather than creating joint measurements.

MediaPipe Pose Landmarker provides the low-latency body landmarks required for live joint-angle calculations. Running it in the browser avoids a cloud call for every frame and allows the workout to continue when Meta is unavailable.

The selected model roles are therefore:

| Responsibility | Model or component | Authority |
| --- | --- | --- |
| Live skeleton and framing | MediaPipe Pose Landmarker | Local and deterministic |
| Live rep state and count | Eat & Fit movement engine | Authoritative until an explicit user count choice |
| ROM, cadence, symmetry, and confidence | Eat & Fit movement engine | Authoritative |
| Person mask and cross-frame tracking | Meta SAM 3.1 | Supporting visual evidence |
| Full-set count review and human-readable coaching | Meta Muse Spark 1.3 | Advisory; user confirmation required |
| Workout completion and calories | Existing Eat & Fit workout logic | Authoritative |

## Model responsibilities

### MediaPipe Pose Landmarker

MediaPipe runs locally at approximately 10–12 analyzed frames per second. The normal path uses a dedicated web worker, tries GPU acceleration first, and falls back to CPU. A 12-second initialization timeout, repeated frame failures, or unavailable worker transport activate a main-thread compatibility mode using the same pinned model. Frame scheduling prefers `requestVideoFrameCallback`, falls back to animation frames, and uses a canvas when the browser cannot create an image bitmap directly from the video.

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

- a stable athlete track through the complete uploaded set;
- tracking coverage and visibility evidence;
- a compact sampled track replay;
- detecting when the athlete leaves or is substantially occluded in the frame.

The streamed response should be decoded with the official `@meta-sam/parser`. The result screen should visibly label the replay `Tracked with SAM 3.1`.

### Meta Muse Spark 1.3

Muse receives:

- the compact muted full-set video;
- MediaPipe's local count and measured repetition windows;
- the exercise name and catalog instructions;
- relevant form cues and common mistakes from the catalog;
- deterministic ROM, cadence, symmetry, visibility, and confidence measurements;
- the specific reason that the repetition was selected for review.

Muse returns strict structured data containing:

- an independently observed repetition count and low, medium, or high confidence;
- one positive observation;
- one primary correction;
- one next-set goal;
- the input measurement that supports the correction;
- a short educational disclaimer when appropriate.

Muse must not alter repetition counts silently, calories, timestamps, joint measurements, completion state, or numerical scores. Any count difference is advisory until the user chooses it. A correction that does not reference supplied evidence is rejected. The result is labelled `Reviewed by Muse Spark 1.3`.

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

Camera permission is requested only after a camera action is pressed. General application terms do not count as camera or Meta-upload consent.

### Generic AI recording

Exercises without a validated movement profile keep the timer-only path when no enabled AI service is available. For an eligible adult with the shared Meta service or an optional verified BYOK key, the entry panel instead reads **Record set with AI** and explains that the set is recorded without sound for optional athlete tracking, repetition review, and one advisory coaching observation. `Record with camera` uses the selfie camera by default and retains the rear-camera switch where a second camera exists; `Use timer instead` keeps the ordinary timer flow.

The recording begins after a visible and spoken three-second countdown, shows `Recording set for AI`, elapsed time, a `Stop recording` action, and a 1:30 maximum. It does not start MediaPipe or draw a skeleton. When stopped manually or at the limit, the planned repetitions provisionally complete the set. `Analyze with AI` is explicit and optional. The active Meta adapter sends the catalog exercise name, instructions, and common mistakes to SAM 3.1 and Muse Spark 1.3 but no fabricated local angles or metrics. Muse can return only an integer count, confidence, one concise observation, and at most one next-set tip. If it differs from planned repetitions, the user must choose the count to save.

### Camera setup

Before counting begins:

1. Show whether the exercise requires a front or side view.
2. Display the exercise demonstration and a simple placement silhouette.
3. Confirm that the required body landmarks are visible.
4. Require stable tracking for the profile's configured consecutive-frame gate.
5. Start a visible and locally spoken three-second countdown automatically as soon as the gate is satisfied.

If framing is poor, show one instruction at a time, such as `Move farther from the camera` or `Turn your left side toward the camera`. Do not start while essential landmarks are missing.

The setup defaults to the front-facing selfie camera at approximately 1280 × 720. Consent uses one `Enable camera` action. After permission is granted, the app displays the selfie/rear switch only in a handheld coarse-pointer context where track capabilities or labeled inputs confirm multiple cameras; desktop virtual, external, and Continuity camera entries cannot enable the control. The initial front-camera request tries an exact facing mode and can use a preferred-facing fallback when necessary, while an explicit camera switch must satisfy the requested facing mode. It never requests wide-angle, zoom, or a particular rear lens. It uses one camera video and one matching canvas. The selfie camera mirrors both layers so the user's physical right side appears on the right side of the screen; the rear camera leaves both layers unmirrored. CSS permanently owns the cover-sized, full-screen video rectangle. JavaScript sizes only the canvas backing store and maps its landmarks through the same cover crop, device-pixel ratio, and camera transform. Canvas geometry is refreshed on metadata, playback, source resize, visual-viewport resize, orientation change, and recorder startup, so a transient iPhone source-dimension event cannot shrink the preview during countdown. Playback is attached once per camera stream; persisting a counted repetition must not reassign the stream or call `play()` again. The skeleton appears as soon as any single pose is returned. Readiness starts the countdown automatically rather than enabling a button. The default readiness rule requires both shoulders, wrists, hips, knees, and ankles to remain at least 60% visible for ten consecutive analyzed frames.

Bodyweight Squat uses one exercise-specific setup rule for a realistic side view. One shoulder must have at least 45% visibility while the same side's hip–knee–ankle landmarks average at least 60% confidence for five consecutive analyzed frames. Readiness and repetition counting use the same side-confidence calculation. Either side is accepted; wrists and the naturally occluded far-side limbs are not required. This exception does not change Barbell Back Squat, any other movement profile, movement thresholds, or form assessment.

The camera stage occupies `100dvh` on desktop, mobile, portrait, and landscape. The header remains over the top of the preview. Mobile portrait uses a 50%-opaque bottom panel for the required view, placement instruction, and tracking status until automatic countdown begins; wider viewports place the panel at the right. Once the set begins, the setup panel disappears and only the progress indicator and compact translucent timer remain over the video.

### Active set

The full-screen session displays:

- a selfie-oriented front preview or an unmirrored rear preview, always aligned with its skeleton;
- a high-contrast skeleton overlay;
- current and target repetitions;
- a large progress ring;
- a compact elapsed-time overlay.

When a repetition completes, display `Rep 1 complete.`, `Rep 2 complete.`, and so on. A short vibration and optional local speech announcement improve hands-free use. Speech is generated locally and can be muted.

Counting pauses when confidence becomes insufficient. The current count remains visible and no repetition is inferred while the body is not reliably tracked.

The application must never stop the user between individual repetitions. Stopping between repetitions would make normal strength-training cadence awkward and potentially distracting. Interaction occurs between sets instead.

A rep-based set ends only after its configured repetition target. A time-based set can continue counting repetitions but ends only when its configured duration expires. Missing rep and duration targets fall back to a 30-second timed set rather than a one-repetition set. Set completion starts a 60-second rest timer only when another incomplete set remains in the current exercise.

Count correction happens after the set rather than over the live camera. `Set complete` shows the saved count with add/remove controls. A correction updates the completed and visible Calendar repetition values, movement provenance, and frozen energy calculation, and becomes the baseline for a later Meta review.

### Set completion and rest

When the target is reached:

1. Mark the set complete locally.
2. Display `Set 1 complete.`
3. Start a skippable 60-second rest timer only when another incomplete set remains; otherwise show `Set complete` and `Finish exercise`.
4. Offer `Start next set`.
5. If eligible, offer explicit full-set analysis with Meta AI.

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

When the session closes or the component unmounts:

- stop every camera track;
- stop recording;
- terminate the pose worker;
- release Screen Wake Lock;
- revoke object URLs;
- discard unsubmitted video buffers;
- save completed and partially counted repetitions.

When the page hides, browsers may pause animation frames or suspend media. Eat & Fit therefore pauses pose processing and recording, saves the partial count and active duration, and excludes hidden time rather than promising background tracking. When the page becomes visible, a still-live stream resumes automatically and the set continues after tracking becomes stable. If the browser ended the stream, Eat & Fit requests camera access again. Failed automatic recovery displays both `Enable camera` and `Start timer`.

Worker/model initialization and frame-processing failures are surfaced as visible session status. GPU failure falls back to CPU, worker failure falls back to main-thread compatibility mode, and terminal failure never removes locally saved progress.

## Meta analysis experience

### Analyze the completed set explicitly

The complete set is recorded locally in memory without audio at a controlled bitrate. MediaPipe records its local repetition count, start/end windows, and deterministic evidence. The recording is never uploaded automatically.

After the set, eligible users see:

**Analyze with Meta AI**

The action reviews the complete uploaded segment so Muse can provide an advisory count even when MediaPipe missed a visible repetition. A locally selected questionable or representative repetition still supplies the authoritative form-assessment status and evidence used for coaching. When no locally valid repetition exists, Muse may review the count but must return insufficient evidence for technique.

### Separate upload consent

The analysis action must state:

> This muted set recording will temporarily pass through Eat & Fit and Meta. SAM 3.1 will track the athlete, and Muse Spark 1.3 will review the repetition count and coaching evidence. Temporary Eat & Fit and Meta files are deleted after analysis.

`Analyze with Meta AI` is an explicit action for each set. It is never preselected or triggered automatically.

### Processing flow

1. The browser keeps the full set only in memory and records at a controlled bitrate.
2. The browser refuses uploads larger than 30 MiB.
3. After explicit consent, it uploads the recording to Eat & Fit for format normalization.
4. The server removes audio and normalizes the recording in tmpfs to H.264 MP4 at no more than 720p and 12 FPS, returns the bytes, and deletes its temporary files.
5. In shared or hybrid mode without a personal override, the browser uploads the normalized clip through a restricted Eat & Fit route and the server authenticates to Meta with its mounted secret. A saved personal key uses direct browser transport instead.
6. SAM tracks the athlete across the complete set. Missing-person and multiple-person results stop the review.
7. Muse receives the full set plus the local count, measured windows, catalog guidance, and authoritative form assessment through the selected credential transport.
8. Muse returns an observed segment count, count confidence, and structured coaching.
9. The browser deletes the Meta file in a `finally` path, then displays the sampled SAM track, Muse review, and any count difference.
10. The browser discards its original set recording and SAM track data.

The browser reports the preparation, upload, SAM, Muse, and cleanup stages. Their limits are 60, 90, 180, 180, and 30 seconds respectively. Each stage uses an independent abort controller and diagnostic entry. Raw browser abort strings are replaced by retryable stage-specific errors. The finalized recording and local workout remain available after failure so the user can retry manually; no paid inference stage is automatically repeated. Closing the exercise explicitly cancels active work, but temporary Meta-file cleanup receives a separate best-effort request.

Full-set review costs more than selected-repetition review, so it runs only after the explicit button press. Current pricing and promotional-credit terms must be verified before release.

### Results

Show the immediate deterministic result first:

- completed repetitions;
- actual set duration;
- average cadence;
- ROM and symmetry indicators;
- tracking confidence;
- locally detected cues.

When Meta finishes, add:

- a full-set replay with sampled SAM track evidence;
- MediaPipe's count and Muse's suggested count with confidence;
- one positive observation;
- either positive confirmation or one evidence-grounded correction, according to the application-selected assessment;
- one goal for the next set;
- model labels and an AI disclaimer.

When the counts differ by any amount in either direction, show `Keep N` and `Use M`. The user must make the choice; Meta never changes the completed count silently. The accepted count replaces the set's visible Calendar repetition value as well as its completed repetition value. Persist the original local count, Muse observation, confidence, suggested set count, and decision, but never the recording or SAM boxes. Evidence identifiers remain internal validation data and are not rendered as raw labels in the coaching card.

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
  metaAnalysis?: StoredMetaMovementAnalysis; // coaching, count review, decision, and aggregate tracking metrics only; no boxes or masks
};
```

`WorkoutSet` adds optional `completedReps`, `actualDurationSeconds`, `trackingMode`, and `movementSummary` fields. The existing IndexedDB and backup schema remain compatible because the additions are optional.

When all sets complete, the existing workout-completion path freezes burned calories for Balance. Reopening a set clears the reopened set's tracking result and the workout's frozen completion value until all sets are complete again.

No video, landmark timeline, SAM mask, or API key is persisted.

### Movement preparation endpoint and direct Meta requests

Add a BYOK-only endpoint:

```text
POST /api/ai/movement/prepare
Content-Type: multipart/form-data
```

The request contains only the temporary full-set recording, limited to 90 seconds and 30 MiB. The server converts it only in container tmpfs with a random filename and returns muted H.264 MP4. In shared or hybrid mode without a personal override, the server also forwards only the bounded Meta file and response operations required for SAM and Muse; its mounted credential is never returned to the browser.

The browser uses the normalized response with the Meta Files and Responses APIs through either the restricted shared-server transport or optional BYOK direct transport. Local count, rep windows, deterministic evidence, exercise guidance, and adult eligibility are submitted only after consent.

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
  countReview: {
    localRepCount: number;
    observedRepCount: number;
    suggestedSetRepCount: number;
    confidence: 'low' | 'medium' | 'high';
  };
  coaching: MetaCoaching;
  museModel: 'muse-spark-1.3';
  processedAt: string;
};
```

The Muse count is advisory and can become the saved set count only after explicit user confirmation. The response never contains a generated movement score. There is no automatic fallback to Gemini.

## Privacy, availability, and safety

- Local camera tracking and timer mode work in Core and BYOK editions.
- Meta analysis is available only to users aged 19 or older when the configured Meta service is available.
- Hybrid mode selects shared Meta automatically while allowing a device-encrypted personal key to take precedence. The shared key has no browser delivery or decryption path.
- Camera consent and Meta-upload consent are separate decisions.
- Meta upload is off by default and requested for every analyzed set.
- Audio is never recorded or uploaded.
- Video, raw landmarks, masks, and API keys are excluded from IndexedDB, backups, analytics, logs, and service-worker caches.
- Only concise derived measurements, count provenance, the user's count choice, and accepted coaching text are persisted.
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
- explicit per-set consent and compact controlled-bitrate recording limit exposure;
- provides a clear hackathon story: local measurement, Meta perception, Meta coaching.

Disadvantages:

- video leaves the device after consent;
- the application server temporarily handles the full set only for conversion;
- requires an available Meta credential transport, connectivity, extra dependencies, and careful cleanup;
- introduces inference latency and provider charges;
- SAM still cannot replace the pose engine.

### Real-time Meta streaming

This option is rejected. Sending every camera frame to the cloud would increase cost, latency, battery use, failure risk, and privacy exposure without providing the skeletal landmarks needed for deterministic counting.

### Browser-side FFmpeg conversion

This option is rejected for the first release. FFmpeg WASM would substantially increase bundle size and memory use on mobile devices. Temporary server conversion is more predictable across iPhone and Android browser recording formats.

## Implementation status and remaining work

Phases 2–5 below describe the implemented architecture. Phase 1 remains a repeatable provider-compatibility check whenever Meta changes model access or API behavior. Phase 6 remains active validation and tuning work rather than a claim that the accuracy targets have already been met.

### Phase 1 — Technical spike

- Create the development branch from the current stable main branch.
- Use a staged recording from a consenting adult.
- Complete one real SAM 3.1 video request and parse its streamed track and masks.
- Complete one Muse Spark 1.3 video request with strict structured output.
- Verify Files API upload and deletion.
- Measure conversion time, SAM latency, Muse latency, response size, and approximate cost.
- Confirm model availability for the actual hackathon key, including contributor and standard Muse variants.
- Stop cloud integration and retain local-only mode if deletion or structured parsing cannot be proven.

### Phase 2 — Session foundation (implemented)

- Add the Calendar `Start exercise` action.
- Build the full-screen session, camera-consent dialog, camera setup, timer fallback, rest timer, and next-set flow.
- Add Screen Wake Lock, local speech, haptics, visibility cleanup, and resumable partial progress.
- Extend workout-set persistence with optional tracking fields and preserve backup compatibility.

### Phase 3 — Local movement engine (implemented)

- Add the lazy MediaPipe worker and self-hosted model assets.
- Implement the eight versioned movement profiles, beginning with the three bodyweight profiles for home testing.
- Add confidence gating, state transitions, duplicate protection, form cues, and manual count correction.
- Store repetition timestamps and rank a representative repetition for optional coaching evidence.
- Validate performance on representative mobile hardware before enabling recording.

### Phase 4 — Meta evidence path (implemented)

- Record camera-supported sets locally in memory without audio.
- Add the explicit `Analyze with Meta AI` full-set review action.
- Add separate, per-set Meta consent.
- Add multipart normalization, 30 MiB client/server limits, full-set tmpfs conversion, browser-direct Meta Files/Responses requests, SAM streaming, and Muse count/coaching schema validation.
- Render compact sampled track evidence, reconcile count differences through user choice, and attach one Muse goal to the next set.
- Guarantee server temporary-file deletion and browser-side Meta-file deletion on success, timeout, cancellation, and parse failure.

### Phase 5 — Privacy and documentation (implemented)

- Add the Legal/Data Sources disclosures for MediaPipe, SAM, Muse, temporary processing, provider charges, promotional credits, and educational limitations.
- Update `ProductSpecifications.md` with the released behavior.
- Keep this document current whenever a movement profile, model, consent rule, endpoint, or persisted field changes.

### Phase 6 — Validation and polish (ongoing)

- Test different body sizes, clothing, lighting, camera distances, device orientations, pauses, partial reps, occlusion, and left/right positioning.
- Reject multiple-person scenes and verify that no bystander clip reaches Meta.
- Tune thresholds only from recorded validation evidence, not from generative-model suggestions.
- Verify that Meta failure never loses locally completed repetitions or blocks the next set.
- Rehearse the hackathon demo with both a successful Meta result and an intentional provider failure.

## Test plan

### Movement engine

- Synthetic landmark sequences for each supported exercise.
- Valid repetitions, incomplete ROM, jitter, duplicate frames, pauses, low visibility, asymmetry, invalid tempo, and incorrect camera orientation.
- Post-set add/remove repetition behavior and Calendar persistence.
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
- Audio removal and full-set normalization to 720p and 12 FPS.
- SAM stream parsing, zero matches, multiple people, incomplete streams, and timeouts.
- Muse schema validation, unsupported model errors, content blocking, rate limits, and timeouts.
- Temporary server-file and Meta-file deletion on every exit path.
- Confirmation that keys and media never appear in application logs.

### Edition behavior

- Core edition retains local camera and timer functionality.
- Hybrid mode exposes Meta analysis without revealing the shared credential and lets a verified personal Meta key override it; BYOK mode requires a verified personal key.
- No credential mode performs automatic provider fallback.
- There is no provider fallback from Meta movement analysis to Gemini.

## Acceptance criteria

- The eight supported exercises reach at least 95% repetition-count accuracy on controlled validation clips.
- Live feedback appears within approximately 150 ms of analyzed frames on supported test devices.
- No duplicate repetition is recorded during pauses or threshold jitter.
- Camera denial and unsupported exercises complete successfully through timer mode.
- A completed set is saved before any Meta request begins.
- Meta processing never blocks rest or the next set.
- A real sampled SAM track is visible for the analyzed set.
- Every Muse count difference requires an explicit `Keep` or `Use` choice.
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
