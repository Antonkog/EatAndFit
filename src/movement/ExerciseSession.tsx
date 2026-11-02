import { Camera, Check, ChevronRight, Minus, Plus, RotateCcw, Timer, Volume2, VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BYOK_AI_ENABLED } from '../config/appConfig';
import type { Workout } from '../data/db';
import { runLoggedAiOperation } from '../diagnostics/clientLog';
import type { Exercise } from '../exercises/types';
import { useBackNavigation } from '../navigation/backNavigation';
import { readUserProfile } from '../profile/userProfile';
import { getRecognitionKeyStatus, type RecognitionProvider } from '../settings/secureKeys';
import { MovementTracker, selectRepresentativeRep } from './engine';
import { applyAcceptedMovementCount } from './countReconciliation';
import { createMovementReviewProvider, MOVEMENT_ANALYSIS_STAGE_LABELS, type MovementAnalysisStage } from './metaAnalysis';
import { CompatibilityPoseRuntime, type PoseDetection } from './poseCompatibility';
import { drawPose } from './poseCanvas';
import { evaluatePoseReadiness, nextReadinessFrameCount } from './readiness';
import { cameraSetIsComplete, cameraSetProgress, resolveCameraSetTarget } from './setTarget';
import type { FormAssessment, MetaMovementAnalysis, MovementProfile, StoredMetaMovementAnalysis } from './types';

type Stage = 'initializing' | 'consent' | 'setup' | 'countdown' | 'active' | 'camera-paused' | 'timer-ready' | 'timer-active' | 'timer-confirm' | 'rest';
type ScheduledFrame = { kind: 'video' | 'animation'; id: number };
type CameraFacing = 'user' | 'environment';

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

function haptic(pattern: number | number[]) {
  navigator.vibrate?.(pattern);
}

function supportedMimeType() {
  return ['video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1.42E01E', 'video/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

const MOVEMENT_VIDEO_BITS_PER_SECOND = 1_200_000;

function storedMetaAnalysis(
  result: MetaMovementAnalysis,
  countDecision: StoredMetaMovementAnalysis['countDecision'],
  acceptedRepCount?: number,
): StoredMetaMovementAnalysis {
  return {
    provider: result.provider,
    samModel: result.sam.model,
    trackingCoverage: result.sam.coverage,
    trackingConfidence: result.sam.confidence,
    baselineKind: result.countReview.baselineKind,
    baselineRepCount: result.countReview.baselineRepCount,
    localRepCount: result.countReview.localRepCount,
    observedRepCount: result.countReview.observedRepCount,
    suggestedSetRepCount: result.countReview.suggestedSetRepCount,
    countConfidence: result.countReview.confidence,
    countDecision,
    ...(acceptedRepCount === undefined ? {} : { acceptedRepCount }),
    coaching: result.coaching,
    museModel: result.museModel,
    processedAt: result.processedAt,
  };
}

async function requestExerciseCamera(facing: CameraFacing) {
  const base = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 24, max: 30 },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...base, facingMode: { exact: facing } },
    });
  } catch (error) {
    if (error instanceof DOMException && !['OverconstrainedError', 'NotFoundError'].includes(error.name)) throw error;
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...base, facingMode: { ideal: facing } },
    });
  }
}

