import { Camera, Check, ChevronRight, Minus, Plus, RotateCcw, Timer, Video, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Workout } from '../data/db';
import { readUserProfile } from '../profile/userProfile';
import { getRecognitionKeyStatus } from '../settings/secureKeys';
import { MovementTracker, selectRepresentativeRep } from './engine';
import { analyzeMovementWithMeta } from './metaAnalysis';
import { drawPose } from './poseCanvas';
import type { MovementProfile } from './types';

type Stage = 'consent' | 'setup' | 'countdown' | 'active' | 'timer-ready' | 'timer-active' | 'timer-confirm' | 'rest';

function spoken(message: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
}

function haptic(pattern: number | number[]) {
  navigator.vibrate?.(pattern);
}

function supportedMimeType() {
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function ExerciseSession({
  workout: initialWorkout,
  profile,
  initialSetIndex,
  onSave,
  onClose,
}: {
  workout: Workout;
  profile?: MovementProfile;
  initialSetIndex: number;
  onSave: (workout: Workout) => void;
  onClose: () => void;
}) {
  const [workout, setWorkout] = useState(initialWorkout);
  const [setIndex, setSetIndex] = useState(initialSetIndex);
  const [stage, setStage] = useState<Stage>('consent');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(3);
  const [repCount, setRepCount] = useState(initialWorkout.sets[initialSetIndex]?.completedReps ?? 0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [restSeconds, setRestSeconds] = useState(60);
  const [recording, setRecording] = useState<Blob>();
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof analyzeMovementWithMeta>>>();
  const [analysisError, setAnalysisError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [metaEligible, setMetaEligible] = useState(false);
  const [poseStatus, setPoseStatus] = useState('Waiting for a stable full-body view…');
  const [trackingStable, setTrackingStable] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const workerRef = useRef<Worker | undefined>(undefined);
  const trackerRef = useRef(profile ? new MovementTracker(profile) : undefined);
  const workoutRef = useRef(initialWorkout);
  const setIndexRef = useRef(initialSetIndex);
  const mountedRef = useRef(true);
  const previousRepRef = useRef<NonNullable<ReturnType<typeof selectRepresentativeRep>> | undefined>(undefined);
  const frameLoopRef = useRef<number | undefined>(undefined);
  const lastFrameRef = useRef(0);
  const stablePoseFramesRef = useRef(0);
  const baseRepCountRef = useRef(initialWorkout.sets[initialSetIndex]?.completedReps ?? 0);
  const baseDurationSecondsRef = useRef(initialWorkout.sets[initialSetIndex]?.actualDurationSeconds ?? 0);
  const startedAtRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const recordingOffsetMsRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | undefined>(undefined);
  const currentSet = workout.sets[setIndex];
  const targetReps = Math.max(1, currentSet?.reps || 1);
  const targetSeconds = Math.max(5, currentSet?.durationSeconds || targetReps * 4);

  useEffect(() => {
    const user = readUserProfile();
    if (!__SMART_SCANNER__ || Number(user.age) < 19) return;
    void getRecognitionKeyStatus().then((status) => setMetaEligible(status.metaConfigured));
  }, []);

  useEffect(() => { workoutRef.current = workout; }, [workout]);
  useEffect(() => { setIndexRef.current = setIndex; }, [setIndex]);

  const stopCamera = useCallback(() => {
    if (frameLoopRef.current) cancelAnimationFrame(frameLoopRef.current);
    frameLoopRef.current = undefined;
    workerRef.current?.terminate();
    workerRef.current = undefined;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  }, []);

  const releaseSession = useCallback(() => {
    stopRecording();
    stopCamera();
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = undefined;
    window.speechSynthesis?.cancel();
  }, [stopCamera, stopRecording]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; releaseSession(); };
  }, [releaseSession]);
  useEffect(() => {
    const hidden = () => { if (document.hidden && (stage === 'active' || stage === 'setup')) { setMessage('Camera tracking paused because Eat & Fit is no longer visible.'); stopCamera(); setStage('timer-ready'); } };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [stage, stopCamera]);

  useEffect(() => {
    if (!streamRef.current || !videoRef.current || !['setup', 'countdown', 'active'].includes(stage)) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().then(() => {
      if (!canvasRef.current) return;
      canvasRef.current.width = video.videoWidth || 1280;
      canvasRef.current.height = video.videoHeight || 720;
    }).catch(() => undefined);
  }, [stage]);

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
    onSave(partial);
  }, [onSave, profile, setIndex]);

  useEffect(() => {
    if (stage !== 'countdown') return;
    setCountdown(3);
    const interval = window.setInterval(() => setCountdown((value) => {
      if (value <= 1) {
        window.clearInterval(interval);
        setStage('active');
        return 0;
      }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'active' && stage !== 'timer-active') return;
    const interval = window.setInterval(() => setElapsedSeconds(Math.max(0, Math.round((performance.now() - startedAtRef.current) / 1000))), 250);
    return () => window.clearInterval(interval);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'timer-active' || elapsedSeconds < targetSeconds) return;
    setStage('timer-confirm');
    haptic([100, 80, 100]);
    spoken(`Set ${setIndex + 1} timer complete.`);
  }, [elapsedSeconds, setIndex, stage, targetSeconds]);

  useEffect(() => {
    if (stage !== 'rest') return;
    const interval = window.setInterval(() => setRestSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [stage]);

  const saveCompletedSet = useCallback((mode: 'camera' | 'timer', reps = targetReps) => {
    const summary = mode === 'camera' && profile && trackerRef.current ? {
      profileId: profile.id,
      profileVersion: profile.version,
      mode,
      completedReps: reps,
      elapsedSeconds: baseDurationSecondsRef.current + elapsedSeconds,
      reps: trackerRef.current.reps,
      selectedRep: selectRepresentativeRep(trackerRef.current.reps)?.index,
    } as const : undefined;
    const next = {
      ...workout,
      sets: workout.sets.map((set, index) => index === setIndex ? {
        ...set,
        complete: true,
        completedReps: reps,
        actualDurationSeconds: Math.max(1, baseDurationSecondsRef.current + elapsedSeconds),
        trackingMode: mode,
        ...(summary ? { movementSummary: summary } : {}),
      } : set),
    };
    setWorkout(next);
    onSave(next);
    setRestSeconds(60);
    setStage('rest');
  }, [elapsedSeconds, onSave, profile, setIndex, targetReps, workout]);

  useEffect(() => {
    if (stage !== 'active' || repCount < targetReps) return;
    stopRecording();
    stopCamera();
    haptic([120, 80, 180]);
    spoken(`Set ${setIndex + 1} complete.`);
    saveCompletedSet('camera', repCount);
  }, [repCount, saveCompletedSet, setIndex, stage, stopCamera, stopRecording, targetReps]);

  const processFrame = useCallback(async (now: number) => {
    if (!workerRef.current || !videoRef.current || videoRef.current.readyState < 2) {
      frameLoopRef.current = requestAnimationFrame(processFrame);
      return;
    }
    if (now - lastFrameRef.current >= 82) {
      lastFrameRef.current = now;
      try {
        const bitmap = await createImageBitmap(videoRef.current);
        workerRef.current.postMessage({ type: 'frame', frame: bitmap, timestampMs: now }, [bitmap]);
      } catch { /* the next animation frame will retry */ }
    }
    frameLoopRef.current = requestAnimationFrame(processFrame);
  }, []);

  const startCamera = async () => {
    if (!profile) { setStage('timer-ready'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } });
      streamRef.current = stream;
      const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (event) => {
        if (event.data.type === 'ready') {
          setPoseStatus('Tracking ready. Keep your full body in frame.');
          if (!frameLoopRef.current) frameLoopRef.current = requestAnimationFrame(processFrame);
          return;
        }
        if (event.data.type === 'error') { setMessage(event.data.message); return; }
        const poses = event.data.poses as import('./types').PoseLandmark[][];
        if (poses.length !== 1) {
          stablePoseFramesRef.current = 0;
          setTrackingStable(false);
          setPoseStatus(poses.length > 1 ? 'Only one person can be in frame.' : 'Move back until your full body is visible.');
          return;
        }
        const landmarks = poses[0];
        if (canvasRef.current) drawPose(canvasRef.current, landmarks);
        const required = [11, 12, 15, 16, 23, 24, 25, 26, 27, 28];
        const fullBodyVisible = required.every((index) => (landmarks[index]?.visibility ?? 0) >= 0.6);
        stablePoseFramesRef.current = fullBodyVisible ? stablePoseFramesRef.current + 1 : 0;
        const stable = stablePoseFramesRef.current >= 10;
        setTrackingStable(stable);
        setPoseStatus(stable ? 'Full body tracked on this device' : 'Hold still with your full body in frame…');
        if (stageRef.current !== 'active') return;
        const exerciseTimestampMs = event.data.timestampMs - startedAtRef.current;
        const rep = trackerRef.current?.process({ timestampMs: exerciseTimestampMs, landmarks });
        if (rep) {
          const count = baseRepCountRef.current + (trackerRef.current?.reps.length ?? 0);
          setRepCount(count);
          persistCameraProgress(count, baseDurationSecondsRef.current + Math.round(exerciseTimestampMs / 1000));
          haptic(70);
          spoken(`Rep ${count} complete.`);
        }
      };
      worker.postMessage({ type: 'init' });
      setStage('setup');
    } catch {
      setMessage('Camera access was not available. You can still complete this exercise with the set timer.');
      setStage('timer-ready');
    }
  };

  const stageRef = useRef(stage);
  useEffect(() => { stageRef.current = stage; }, [stage]);

  const startCameraSet = async () => {
    trackerRef.current = profile ? new MovementTracker(profile) : undefined;
    baseRepCountRef.current = workoutRef.current.sets[setIndex]?.completedReps ?? 0;
    baseDurationSecondsRef.current = workoutRef.current.sets[setIndex]?.actualDurationSeconds ?? 0;
    setRepCount(baseRepCountRef.current);
    setElapsedSeconds(0);
    setRecording(undefined);
    setAnalysis(undefined);
    setAnalysisError('');
    const recordingStartedAt = performance.now();
    startedAtRef.current = recordingStartedAt + 3000;
    recordingOffsetMsRef.current = startedAtRef.current - recordingStartedAt;
    chunksRef.current = [];
    if (streamRef.current && typeof MediaRecorder !== 'undefined') {
      const recorder = new MediaRecorder(streamRef.current, supportedMimeType() ? { mimeType: supportedMimeType() } : undefined);
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => setRecording(new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' }));
      recorder.start(500);
      recorderRef.current = recorder;
    }
    try {
      wakeLockRef.current = await (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen');
    } catch { /* exercise remains usable without wake lock */ }
    if (!frameLoopRef.current) frameLoopRef.current = requestAnimationFrame(processFrame);
    setStage('countdown');
  };

  const startTimer = () => {
    setElapsedSeconds(0);
    startedAtRef.current = performance.now();
    setStage('timer-active');
  };

  const adjustRep = (delta: number) => {
    if (delta > 0) trackerRef.current?.addManualRep(performance.now() - startedAtRef.current);
    else if (trackerRef.current?.reps.length) trackerRef.current.undoLastRep();
    else baseRepCountRef.current = Math.max(0, baseRepCountRef.current - 1);
    const count = Math.max(0, baseRepCountRef.current + (trackerRef.current?.reps.length ?? 0));
    setRepCount(count);
    persistCameraProgress(count, Math.max(1, baseDurationSecondsRef.current + elapsedSeconds));
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
    setStage(profile ? 'consent' : 'timer-ready');
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
    if (!recording || !selectedRep) return;
    if (!window.confirm('Upload this set recording temporarily to Eat & Fit so the selected repetition can be trimmed? Only the muted selected repetition is sent to Meta for SAM 3.1 tracking and Muse Spark 1.3 coaching. All temporary files are deleted after processing.')) return;
    setAnalyzing(true);
    setAnalysisError('');
    const analyzedSetIndex = setIndex;
    const analyzedSetId = workout.sets[setIndex]?.id;
    try {
      const result = await analyzeMovementWithMeta({
        video: recording,
        exerciseId: workout.exerciseId,
        exerciseName: profile?.displayName ?? workout.exerciseName,
        movementGuidance: profile ? `${profile.countMetricLabel}; good-form target ${profile.goodFormTarget}. ${profile.setupInstruction}` : workout.exerciseName,
        setNumber: setIndex + 1,
        selectedRep: { ...selectedRep, startMs: selectedRep.startMs + recordingOffsetMsRef.current, endMs: selectedRep.endMs + recordingOffsetMsRef.current },
        assessment: selectedRep.assessment,
        videoWidth: videoRef.current?.videoWidth || 1280,
        videoHeight: videoRef.current?.videoHeight || 720,
      });
      if (!mountedRef.current) return;
      if (mountedRef.current && setIndexRef.current === analyzedSetIndex) setAnalysis(result);
      const storedAnalysis = {
        samModel: result.sam.model,
        trackingCoverage: result.sam.coverage,
        trackingConfidence: result.sam.confidence,
        coaching: result.coaching,
        museModel: result.museModel,
        processedAt: result.processedAt,
      };
      const current = workoutRef.current;
      const next = {
        ...current,
        sets: current.sets.map((set) => set.id === analyzedSetId && set.movementSummary
          ? { ...set, movementSummary: { ...set.movementSummary, metaAnalysis: storedAnalysis } }
          : set),
      };
      workoutRef.current = next;
      if (mountedRef.current) setWorkout(next);
      onSave(next);
    } catch (error) {
      if (mountedRef.current && setIndexRef.current === analyzedSetIndex) setAnalysisError(error instanceof Error ? error.message : 'Meta analysis failed. Your local workout result is safe.');
    } finally {
      if (mountedRef.current && setIndexRef.current === analyzedSetIndex) setAnalyzing(false);
    }
  };

  return (
    <div className="exercise-session" role="dialog" aria-modal="true" aria-labelledby="exercise-session-title">
      <header className="exercise-session-header">
        <div><small>Set {setIndex + 1} of {workout.sets.length}</small><h2 id="exercise-session-title">{workout.exerciseName}</h2></div>
        <button className="icon-button" aria-label="Close exercise session" onClick={() => { releaseSession(); onClose(); }}><X /></button>
      </header>

      {stage === 'consent' && (
        <section className="exercise-consent">
          <span className="session-icon"><Camera /></span>
          <h3>{profile ? 'Enable camera?' : 'Start with a set timer'}</h3>
          {profile ? <><p>Eat &amp; Fit uses your camera to count repetitions and evaluate movement. Live analysis runs on this device.</p><p>Video is not uploaded unless you later choose to analyze one rep with Meta.</p></> : <p>This exercise does not have a validated camera profile yet. You can complete it with a set timer.</p>}
          <div className="session-actions">
            {profile && <button className="primary-button" onClick={() => void startCamera()}><Camera size={18} /> Enable camera</button>}
            <button className="text-button" onClick={() => setStage('timer-ready')}><Timer size={18} /> Use timer instead</button>
          </div>
        </section>
      )}

      {(stage === 'setup' || stage === 'countdown' || stage === 'active') && (
        <section className="camera-session">
          <div className="camera-stage">
            <video ref={videoRef} muted playsInline />
            <canvas ref={canvasRef} width="1280" height="720" />
            {stage === 'countdown' && <strong className="session-countdown">{countdown || 'Go'}</strong>}
            {stage === 'active' && <div className="rep-progress" style={{ '--rep-progress': `${Math.min(100, repCount / targetReps * 100)}%` } as CSSProperties}><strong>{repCount}</strong><span>of {targetReps} reps</span></div>}
          </div>
          {stage === 'setup' && <div className="camera-setup"><h3>{profile?.cameraView === 'side' ? 'Use a side view' : 'Use a front view'}</h3><p>{profile?.setupInstruction}</p><p className="tracking-status">{poseStatus}</p><button className="primary-button" disabled={!trackingStable} onClick={() => void startCameraSet()}><Video size={18} /> {trackingStable ? 'Start set' : 'Waiting for stable tracking'}</button></div>}
          {stage === 'active' && <div className="live-session-controls"><p>{poseStatus}</p><strong>{elapsedSeconds}s</strong><div><button className="text-button" disabled={repCount === 0} onClick={() => adjustRep(-1)}><Minus size={17} /> Undo last rep</button><button className="text-button" onClick={() => adjustRep(1)}><Plus size={17} /> Add rep</button></div></div>}
        </section>
      )}

      {(stage === 'timer-ready' || stage === 'timer-active' || stage === 'timer-confirm') && (
        <section className="timer-session">
          <span className="session-icon"><Timer /></span>
          <h3>{stage === 'timer-confirm' ? `Did you complete set ${setIndex + 1}?` : `Set ${setIndex + 1} timer`}</h3>
          <strong className="timer-value">{stage === 'timer-active' ? Math.max(0, targetSeconds - elapsedSeconds) : targetSeconds}s</strong>
          {message && <p className="session-message">{message}</p>}
          {stage === 'timer-ready' && <button className="primary-button" onClick={startTimer}>Start timer</button>}
          {stage === 'timer-confirm' && <div className="session-actions"><button className="primary-button" onClick={() => saveCompletedSet('timer')}><Check size={18} /> Yes, mark complete</button><button className="text-button" onClick={startTimer}><RotateCcw size={17} /> Retry timer</button><button className="text-button" onClick={onClose}>Exit</button></div>}
        </section>
      )}

      {stage === 'rest' && (
        <section className="set-result">
          <div className="set-complete-heading"><span><Check /></span><div><small>Set {setIndex + 1} complete</small><h3>{restSeconds ? `Rest ${restSeconds}s` : 'Ready for your next set'}</h3></div></div>
          {selectedRep && <LocalAssessment rep={selectedRep} />}
          {improvement && <p className="improvement-verified"><Check size={16} /> {improvement}</p>}
          {recording && selectedRep && metaEligible && !analysis && <button className="text-button analyze-rep" disabled={analyzing} onClick={() => void runMetaAnalysis()}>{analyzing ? 'Analyzing selected rep…' : `Analyze rep ${selectedRep.index} with Meta`}</button>}
          {analysisError && <p className="session-error" role="alert">{analysisError}</p>}
          {analysis && <MetaResult analysis={analysis} recording={recording} />}
          <div className="session-attributions"><span>Counted on this device</span>{analysis && <><span>Tracked with SAM 3.1</span><span>Coached by Muse Spark 1.3</span></>}</div>
          <button className="primary-button next-set-button" onClick={beginNextSet}>{nextSetIndex >= 0 ? 'Start next set' : 'Finish exercise'} <ChevronRight size={18} /></button>
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

function MetaResult({ analysis, recording }: { analysis: Awaited<ReturnType<typeof analyzeMovementWithMeta>>; recording?: Blob }) {
  const coaching = analysis.coaching;
  return <article className={`meta-coaching ${coaching.status}`}>
    <small>Meta coaching</small>
    <h3>{coaching.status === 'good_form' ? 'Good rep' : coaching.status === 'correction_needed' ? 'One adjustment for your next set' : 'We could not assess this rep reliably'}</h3>
    {recording && analysis.sam.boxes.length > 0 && <SamReplay video={recording} analysis={analysis} />}
    {coaching.positiveObservation && <p>{coaching.positiveObservation}</p>}
    {coaching.primaryCorrection && <p><strong>{coaching.primaryCorrection}</strong></p>}
    {coaching.nextSetGoal && <p>Next set: {coaching.nextSetGoal}</p>}
    {coaching.evidenceMetric && <small>Evidence: {coaching.evidenceMetric}</small>}
  </article>;
}

function SamReplay({ video, analysis }: { video: Blob; analysis: Awaited<ReturnType<typeof analyzeMovementWithMeta>> }) {
  const url = useMemo(() => URL.createObjectURL(video), [video]);
  const [time, setTime] = useState(0);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const box = analysis.sam.boxes.reduce((best, candidate) => Math.abs(candidate.timestampMs - time * 1000) < Math.abs(best.timestampMs - time * 1000) ? candidate : best, analysis.sam.boxes[0]);
  return <div className="sam-replay"><video src={url} muted playsInline controls onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} /><i style={{ left: `${box.x / analysis.sam.sourceWidth * 100}%`, top: `${box.y / analysis.sam.sourceHeight * 100}%`, width: `${box.width / analysis.sam.sourceWidth * 100}%`, height: `${box.height / analysis.sam.sourceHeight * 100}%` }} /><span>Tracked with SAM 3.1</span></div>;
}

