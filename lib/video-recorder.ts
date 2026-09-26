/**
 * In-browser canvas video and game audio recorder for Prairie Air.
 * Captures WebGL gameplay at up to 60 FPS with synchronized engine, wind,
 * spray, stunt fanfare and soundtrack audio.
 */

export type RecordingState = 'idle' | 'recording' | 'stopping';

export interface RecorderOptions {
  fps?: number;
  videoBitsPerSecond?: number;
  onStateChange?: (state: RecordingState, elapsedMs: number) => void;
}

export function isVideoRecordingSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const hasCanvasCapture =
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof (HTMLCanvasElement.prototype as unknown as { captureStream?: unknown })
      .captureStream === 'function';
  const hasMediaRecorder = typeof window.MediaRecorder === 'function';
  return Boolean(hasCanvasCapture && hasMediaRecorder);
}

export function getSupportedVideoMimeType(): string {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') {
    return '';
  }
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
  ];
  for (const candidate of candidates) {
    if (window.MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return '';
}

export class FlightVideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private state: RecordingState = 'idle';
  private startTime = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private autoStopTimerId: ReturnType<typeof setTimeout> | null = null;
  private latestBlob: Blob | null = null;
  private latestUrl: string | null = null;
  private currentMimeType = '';

  constructor(private options: RecorderOptions = {}) {}

  getState(): RecordingState {
    return this.state;
  }

  isRecording(): boolean {
    return this.state === 'recording';
  }

  getElapsedMs(): number {
    return this.startTime > 0 ? Date.now() - this.startTime : 0;
  }

  getLatestBlob(): Blob | null {
    return this.latestBlob;
  }

  start(
    canvas: HTMLCanvasElement,
    audioStream?: MediaStream | null,
    maxDurationSeconds?: number,
  ): boolean {
    if (this.state !== 'idle' || !isVideoRecordingSupported()) {
      return false;
    }

    try {
      const fps = this.options.fps ?? 60;
      const canvasStream = (
        canvas as unknown as { captureStream: (fps: number) => MediaStream }
      ).captureStream(fps);

      if (!canvasStream) return false;

      // Merge video track and optional audio tracks
      const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
      if (audioStream) {
        for (const audioTrack of audioStream.getAudioTracks()) {
          tracks.push(audioTrack);
        }
      }

      const combinedStream = new MediaStream(tracks);
      const mimeType = getSupportedVideoMimeType();
      this.currentMimeType = mimeType;

      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: this.options.videoBitsPerSecond ?? 6_000_000,
      };
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }

      this.mediaRecorder = new MediaRecorder(combinedStream, recorderOptions);
      this.recordedChunks = [];
      this.startTime = Date.now();
      this.state = 'recording';

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      // Request data slices every 1000ms for responsiveness
      this.mediaRecorder.start(1000);

      this.timerId = setInterval(() => {
        if (this.state === 'recording') {
          this.options.onStateChange?.(this.state, this.getElapsedMs());
        }
      }, 250);

      if (maxDurationSeconds && maxDurationSeconds > 0) {
        this.autoStopTimerId = setTimeout(() => {
          if (this.isRecording()) {
            void this.stop();
          }
        }, maxDurationSeconds * 1000);
      }

      this.options.onStateChange?.(this.state, 0);
      return true;
    } catch (err) {
      console.warn('FlightVideoRecorder: Failed to start recording', err);
      this.cleanup();
      return false;
    }
  }

  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.state !== 'recording') {
        resolve(this.latestBlob);
        return;
      }

      this.state = 'stopping';
      this.clearTimers();

      this.mediaRecorder.onstop = () => {
        try {
          const type = this.currentMimeType || 'video/webm';
          const blob = new Blob(this.recordedChunks, { type });
          this.latestBlob = blob;

          if (this.latestUrl && typeof URL !== 'undefined') {
            URL.revokeObjectURL(this.latestUrl);
          }
          if (typeof URL !== 'undefined') {
            this.latestUrl = URL.createObjectURL(blob);
          }

          this.state = 'idle';
          this.options.onStateChange?.(this.state, 0);
          resolve(blob);
        } catch (err) {
          console.warn('FlightVideoRecorder: Failed to finalize blob', err);
          this.state = 'idle';
          resolve(null);
        } finally {
          this.cleanup();
        }
      };

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        console.warn('FlightVideoRecorder: Error calling stop()', err);
        this.cleanup();
        resolve(null);
      }
    });
  }

  downloadLatestClip(filenamePrefix = 'prairie-air-highlight'): boolean {
    if (!this.latestBlob || typeof document === 'undefined') return false;

    try {
      const ext = this.currentMimeType.includes('mp4') ? 'mp4' : 'webm';
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19);
      const filename = `${filenamePrefix}_${timestamp}.${ext}`;

      const url = this.latestUrl || URL.createObjectURL(this.latestBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
      }, 100);
      return true;
    } catch (err) {
      console.warn('FlightVideoRecorder: Failed to trigger download', err);
      return false;
    }
  }

  private clearTimers(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.autoStopTimerId) {
      clearTimeout(this.autoStopTimerId);
      this.autoStopTimerId = null;
    }
  }

  private cleanup(): void {
    this.clearTimers();
    this.mediaRecorder = null;
    this.state = 'idle';
  }

  dispose(): void {
    this.cleanup();
    if (this.latestUrl && typeof URL !== 'undefined') {
      URL.revokeObjectURL(this.latestUrl);
      this.latestUrl = null;
    }
    this.latestBlob = null;
  }
}