export function ExerciseSession({
  workout: initialWorkout,
  profile,
  exercise,
  initialSetIndex,
  onSave,
  onClose,
}: {
  workout: Workout;
  profile?: MovementProfile;
  exercise?: Exercise;
  initialSetIndex: number;
  onSave: (workout: Workout) => void;
  onClose: () => void;
}) {
  const [workout, setWorkout] = useState(initialWorkout);
  const [setIndex, setSetIndex] = useState(initialSetIndex);
  const [stage, setStage] = useState<Stage>('initializing');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [repCount, setRepCount] = useState(initialWorkout.sets[initialSetIndex]?.completedReps ?? 0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restSeconds, setRestSeconds] = useState(60);
  const [recording, setRecording] = useState<Blob>();
  const [analysis, setAnalysis] = useState<MetaMovementAnalysis>();
  const [analysisError, setAnalysisError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<MovementAnalysisStage>();
  const [countDecision, setCountDecision] = useState<StoredMetaMovementAnalysis['countDecision']>('pending');
  const [aiProvider, setAiProvider] = useState<RecognitionProvider>();
  const [providerCheckDone, setProviderCheckDone] = useState(false);
  const [genericRecording, setGenericRecording] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [voiceCuesEnabled, setVoiceCuesEnabled] = useState(true);
  const [poseStatus, setPoseStatus] = useState('Waiting for a stable full-body view…');
  const [cameraError, setCameraError] = useState('');
  const [trackingStable, setTrackingStable] = useState(false);
  const [cameraStreamVersion, setCameraStreamVersion] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('user');
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const workerRef = useRef<Worker | undefined>(undefined);
  const compatibilityRuntimeRef = useRef<CompatibilityPoseRuntime | undefined>(undefined);
  const trackingBackendRef = useRef<'worker' | 'compatibility' | undefined>(undefined);
  const trackingReadyRef = useRef(false);
  const trackerRef = useRef(profile ? new MovementTracker(profile) : undefined);
  const workoutRef = useRef(initialWorkout);
  const onSaveRef = useRef(onSave);
  const setIndexRef = useRef(initialSetIndex);
  const mountedRef = useRef(true);
  const previousRepRef = useRef<NonNullable<ReturnType<typeof selectRepresentativeRep>> | undefined>(undefined);
  const frameLoopRef = useRef<ScheduledFrame | undefined>(undefined);
  const workerInitTimerRef = useRef<number | undefined>(undefined);
  const workerResponseTimerRef = useRef<number | undefined>(undefined);
  const processingFrameRef = useRef(false);
  const frameFailureRef = useRef(0);
  const frameHandlerRef = useRef<(now: number) => void>(() => undefined);
  const lastFrameRef = useRef(0);
  const stablePoseFramesRef = useRef(0);
  const baseRepCountRef = useRef(initialWorkout.sets[initialSetIndex]?.completedReps ?? 0);
  const baseDurationSecondsRef = useRef(initialWorkout.sets[initialSetIndex]?.actualDurationSeconds ?? 0);
  const startedAtRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const analysisAbortRef = useRef<AbortController | undefined>(undefined);
  const recordingOffsetMsRef = useRef(0);
  const recordingBaseRepCountRef = useRef(initialWorkout.sets[initialSetIndex]?.completedReps ?? 0);
  const chunksRef = useRef<Blob[]>([]);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | undefined>(undefined);
  const stageRef = useRef(stage);
  const pausedByVisibilityRef = useRef(false);
  const startingSetRef = useRef(false);
  const voiceCuesRef = useRef(true);
  const currentSet = workout.sets[setIndex];
  const setTarget = useMemo(
    () => resolveCameraSetTarget(currentSet),
    [currentSet?.durationSeconds, currentSet?.reps],
  );
  const { targetReps, targetSeconds } = setTarget;

  useEffect(() => {
    const user = readUserProfile();
    if (!BYOK_AI_ENABLED || Number(user.age) < 19) {
      setProviderCheckDone(true);
      return;
    }
    void getRecognitionKeyStatus().then((status) => {
      const configured = status.activeProvider === 'META' ? status.metaConfigured : status.geminiConfigured;
      if (configured) setAiProvider(status.activeProvider);
    }).catch(() => undefined).finally(() => setProviderCheckDone(true));
  }, []);

  useEffect(() => { voiceCuesRef.current = voiceCuesEnabled; }, [voiceCuesEnabled]);

  const speak = useCallback((message: string) => {
    if (!voiceCuesRef.current || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.onerror = () => undefined;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const primeVoiceCues = useCallback((announcement = 'Sound cues enabled.') => {
    if (!voiceCuesRef.current || !('speechSynthesis' in window)) return;
    window.speechSynthesis.resume();
    speak(announcement);
  }, [speak]);

  useEffect(() => { workoutRef.current = workout; }, [workout]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { setIndexRef.current = setIndex; }, [setIndex]);

  const refreshCameraAvailability = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCanSwitchCamera(devices.filter((device) => device.kind === 'videoinput').length > 1);
    } catch {
      setCanSwitchCamera(false);
    }
  }, []);

  useEffect(() => {
    void refreshCameraAvailability();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshCameraAvailability);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshCameraAvailability);
  }, [refreshCameraAvailability]);

  const cancelFrameLoop = useCallback(() => {
    const scheduled = frameLoopRef.current;
    if (scheduled?.kind === 'video') (videoRef.current as FrameVideo | null)?.cancelVideoFrameCallback?.(scheduled.id);
    if (scheduled?.kind === 'animation') cancelAnimationFrame(scheduled.id);
    frameLoopRef.current = undefined;
    processingFrameRef.current = false;
    if (workerResponseTimerRef.current) window.clearTimeout(workerResponseTimerRef.current);
    workerResponseTimerRef.current = undefined;
  }, []);

  const stopTrackingBackend = useCallback(() => {
    cancelFrameLoop();
    if (workerInitTimerRef.current) window.clearTimeout(workerInitTimerRef.current);
    workerInitTimerRef.current = undefined;
    workerRef.current?.terminate();
    workerRef.current = undefined;
    compatibilityRuntimeRef.current?.close();
    compatibilityRuntimeRef.current = undefined;
    trackingBackendRef.current = undefined;
    trackingReadyRef.current = false;
  }, [cancelFrameLoop]);

  const stopCamera = useCallback(() => {
    stopTrackingBackend();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [stopTrackingBackend]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  }, []);

  const releaseSession = useCallback(() => {
    analysisAbortRef.current?.abort(new DOMException('The exercise session was closed.', 'AbortError'));
    analysisAbortRef.current = undefined;
    stopRecording();
    stopCamera();
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = undefined;
    window.speechSynthesis?.cancel();
  }, [stopCamera, stopRecording]);

  useBackNavigation(true, () => { releaseSession(); onClose(); }, 150);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; releaseSession(); };
  }, [releaseSession]);

  const persistCameraProgress = useCallback((count: number, seconds: number, reps = trackerRef.current?.reps ?? []) => {
    const current = workoutRef.current;
    const partial = {
      ...current,
      sets: current.sets.map((set, index) => index === setIndex ? {
        ...set,
        completedReps: count,
        actualDurationSeconds: Math.max(1, seconds),
        trackingMode: 'camera' as const,
        movementSummary: profile ? {
          profileId: profile.id,
          profileVersion: profile.version,
          mode: 'camera' as const,
          completedReps: count,
          elapsedSeconds: Math.max(1, seconds),
          reps,
          selectedRep: selectRepresentativeRep(reps)?.index,
        } : undefined,
      } : set),
    };
    workoutRef.current = partial;
    setWorkout(partial);
    onSaveRef.current(partial);
  }, [profile, setIndex]);

  const startMovementRecording = useCallback(() => {
    setRecording(undefined);
    chunksRef.current = [];
    recordingBaseRepCountRef.current = baseRepCountRef.current;
    recordingOffsetMsRef.current = 0;
    if (!streamRef.current || typeof MediaRecorder === 'undefined') return;
    const mimeType = supportedMimeType();
    const recorder = new MediaRecorder(streamRef.current, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: MOVEMENT_VIDEO_BITS_PER_SECOND,
    });
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => setRecording(new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' }));
    recorder.start(500);
    recorderRef.current = recorder;
  }, []);

  useEffect(() => {
    if (stage !== 'countdown') return;
    setCountdown(3);
    speak('Three');
    const interval = window.setInterval(() => setCountdown((value) => {
      if (value <= 1) {
        window.clearInterval(interval);
        startedAtRef.current = performance.now();
        startMovementRecording();
        speak('Go');
        setStage('active');
        return 0;
      }
      speak(String(value - 1));
      return value - 1;
    }), 1000);
    return () => window.clearInterval(interval);
  }, [speak, stage, startMovementRecording]);

  useEffect(() => {
    if (stage !== 'active' && stage !== 'timer-active') return;
    const interval = window.setInterval(() => setElapsedSeconds(Math.max(0, Math.round((performance.now() - startedAtRef.current) / 1000))), 250);
    return () => window.clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'timer-active' || elapsedSeconds < targetSeconds) return;
    setStage('timer-confirm');
    haptic([100, 80, 100]);
    speak(`Set ${setIndex + 1} timer complete.`);
  }, [elapsedSeconds, setIndex, speak, stage, targetSeconds]);

  useEffect(() => {
    if (stage !== 'rest') return;
    const interval = window.setInterval(() => setRestSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [stage]);

  const saveCompletedSet = useCallback((mode: 'camera' | 'timer', reps = targetReps) => {
    const summary = mode === 'camera'
      ? profile && trackerRef.current ? {
        source: 'profiled' as const,
        profileId: profile.id,
        profileVersion: profile.version,
        mode,
        completedReps: reps,
        elapsedSeconds: baseDurationSecondsRef.current + elapsedSeconds,
        reps: trackerRef.current.reps,
        selectedRep: selectRepresentativeRep(trackerRef.current.reps)?.index,
      } : genericRecording ? {
        source: 'generic-ai-recording' as const,
        mode,
        completedReps: reps,
        elapsedSeconds: baseDurationSecondsRef.current + elapsedSeconds,
        reps: [],
      } : undefined
      : undefined;
    const current = workoutRef.current;
    const next = {
      ...current,
      sets: current.sets.map((set, index) => index === setIndex ? {
        ...set,
        complete: true,
        completedReps: reps,
        actualDurationSeconds: Math.max(1, baseDurationSecondsRef.current + elapsedSeconds),
        trackingMode: mode,
        ...(summary ? { movementSummary: summary } : {}),
      } : set),
    };
    workoutRef.current = next;
    setWorkout(next);
    onSaveRef.current(next);
    const hasAnotherIncompleteSet = current.sets.some((set, index) => index !== setIndex && !set.complete);
    setRestSeconds(hasAnotherIncompleteSet ? 60 : 0);
    setStage('rest');
  }, [elapsedSeconds, genericRecording, profile, setIndex, targetReps]);

  useEffect(() => {
    if (!profile || stage !== 'active' || !cameraSetIsComplete(setTarget, repCount, elapsedSeconds)) return;
    stopRecording();
    stopCamera();
    haptic([120, 80, 180]);
    speak(`Set ${setIndex + 1} complete.`);
    saveCompletedSet('camera', repCount);
  }, [elapsedSeconds, profile, repCount, saveCompletedSet, setIndex, setTarget, speak, stage, stopCamera, stopRecording]);

  const stopRecordingAndRead = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return recording;
    return new Promise<Blob | undefined>((resolve) => {
      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        setRecording(blob);
        resolve(blob);
      }, { once: true });
      recorder.stop();
    });
  }, [recording]);

  const finishGenericRecording = useCallback(async () => {
    if (!genericRecording || stageRef.current !== 'active') return;
    await stopRecordingAndRead();
    stopCamera();
    haptic([120, 80, 180]);
    speak(`Set ${setIndex + 1} recording complete.`);
    saveCompletedSet('camera', targetReps);
  }, [genericRecording, saveCompletedSet, setIndex, speak, stopCamera, stopRecordingAndRead, targetReps]);

  useEffect(() => {
    if (!genericRecording || stage !== 'active' || elapsedSeconds < 90) return;
    void finishGenericRecording();
  }, [elapsedSeconds, finishGenericRecording, genericRecording, stage]);

  const syncMediaGeometry = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const stage = video?.parentElement;
    if (!video || !stage || !video.videoWidth || !video.videoHeight) return;
    const stageWidth = Math.max(1, stage.clientWidth);
    const stageHeight = Math.max(1, stage.clientHeight);
    const coverScale = Math.max(stageWidth / video.videoWidth, stageHeight / video.videoHeight);
    video.style.width = `${Math.ceil(video.videoWidth * coverScale)}px`;
    video.style.height = `${Math.ceil(video.videoHeight * coverScale)}px`;
    video.style.top = '50%';
    video.style.right = 'auto';
    video.style.bottom = 'auto';
    video.style.left = '50%';
    video.style.objectFit = 'fill';
    const density = Math.max(1, window.devicePixelRatio || 1);
    if (canvas) {
      const displayWidth = Math.max(1, Math.round(stageWidth * density));
      const displayHeight = Math.max(1, Math.round(stageHeight * density));
      if (canvas.width !== displayWidth) canvas.width = displayWidth;
      if (canvas.height !== displayHeight) canvas.height = displayHeight;
    }
    if (frameCanvasRef.current) {
      frameCanvasRef.current.width = video.videoWidth;
      frameCanvasRef.current.height = video.videoHeight;
    }
  }, []);

  const scheduleNextFrame = useCallback(() => {
    if (frameLoopRef.current || !trackingReadyRef.current || !(['setup', 'countdown', 'active'] as Stage[]).includes(stageRef.current)) return;
    const video = videoRef.current as FrameVideo | null;
    if (!video) return;
    if (video.requestVideoFrameCallback) {
      const id = video.requestVideoFrameCallback((now) => {
        frameLoopRef.current = undefined;
        frameHandlerRef.current(now);
      });
      frameLoopRef.current = { kind: 'video', id };
      return;
    }
    const id = requestAnimationFrame((now) => {
      frameLoopRef.current = undefined;
      frameHandlerRef.current(now);
    });
    frameLoopRef.current = { kind: 'animation', id };
  }, []);

  const handlePoseDetection = useCallback((detection: PoseDetection, timestampMs: number) => {
    if (workerResponseTimerRef.current) window.clearTimeout(workerResponseTimerRef.current);
    workerResponseTimerRef.current = undefined;
    processingFrameRef.current = false;
    frameFailureRef.current = 0;
    const poses = detection.poses;
    if (poses.length !== 1) {
      stablePoseFramesRef.current = 0;
      setTrackingStable(false);
      const context = canvasRef.current?.getContext('2d');
      if (context && canvasRef.current) context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      setPoseStatus(poses.length > 1 ? 'Only one person can be in frame.' : 'Move back until your full body is visible.');
      return;
    }
    const landmarks = poses[0];
    if (canvasRef.current && videoRef.current) {
      drawPose(canvasRef.current, landmarks, { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight, fit: 'cover' });
    }
    const readiness = evaluatePoseReadiness(profile?.id, landmarks);
    stablePoseFramesRef.current = nextReadinessFrameCount(stablePoseFramesRef.current, readiness.landmarksVisible);
    const stable = stablePoseFramesRef.current >= readiness.requiredConsecutiveFrames;
    setTrackingStable(stable);
    setPoseStatus(stable ? readiness.readyMessage : readiness.waitingMessage);
    if (stageRef.current !== 'active') return;
    const exerciseTimestampMs = timestampMs - startedAtRef.current;
    const rep = trackerRef.current?.process({ timestampMs: exerciseTimestampMs, landmarks });
    if (rep) {
      const count = baseRepCountRef.current + (trackerRef.current?.reps.length ?? 0);
      setRepCount(count);
      persistCameraProgress(count, baseDurationSecondsRef.current + Math.round(exerciseTimestampMs / 1000));
      haptic(70);
      speak(`Rep ${count} complete.`);
    }
  }, [persistCameraProgress, profile?.id]);

  const showCameraRecovery = useCallback((error: string) => {
    const currentStage = stageRef.current;
    if (currentStage === 'active') {
      const activeSeconds = Math.max(0, Math.round((performance.now() - startedAtRef.current) / 1000));
      const count = baseRepCountRef.current + (trackerRef.current?.reps.length ?? 0);
      const accumulatedSeconds = baseDurationSecondsRef.current + activeSeconds;
      setElapsedSeconds(activeSeconds);
      persistCameraProgress(count, accumulatedSeconds);
      baseRepCountRef.current = count;
      baseDurationSecondsRef.current = accumulatedSeconds;
    }
    stopRecording();
    cancelFrameLoop();
    setCameraError(error);
    setMessage(error);
    setTrackingStable(false);
    setStage('camera-paused');
  }, [cancelFrameLoop, persistCameraProgress, stopRecording]);

  const startCompatibilityTracking = useCallback(async (reason: string) => {
    if (trackingBackendRef.current === 'compatibility') return;
    if (workerInitTimerRef.current) window.clearTimeout(workerInitTimerRef.current);
    workerInitTimerRef.current = undefined;
    workerRef.current?.terminate();
    workerRef.current = undefined;
    trackingReadyRef.current = false;
    setPoseStatus(`${reason} Starting compatibility tracking…`);
    try {
      compatibilityRuntimeRef.current?.close();
      compatibilityRuntimeRef.current = await CompatibilityPoseRuntime.create();
      if (!mountedRef.current) {
        compatibilityRuntimeRef.current.close();
        compatibilityRuntimeRef.current = undefined;
        return;
      }
      trackingBackendRef.current = 'compatibility';
      trackingReadyRef.current = true;
      setCameraError('');
      setPoseStatus('Compatibility tracking ready. Keep your full body in frame.');
      scheduleNextFrame();
    } catch {
      showCameraRecovery('Pose tracking could not start on this device. Retry the camera or use the set timer.');
    }
  }, [scheduleNextFrame, showCameraRecovery]);

  const createWorkerBitmap = useCallback(async (video: HTMLVideoElement) => {
    try {
      return await createImageBitmap(video);
    } catch {
      const canvas = frameCanvasRef.current ?? document.createElement('canvas');
      frameCanvasRef.current = canvas;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const context = canvas.getContext('2d', { willReadFrequently: false });
      if (!context) throw new Error('Camera frame canvas is unavailable.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return createImageBitmap(canvas);
    }
  }, []);

  const processFrame = useCallback(async (now: number) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !trackingReadyRef.current) {
      scheduleNextFrame();
      return;
    }
    if (now - lastFrameRef.current < 82 || processingFrameRef.current) {
      scheduleNextFrame();
      return;
    }
    lastFrameRef.current = now;
    processingFrameRef.current = true;
    try {
      if (trackingBackendRef.current === 'compatibility' && compatibilityRuntimeRef.current) {
        handlePoseDetection(compatibilityRuntimeRef.current.detect(video, now), now);
      } else if (workerRef.current) {
        const bitmap = await createWorkerBitmap(video);
        workerRef.current.postMessage({ type: 'frame', frame: bitmap, timestampMs: now }, [bitmap]);
        workerResponseTimerRef.current = window.setTimeout(() => {
          processingFrameRef.current = false;
          void startCompatibilityTracking('The background tracker stopped responding.');
        }, 5000);
      } else {
        processingFrameRef.current = false;
      }
    } catch {
      processingFrameRef.current = false;
      frameFailureRef.current += 1;
      if (frameFailureRef.current >= 3) await startCompatibilityTracking('Camera frames could not reach the background tracker.');
    } finally {
      scheduleNextFrame();
    }
  }, [createWorkerBitmap, handlePoseDetection, scheduleNextFrame, startCompatibilityTracking]);
  frameHandlerRef.current = (now) => { void processFrame(now); };

  const startWorkerTracking = useCallback(() => {
    stopTrackingBackend();
    const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    trackingBackendRef.current = 'worker';
    workerInitTimerRef.current = window.setTimeout(() => {
      void startCompatibilityTracking('The background tracker took too long to load.');
    }, 12_000);
    worker.onmessage = (event) => {
      if (event.data.type === 'ready') {
        if (workerInitTimerRef.current) window.clearTimeout(workerInitTimerRef.current);
        workerInitTimerRef.current = undefined;
        trackingReadyRef.current = true;
        setCameraError('');
        setPoseStatus(`Tracking ready${event.data.delegate === 'CPU' ? ' in compatibility mode' : ''}. Keep your full body in frame.`);
        scheduleNextFrame();
        return;
      }
      if (event.data.type === 'error') {
        processingFrameRef.current = false;
        if (event.data.phase === 'init') void startCompatibilityTracking('The background tracker could not load.');
        else {
          frameFailureRef.current += 1;
          if (frameFailureRef.current >= 3) void startCompatibilityTracking('The background tracker could not process camera frames.');
        }
        return;
      }
      handlePoseDetection({ poses: event.data.poses, worldPoses: event.data.worldPoses }, event.data.timestampMs);
      scheduleNextFrame();
    };
    worker.postMessage({ type: 'init' });
  }, [handlePoseDetection, scheduleNextFrame, startCompatibilityTracking, stopTrackingBackend]);

  const startCamera = useCallback(async (requestedFacing: CameraFacing = cameraFacing, recordForAi = false) => {
    if (!profile && !recordForAi) { setStage('timer-ready'); return; }
    stopCamera();
    setGenericRecording(!profile && recordForAi);
    setPreviewReady(false);
    setCameraError('');
    setMessage('');
    setTrackingStable(false);
    setPoseStatus(profile ? 'Loading pose tracking…' : 'Preparing camera recording…');
    stablePoseFramesRef.current = 0;
    startingSetRef.current = false;
    try {
      const stream = await requestExerciseCamera(requestedFacing);
      setCameraFacing(requestedFacing);
      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
        if (!mountedRef.current || document.hidden || !(['setup', 'countdown', 'active'] as Stage[]).includes(stageRef.current)) return;
        showCameraRecovery('The camera stream ended. Enable the camera again or continue with the set timer.');
      }, { once: true }));
      setStage('setup');
      setCameraStreamVersion((version) => version + 1);
      if (profile) startWorkerTracking();
      void refreshCameraAvailability();
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      showCameraRecovery(denied
        ? 'Camera access is blocked. Allow camera access in your browser settings, then try again.'
        : 'Camera access was not available. Retry the camera or use the set timer.');
    }
  }, [cameraFacing, profile, refreshCameraAvailability, showCameraRecovery, startWorkerTracking, stopCamera]);

  const switchCamera = () => {
    const nextFacing: CameraFacing = cameraFacing === 'user' ? 'environment' : 'user';
    void startCamera(nextFacing, genericRecording);
  };

  useEffect(() => { stageRef.current = stage; }, [stage]);

  const startCameraSet = async () => {
    if (startingSetRef.current) return;
    startingSetRef.current = true;
    trackerRef.current = profile ? new MovementTracker(profile) : undefined;
    baseRepCountRef.current = workoutRef.current.sets[setIndex]?.completedReps ?? 0;
    baseDurationSecondsRef.current = workoutRef.current.sets[setIndex]?.actualDurationSeconds ?? 0;
    setRepCount(baseRepCountRef.current);
    setElapsedSeconds(0);
    setRecording(undefined);
    setAnalysis(undefined);
    setAnalysisError('');
    setAnalysisStage(undefined);
    setCountDecision('pending');
    if (profile) scheduleNextFrame();
    setStage('countdown');
    try {
      wakeLockRef.current = await (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen');
    } catch { /* exercise remains usable without wake lock */ }
  };

  const cameraPreviewVisible = (['setup', 'countdown', 'active'] as Stage[]).includes(stage);

  useEffect(() => {
    if (!cameraPreviewVisible || !streamRef.current || !videoRef.current) return;
    const stream = streamRef.current;
    const video = videoRef.current;
    let disposed = false;
    const sync = () => syncMediaGeometry();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(sync);
    video.addEventListener('loadedmetadata', sync);
    video.addEventListener('playing', sync);
    video.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);
    if (video.parentElement) resizeObserver?.observe(video.parentElement);
    const attachPreview = async () => {
      if (video.srcObject !== stream) video.srcObject = stream;
      try {
        if (video.paused) await video.play();
        if (disposed) return;
        sync();
        setPreviewReady(true);
        if (profile) scheduleNextFrame();
      } catch {
        const streamIsLive = stream.getVideoTracks().some((track) => track.readyState === 'live');
        if (disposed || video.srcObject !== stream || !streamIsLive) return;
        showCameraRecovery('The camera preview could not start. Retry the camera or use the set timer.');
      }
    };
    void attachPreview();
    return () => {
      disposed = true;
      video.removeEventListener('loadedmetadata', sync);
      video.removeEventListener('playing', sync);
      video.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      resizeObserver?.disconnect();
    };
  }, [cameraPreviewVisible, cameraStreamVersion, profile, scheduleNextFrame, showCameraRecovery, syncMediaGeometry]);

  useEffect(() => {
    if (stage !== 'setup') return;
    if (profile ? trackingStable : genericRecording && previewReady) void startCameraSet();
  }, [genericRecording, previewReady, profile, stage, trackingStable]);

  useEffect(() => {
    const visibilityChanged = () => {
      if (document.hidden) {
        const currentStage = stageRef.current;
        if (!(['setup', 'countdown', 'active'] as Stage[]).includes(currentStage)) return;
        pausedByVisibilityRef.current = true;
        if (currentStage === 'active') {
          const activeSeconds = Math.max(0, Math.round((performance.now() - startedAtRef.current) / 1000));
          const count = baseRepCountRef.current + (trackerRef.current?.reps.length ?? 0);
          const accumulatedSeconds = baseDurationSecondsRef.current + activeSeconds;
          setElapsedSeconds(activeSeconds);
          persistCameraProgress(count, accumulatedSeconds);
          baseRepCountRef.current = count;
          baseDurationSecondsRef.current = accumulatedSeconds;
        }
        stopRecording();
        cancelFrameLoop();
        videoRef.current?.pause();
        setMessage('Camera tracking paused because Eat & Fit is no longer visible.');
        setStage('camera-paused');
        return;
      }
      if (!pausedByVisibilityRef.current) return;
      pausedByVisibilityRef.current = false;
      const streamIsLive = Boolean(streamRef.current?.getVideoTracks().some((track) => track.readyState === 'live'));
      startingSetRef.current = false;
      setCameraError('');
      setTrackingStable(false);
      stablePoseFramesRef.current = 0;
      setPoseStatus('Restoring camera tracking…');
      if (streamIsLive) {
        setStage('setup');
        setCameraStreamVersion((version) => version + 1);
        if (profile && !trackingReadyRef.current) startWorkerTracking();
      } else {
        void startCamera(cameraFacing, genericRecording);
      }
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => document.removeEventListener('visibilitychange', visibilityChanged);
  }, [cameraFacing, cancelFrameLoop, genericRecording, persistCameraProgress, profile, startCamera, startWorkerTracking, stopRecording]);

  const startTimer = (fromGesture = false) => {
    if (fromGesture) primeVoiceCues();
    setElapsedSeconds(0);
    startedAtRef.current = performance.now();
    setStage('timer-active');
  };

  useEffect(() => {
    if (!providerCheckDone || stage !== 'initializing') return;
    if (aiProvider) {
      setStage('consent');
      return;
    }
    if (profile) void startCamera('user');
    else startTimer();
  }, [aiProvider, profile, providerCheckDone, stage, startCamera]);

  const continueWithTimer = () => {
    stopRecording();
    stopCamera();
    setGenericRecording(false);
    setStage('timer-ready');
  };

  const adjustCompletedRep = (delta: number) => {
    const current = workoutRef.current;
    const selectedSet = current.sets[setIndex];
    if (!selectedSet?.complete) return;
    const count = Math.max(0, (selectedSet.completedReps ?? selectedSet.reps) + delta);
    const {
      caloriesBurned: _caloriesBurned,
      calorieSource: _calorieSource,
      calorieSourceUrl: _calorieSourceUrl,
      energyDurationMinutes: _energyDurationMinutes,
      energyEquivalentKg: _energyEquivalentKg,
      ...withoutFrozenEnergy
    } = current;
    const next: Workout = {
      ...withoutFrozenEnergy,
      completed: false,
      sets: current.sets.map((set, index) => index === setIndex ? {
        ...set,
        reps: count,
        completedReps: count,
        movementSummary: set.movementSummary ? {
          ...set.movementSummary,
          completedReps: count,
          metaAnalysis: undefined,
        } : undefined,
      } : set),
    };
    setRepCount(count);
    setAnalysis(undefined);
    setAnalysisError('');
    setAnalysisStage(undefined);
    setCountDecision('pending');
    workoutRef.current = next;
    setWorkout(next);
    onSaveRef.current(next);
  };

  const nextSetIndex = workout.sets.findIndex((set, index) => index > setIndex && !set.complete);
  const beginNextSet = () => {
    if (nextSetIndex < 0) { releaseSession(); onClose(); return; }
    previousRepRef.current = selectedRep;
    setSetIndex(nextSetIndex);
    baseRepCountRef.current = workout.sets[nextSetIndex]?.completedReps ?? 0;
    baseDurationSecondsRef.current = workout.sets[nextSetIndex]?.actualDurationSeconds ?? 0;
    setRepCount(baseRepCountRef.current);
    setElapsedSeconds(0);
    setRecording(undefined);
    setAnalysis(undefined);
    setAnalysisError('');
    setCountDecision('pending');
    setGenericRecording(false);
    setStage('initializing');
  };

  const selectedRep = useMemo(() => trackerRef.current ? selectRepresentativeRep(trackerRef.current.reps) : undefined, [repCount, stage]);
  const improvement = useMemo(() => {
    const previous = previousRepRef.current;
    if (!previous || previous.assessment.status !== 'correction_needed' || !selectedRep || selectedRep.assessment.status === 'insufficient_evidence') return '';
    if (selectedRep.assessment.status === 'good_form') return 'Improvement verified: this repetition reached the measured target.';
    const before = previous.assessment.evidence.find((item) => item.metric === 'primary_range')?.value;
    const after = selectedRep.assessment.evidence.find((item) => item.metric === 'primary_range')?.value;
    if (before === undefined || after === undefined || !profile) return '';
    const improved = profile.id === 'military-press' || profile.id === 'jumping-jack' ? after > before : after < before;
    return improved ? `Improvement verified: ${profile.countMetricLabel.toLowerCase()} changed from ${before} to ${after}.` : '';
  }, [profile, selectedRep]);
  const runMetaAnalysis = async () => {
    if (!recording || !aiProvider) return;
    const providerName = aiProvider === 'META' ? 'Meta' : 'Gemini';
    if (!window.confirm(`Send this muted set recording temporarily to Eat & Fit for video preparation, then directly from this browser to ${providerName}? The provider will track the athlete, review the repetition count, and return one coaching observation. All temporary files are deleted after processing.`)) return;
    setAnalyzing(true);
    setAnalysisError('');
    setAnalysisStage('preparing');
    const analyzedSetIndex = setIndex;
    const analyzedSetId = workout.sets[setIndex]?.id;
    const analysisController = new AbortController();
    analysisAbortRef.current = analysisController;
    try {
      const localReps = profile ? trackerRef.current?.reps ?? [] : [];
      const localSegmentRepCount = Math.max(0, repCount - recordingBaseRepCountRef.current);
      const fallbackAssessment: FormAssessment = { status: 'insufficient_evidence', reason: 'tracking_lost', evidence: [] };
      const provider = createMovementReviewProvider(aiProvider);
      const metaResult = await runLoggedAiOperation(`${providerName} exercise movement review`, () => provider.analyze({
        mode: profile ? 'profiled' : 'generic',
        video: recording,
        exerciseId: workout.exerciseId,
        exerciseName: exercise?.name ?? profile?.displayName ?? workout.exerciseName,
        movementGuidance: profile
          ? `${profile.countMetricLabel}; good-form target ${profile.goodFormTarget}. ${profile.setupInstruction}`
          : [exercise?.instructions, exercise?.commonMistakes].filter(Boolean).join(' ') || 'Review only the visible movement and avoid unsupported claims.',
        setNumber: setIndex + 1,
        selectedRep: selectedRep ? { ...selectedRep, startMs: selectedRep.startMs + recordingOffsetMsRef.current, endMs: selectedRep.endMs + recordingOffsetMsRef.current } : undefined,
        localRepCount: localSegmentRepCount,
        priorRepCount: recordingBaseRepCountRef.current,
        repWindows: localReps
          .filter((rep) => rep.endMs > rep.startMs)
          .map((rep) => ({
            index: rep.index,
            startMs: rep.startMs + recordingOffsetMsRef.current,
            endMs: rep.endMs + recordingOffsetMsRef.current,
            confidence: rep.confidence,
          })),
        activeDurationMs: Math.max(0, Math.round(elapsedSeconds * 1000)),
        assessment: profile ? selectedRep?.assessment ?? fallbackAssessment : undefined,
        plannedRepCount: workout.sets[setIndex]?.reps ?? targetReps,
      }, {
        signal: analysisController.signal,
        onStage: (nextStage) => {
          if (mountedRef.current && setIndexRef.current === analyzedSetIndex) setAnalysisStage(nextStage);
        },
      }), { provider: aiProvider, model: provider.modelLabel, outputCount: 1 });
      if (metaResult.state === 'failure') throw new Error(metaResult.error.message);
      if (metaResult.state !== 'success') return;
      const result = metaResult.data;
      if (!mountedRef.current) return;
      if (mountedRef.current && setIndexRef.current === analyzedSetIndex) setAnalysis(result);
      const baselineCount = result.countReview.baselineRepCount;
      const countsMatch = baselineCount === result.countReview.suggestedSetRepCount;
      const initialDecision = countsMatch ? 'matched' : 'pending';
      setCountDecision(initialDecision);
      const storedAnalysis = storedMetaAnalysis(result, initialDecision, countsMatch ? baselineCount : undefined);
      const current = workoutRef.current;
      const next = {
        ...current,
        sets: current.sets.map((set) => set.id === analyzedSetId && set.movementSummary
          ? { ...set, movementSummary: { ...set.movementSummary, metaAnalysis: storedAnalysis } }
          : set),
      };
      workoutRef.current = next;
      if (mountedRef.current) setWorkout(next);
      onSaveRef.current(next);
    } catch (error) {
      if (mountedRef.current && setIndexRef.current === analyzedSetIndex) setAnalysisError(error instanceof Error ? error.message : 'Meta analysis failed. Your local workout result is safe.');
    } finally {
      if (analysisAbortRef.current === analysisController) analysisAbortRef.current = undefined;
      if (mountedRef.current && setIndexRef.current === analyzedSetIndex) {
        setAnalyzing(false);
        setAnalysisStage(undefined);
      }
    }
  };

  const chooseMetaCount = (choice: 'local' | 'muse') => {
    if (!analysis) return;
    const acceptedRepCount = choice === 'local'
      ? analysis.countReview.baselineRepCount
      : analysis.countReview.suggestedSetRepCount;
    const current = workoutRef.current;
    const currentSetId = current.sets[setIndex]?.id;
    const next = applyAcceptedMovementCount(
      current,
      currentSetId,
      acceptedRepCount,
      storedMetaAnalysis(analysis, choice, acceptedRepCount),
    );
    setCountDecision(choice);
    setRepCount(acceptedRepCount);
    workoutRef.current = next;
    setWorkout(next);
    onSaveRef.current(next);
  };

  const cameraSessionOpen = stage === 'setup' || stage === 'countdown' || stage === 'active';

  return (
    <div className={`exercise-session${cameraSessionOpen ? ' camera-session-open' : ''}`} role="dialog" aria-modal="true" aria-labelledby="exercise-session-title">
      <header className="exercise-session-header">
        <div><small>Set {setIndex + 1} of {workout.sets.length}</small><h2 id="exercise-session-title">{workout.exerciseName}</h2></div>
        <div className="session-header-actions">
          <button className="icon-button" aria-label={voiceCuesEnabled ? 'Turn off voice cues' : 'Turn on voice cues'} aria-pressed={voiceCuesEnabled} onClick={() => {
            const enabled = !voiceCuesEnabled;
            setVoiceCuesEnabled(enabled);
            if (enabled) primeVoiceCues();
            else window.speechSynthesis?.cancel();
          }}>{voiceCuesEnabled ? <Volume2 /> : <VolumeX />}</button>
          <button className="icon-button" aria-label="Close exercise session" onClick={() => { releaseSession(); onClose(); }}><X /></button>
        </div>
      </header>

      {stage === 'initializing' && <section className="timer-session"><span className="session-icon"><Timer /></span><h3>Preparing exercise</h3><p>Checking the available exercise mode…</p></section>}

      {stage === 'consent' && (
        <section className="exercise-consent">
          <span className="session-icon"><Camera /></span>
          <h3>{profile ? 'Enable camera?' : 'Record set with AI'}</h3>
          {profile
            ? <><p>Eat &amp; Fit uses your camera to count repetitions and evaluate movement. Live analysis runs on this device.</p><p>Video is not uploaded unless you later choose to analyze the set with AI.</p></>
            : <p>Eat &amp; Fit will record this set without sound. After recording, AI can track the athlete, count repetitions, and provide an AI coaching observation.</p>}
          <div className="session-actions">
            <button className="primary-button" onClick={() => { primeVoiceCues(); void startCamera('user', !profile); }}><Camera size={18} /> {profile ? 'Enable camera' : 'Record with camera'}</button>
            <button className="text-button" onClick={() => { primeVoiceCues(); continueWithTimer(); }}><Timer size={18} /> Use timer instead</button>
          </div>
        </section>
      )}

      {(stage === 'setup' || stage === 'countdown' || stage === 'active') && (
        <section className="camera-session">
          <div className={`camera-stage camera-facing-${cameraFacing}`}>
            <video ref={videoRef} muted playsInline />
            {profile && <canvas ref={canvasRef} width="1280" height="720" />}
            {stage === 'countdown' && <strong className="session-countdown">{countdown || 'Go'}</strong>}
            {stage === 'active' && (genericRecording
              ? <div className="rep-progress recording-progress"><strong>{elapsedSeconds}s</strong><span>of 1:30 maximum</span></div>
              : <div className="rep-progress" style={{ '--rep-progress': `${cameraSetProgress(setTarget, repCount, elapsedSeconds)}%` } as CSSProperties}><strong>{repCount}</strong><span>{targetReps > 0 ? `of ${targetReps} reps` : `${Math.min(elapsedSeconds, targetSeconds)} of ${targetSeconds}s`}</span></div>)}
            {stage === 'active' && (genericRecording
              ? <div className="live-session-hud recording"><strong>{elapsedSeconds}s</strong><span>Recording set for AI</span><button className="text-button" onClick={() => void finishGenericRecording()}>Stop recording</button></div>
              : <div className="live-session-hud"><strong>{elapsedSeconds}s</strong></div>)}
          </div>
          {stage === 'setup' && <div className="camera-setup"><h3>{profile ? profile.cameraView === 'side' ? 'Use a side view' : 'Use a front view' : 'Get ready to record'}</h3><p>{profile ? profile.setupInstruction : 'The muted recording starts automatically after the countdown. Keep only the athlete in frame.'}</p>{canSwitchCamera && <button className="text-button camera-switch" type="button" onClick={switchCamera}><Camera size={17} /> Use {cameraFacing === 'user' ? 'rear' : 'selfie'} camera</button>}<p className="tracking-status" role="status">{profile ? trackingStable ? 'Tracking ready. Starting automatically…' : poseStatus : previewReady ? 'Camera ready. Starting automatically…' : 'Preparing camera preview…'}</p>{cameraError && <p className="session-error" role="alert">{cameraError}</p>}</div>}
        </section>
      )}

      {stage === 'camera-paused' && (
        <section className="timer-session camera-recovery">
          <span className="session-icon"><Camera /></span>
          <h3>Camera paused</h3>
          <p className="session-message" role="alert">{cameraError || message || 'Camera tracking paused. Enable the camera again or continue with the set timer.'}</p>
          <div className="session-actions">
            <button className="primary-button" onClick={() => { primeVoiceCues(); void startCamera('user', genericRecording); }}><Camera size={18} /> Enable camera</button>
            <button className="text-button" onClick={() => { primeVoiceCues(); continueWithTimer(); }}><Timer size={18} /> Start timer</button>
          </div>
        </section>
      )}

      {(stage === 'timer-ready' || stage === 'timer-active' || stage === 'timer-confirm') && (
        <section className="timer-session">
          <span className="session-icon"><Timer /></span>
          <h3>{stage === 'timer-confirm' ? `Did you complete set ${setIndex + 1}?` : `Set ${setIndex + 1} timer`}</h3>
          <strong className="timer-value">{stage === 'timer-active' ? Math.max(0, targetSeconds - elapsedSeconds) : targetSeconds}s</strong>
          {message && <p className="session-message">{message}</p>}
          {stage === 'timer-ready' && <button className="primary-button" onClick={() => startTimer(true)}>Start timer</button>}
          {stage === 'timer-confirm' && <div className="session-actions"><button className="primary-button" onClick={() => saveCompletedSet('timer')}><Check size={18} /> Yes, mark complete</button><button className="text-button" onClick={() => startTimer(true)}><RotateCcw size={17} /> Retry timer</button><button className="text-button" onClick={onClose}>Exit</button></div>}
        </section>
      )}

      {stage === 'rest' && (
        <section className="set-result">
          <div className="set-complete-heading"><span><Check /></span><div><small>Set {setIndex + 1} complete</small><h3>{restSeconds ? `Rest ${restSeconds}s` : nextSetIndex >= 0 ? 'Ready for your next set' : 'Set complete'}</h3></div></div>
          {profile && <div className="set-rep-adjustment" aria-label="Completed repetitions"><span>Completed reps</span><div><button className="icon-button" aria-label="Remove one repetition" disabled={repCount === 0} onClick={() => adjustCompletedRep(-1)}><Minus size={18} /></button><strong>{repCount}</strong><button className="icon-button" aria-label="Add one repetition" onClick={() => adjustCompletedRep(1)}><Plus size={18} /></button></div></div>}
          {selectedRep && <LocalAssessment rep={selectedRep} />}
          {improvement && <p className="improvement-verified"><Check size={16} /> {improvement}</p>}
          {analysisError && <p className="session-error" role="alert">{analysisError}</p>}
          {analysis && <MetaResult analysis={analysis} recording={recording} countDecision={countDecision} onCountChoice={chooseMetaCount} />}
          {analysis && aiProvider === 'META' && <div className="session-attributions"><span>Tracked with SAM 3.1</span><span>Reviewed by Muse Spark 1.3</span></div>}
          <div className="set-result-actions">
            {recording && aiProvider && !analysis && <button className="text-button" disabled={analyzing} onClick={() => void runMetaAnalysis()}>{analyzing && analysisStage ? `${MOVEMENT_ANALYSIS_STAGE_LABELS[analysisStage]}…` : analysisError ? 'Retry analysis' : 'Analyze with AI'}</button>}
            <button className="primary-button" onClick={beginNextSet}>{nextSetIndex >= 0 ? 'Start next set' : 'Finish exercise'} <ChevronRight size={18} /></button>
          </div>
        </section>
      )}
    </div>
  );
}

