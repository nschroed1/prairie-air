import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FlightVideoRecorder,
  isVideoRecordingSupported,
  getSupportedVideoMimeType,
} from '../lib/video-recorder';

void test('video recording support detects environment safely in headless Node', () => {
  // In headless Node without DOM/MediaRecorder, isVideoRecordingSupported returns false safely
  assert.equal(typeof isVideoRecordingSupported(), 'boolean');
  assert.equal(isVideoRecordingSupported(), false);
  assert.equal(getSupportedVideoMimeType(), '');
});

void test('FlightVideoRecorder initializes in idle state and manages lifecycle safely', async () => {
  const recorder = new FlightVideoRecorder();
  assert.equal(recorder.getState(), 'idle');
  assert.equal(recorder.isRecording(), false);
  assert.equal(recorder.getElapsedMs(), 0);
  assert.equal(recorder.getLatestBlob(), null);

  // Calling start in unsupported environment safely returns false
  const fakeCanvas = {} as HTMLCanvasElement;
  const started = recorder.start(fakeCanvas);
  assert.equal(started, false);
  assert.equal(recorder.isRecording(), false);

  // Stop safely resolves to null
  const blob = await recorder.stop();
  assert.equal(blob, null);

  // Download safely returns false without blob
  const downloaded = recorder.downloadLatestClip();
  assert.equal(downloaded, false);

  recorder.dispose();
  assert.equal(recorder.getState(), 'idle');
});