function LocalAssessment({ rep }: { rep: NonNullable<ReturnType<typeof selectRepresentativeRep>> }) {
  if (rep.assessment.status === 'good_form') return <article className="assessment-card good"><small>Local assessment</small><h3>Good rep</h3><p>Your measured range of motion and repetition timing met this movement profile.</p><strong>Keep the same controlled movement in your next set.</strong></article>;
  if (rep.assessment.status === 'correction_needed') {
    const metric = rep.assessment.evidence[0];
    return <article className="assessment-card correction"><small>Local assessment</small><h3>One adjustment for your next set</h3><p>{metric.label}: {metric.value}{metric.unit === 'degrees' ? '°' : '×'} (target {metric.target}).</p><strong>Use a controlled, slightly deeper range in your next set.</strong></article>;
  }
  return <article className="assessment-card insufficient"><small>Local assessment</small><h3>We could not assess this rep reliably</h3><p>Reposition the camera so your full body remains visible and keep only one person in frame.</p></article>;
}

function MetaResult({
  analysis,
  recording,
  countDecision,
  onCountChoice,
}: {
  analysis: MetaMovementAnalysis;
  recording?: Blob;
  countDecision: StoredMetaMovementAnalysis['countDecision'];
  onCountChoice: (choice: 'local' | 'muse') => void;
}) {
  const coaching = analysis.coaching;
  const review = analysis.countReview;
  const baselineLabel = review.baselineKind === 'planned' ? 'This set was planned for' : 'MediaPipe counted';
  const countsDiffer = review.baselineRepCount !== review.suggestedSetRepCount;
  return <article className={`meta-coaching ${coaching.status}`}>
    <small>AI full-set review</small>
    <section className="meta-count-review">
      {countsDiffer
        ? <p>{baselineLabel} <strong>{review.baselineRepCount}</strong> repetitions. AI observed <strong>{review.suggestedSetRepCount}</strong>.</p>
        : <p>{baselineLabel} <strong>{review.baselineRepCount}</strong> repetitions. AI observed the same count.</p>}
      <small>AI count confidence: {review.confidence}</small>
      {countsDiffer && countDecision === 'pending' && <div className="session-actions"><button className="text-button" onClick={() => onCountChoice('local')}>Keep {review.baselineRepCount} reps</button><button className="primary-button" onClick={() => onCountChoice('muse')}>Use {review.suggestedSetRepCount} reps</button></div>}
      {countsDiffer && countDecision === 'local' && <p>Saved {review.baselineRepCount} repetitions.</p>}
      {countsDiffer && countDecision === 'muse' && <p>Saved the AI-observed count: {review.suggestedSetRepCount}.</p>}
    </section>
    <h3>{coaching.status === 'good_form' ? 'Good rep' : coaching.status === 'correction_needed' ? 'One adjustment for your next set' : coaching.status === 'ai_observation' ? 'AI observation' : 'We could not assess this rep reliably'}</h3>
    {recording && analysis.sam.boxes.length > 0 && <SamReplay video={recording} analysis={analysis} />}
    {coaching.positiveObservation && <p>{coaching.positiveObservation}</p>}
    {coaching.primaryCorrection && <p><strong>{coaching.primaryCorrection}</strong></p>}
    {coaching.nextSetGoal && <p>Next set: {coaching.nextSetGoal}</p>}
  </article>;
}

function SamReplay({ video, analysis }: { video: Blob; analysis: MetaMovementAnalysis }) {
  const url = useMemo(() => URL.createObjectURL(video), [video]);
  const [time, setTime] = useState(0);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const box = analysis.sam.boxes.reduce((best, candidate) => Math.abs(candidate.timestampMs - time * 1000) < Math.abs(best.timestampMs - time * 1000) ? candidate : best, analysis.sam.boxes[0]);
  return <div className="sam-replay"><video src={url} muted playsInline controls onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} /><i style={{ left: `${box.x / analysis.sam.sourceWidth * 100}%`, top: `${box.y / analysis.sam.sourceHeight * 100}%`, width: `${box.width / analysis.sam.sourceWidth * 100}%`, height: `${box.height / analysis.sam.sourceHeight * 100}%` }} /><span>Tracked with SAM 3.1</span></div>;
}

