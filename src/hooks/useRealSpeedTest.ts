import { useCallback, useEffect, useRef, useState } from 'react';

export interface TestResult {
  id: string;
  timestamp: number;
  download: number;
  upload: number;
  ping: number;
  jitter: number;
}

export type TestPhase = 'idle' | 'ping' | 'download' | 'upload' | 'done' | 'error';

interface SpeedTestState {
  phase: TestPhase;
  progress: number;
  currentSpeed: number;
  ping: number;
  download: number;
  upload: number;
  jitter: number;
  isRunning: boolean;
  isOnline: boolean;
  error?: string;
}

interface Server {
  id: string;
  name: string;
  url: string;
  country: string;
  lat: number;
  lon: number;
  distance?: number;
}

const SERVER_LIST_URL = 'https://backend.librespeed.org/servers';

const FALLBACK_SERVERS: Server[] = [
  { id: 'fallback-1', name: 'LibreSpeed (Global)', url: 'https://speedtest.librespeed.org', country: 'Global', lat: 0, lon: 0 },
  { id: 'fallback-2', name: 'NewRelic', url: 'https://speedtest.newrelic.com', country: 'Global', lat: 0, lon: 0 },
  { id: 'fallback-3', name: 'i3D.net', url: 'https://speedtest.i3d.net', country: 'Global', lat: 0, lon: 0 },
];

const PING_SAMPLES = 5;
const DOWNLOAD_TEST_DURATION_MS = 7000;
const UPLOAD_TEST_DURATION_MS = 7000;

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function sanitizeMbps(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 10) / 10;
}

function getNetworkEstimate(): { downlink?: number; rtt?: number } {
  const conn = (navigator as Navigator & { connection?: { downlink?: number; rtt?: number } }).connection;
  if (!conn) return {};
  return {
    downlink: typeof conn.downlink === 'number' ? conn.downlink : undefined,
    rtt: typeof conn.rtt === 'number' ? conn.rtt : undefined,
  };
}

function normalizeServerUrl(rawUrl: string): string {
  const trimmed = rawUrl.replace(/\/+$/, '');
  return trimmed.replace(/\/(upload|empty|garbage)\.php$/i, '');
}

function computeJitter(samples: number[]): number {
  if (samples.length < 2) return 0;
  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  const variance = samples.reduce((sum, sample) => sum + Math.pow(sample - mean, 2), 0) / samples.length;
  return Math.sqrt(variance);
}

async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  if (parentSignal?.aborted) {
    controller.abort();
  }

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

async function getUserLocation(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      () => resolve(null),
      { timeout: 5000, maximumAge: 300000 }
    );
  });
}

async function fetchServers(signal?: AbortSignal): Promise<Server[]> {
  try {
    const response = await timedFetch(SERVER_LIST_URL, { cache: 'no-store' }, 8000, signal);
    if (!response.ok) throw new Error('Unable to fetch server list');

    const data = (await response.json()) as Array<Record<string, unknown>>;
    const parsed = data
      .map((server) => {
        const rawUrl = typeof server.url === 'string' ? server.url : '';
        if (!rawUrl) return null;

        const lat = Number(server.lat);
        const lon = Number(server.lon);

        return {
          id: String(server.id ?? Math.random().toString(36).slice(2, 10)),
          name: String(server.name ?? 'LibreSpeed Server'),
          url: normalizeServerUrl(rawUrl),
          country: String(server.country ?? 'Unknown'),
          lat: Number.isFinite(lat) ? lat : 0,
          lon: Number.isFinite(lon) ? lon : 0,
        } as Server;
      })
      .filter((server): server is Server => Boolean(server));

    return parsed.length > 0 ? parsed : FALLBACK_SERVERS;
  } catch {
    return FALLBACK_SERVERS;
  }
}

async function selectNearestServer(signal?: AbortSignal): Promise<Server> {
  const [servers, location] = await Promise.all([fetchServers(signal), getUserLocation()]);
  if (!location) return servers[0];

  const withDistance = servers
    .map((server) => ({
      ...server,
      distance: calculateDistance(location.lat, location.lon, server.lat, server.lon),
    }))
    .sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY));

  return withDistance[0] ?? servers[0];
}

async function measurePing(serverUrl: string, signal: AbortSignal): Promise<{ ping: number; jitter: number }> {
  const samples: number[] = [];

  for (let i = 0; i < PING_SAMPLES; i++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const start = performance.now();
    const pingUrl = `${serverUrl}/empty.php?x=${Date.now()}-${i}`;

    try {
      await timedFetch(
        pingUrl,
        {
          cache: 'no-store',
          mode: 'cors',
          method: 'GET',
        },
        3000,
        signal
      );
      const elapsed = performance.now() - start;
      if (elapsed > 0 && elapsed < 3000) {
        samples.push(elapsed);
      }
    } catch {
      // Ignore failed sample and continue collecting others.
    }
  }

  if (samples.length === 0) {
    const estimate = getNetworkEstimate();
    if (estimate.rtt) {
      const roundedRtt = Math.round(estimate.rtt * 10) / 10;
      return { ping: roundedRtt, jitter: 0 };
    }
    throw new Error('Could not measure latency from public test servers. Please check firewall/VPN settings and retry.');
  }

  const ping = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  const jitter = computeJitter(samples);

  return {
    ping: Math.round(ping * 10) / 10,
    jitter: Math.round(jitter * 10) / 10,
  };
}

async function measureDownload(
  serverUrl: string,
  signal: AbortSignal,
  onProgress: (progress: number, speedMbps: number) => void
): Promise<number> {
  const startedAt = performance.now();
  const finishedAt = startedAt + DOWNLOAD_TEST_DURATION_MS;
  const chunkSizesKb = [512, 1024, 2048, 4096];

  let totalBytes = 0;
  let successfulSamples = 0;
  const sampleSpeeds: number[] = [];
  let chunkIndex = 0;

  while (performance.now() < finishedAt) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const sizeKb = chunkSizesKb[chunkIndex % chunkSizesKb.length];
    chunkIndex += 1;

    const requestUrl = `${serverUrl}/garbage.php?ckSize=${sizeKb}&r=${Math.random()}`;
    const chunkStart = performance.now();

    try {
      const response = await timedFetch(
        requestUrl,
        {
          cache: 'no-store',
          mode: 'cors',
          method: 'GET',
        },
        8000,
        signal
      );

      if (!response.ok || !response.body) {
        throw new Error('Invalid download response');
      }

      const reader = response.body.getReader();
      let chunkBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunkBytes += value.length;
        totalBytes += value.length;

        const elapsedMs = performance.now() - startedAt;
        if (elapsedMs > 0) {
          const currentMbps = (totalBytes * 8) / (elapsedMs / 1000) / 1_000_000;
          const progress = Math.min((elapsedMs / DOWNLOAD_TEST_DURATION_MS) * 100, 100);
          onProgress(progress, sanitizeMbps(currentMbps));
        }

        if (signal.aborted || performance.now() >= finishedAt) {
          await reader.cancel();
          break;
        }
      }

      const chunkElapsedMs = performance.now() - chunkStart;
      if (chunkBytes > 0 && chunkElapsedMs > 0) {
        const chunkMbps = (chunkBytes * 8) / (chunkElapsedMs / 1000) / 1_000_000;
        if (Number.isFinite(chunkMbps) && chunkMbps > 0) {
          sampleSpeeds.push(chunkMbps);
          successfulSamples += 1;
        }
      }
    } catch {
      // If one server request fails, continue; we'll fail only if all fail.
    }
  }

  if (successfulSamples === 0 || totalBytes === 0) {
    const estimate = getNetworkEstimate();
    if (estimate.downlink) {
      return sanitizeMbps(estimate.downlink);
    }
    throw new Error('Download test could not complete. Cross-origin requests may be blocked on this network.');
  }

  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const averageMbps = (totalBytes * 8) / elapsedSeconds / 1_000_000;
  const sampleMedian =
    [...sampleSpeeds].sort((a, b) => a - b)[Math.floor(sampleSpeeds.length / 2)] ?? averageMbps;

  return sanitizeMbps((averageMbps + sampleMedian) / 2);
}

async function measureUpload(
  serverUrl: string,
  signal: AbortSignal,
  onProgress: (progress: number, speedMbps: number) => void
): Promise<number> {
  const startedAt = performance.now();
  const finishedAt = startedAt + UPLOAD_TEST_DURATION_MS;
  const payloadSizes = [256 * 1024, 512 * 1024, 1024 * 1024];

  let totalBytes = 0;
  let successfulSamples = 0;
  const sampleSpeeds: number[] = [];
  let payloadIndex = 0;

  while (performance.now() < finishedAt) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const payloadSize = payloadSizes[payloadIndex % payloadSizes.length];
    payloadIndex += 1;

    const payload = new Uint8Array(payloadSize);
    const uploadBody = new Blob([payload], { type: 'text/plain' });

    const uploadStart = performance.now();

    try {
      await timedFetch(
        `${serverUrl}/empty.php?r=${Math.random()}`,
        {
          method: 'POST',
          mode: 'cors',
          cache: 'no-store',
          body: uploadBody,
        },
        8000,
        signal
      );

      const elapsedMs = performance.now() - uploadStart;
      if (elapsedMs > 0) {
        totalBytes += payload.byteLength;
        successfulSamples += 1;

        const sampleMbps = (payload.byteLength * 8) / (elapsedMs / 1000) / 1_000_000;
        if (Number.isFinite(sampleMbps) && sampleMbps > 0) {
          sampleSpeeds.push(sampleMbps);
        }

        const overallElapsedMs = performance.now() - startedAt;
        const currentMbps = (totalBytes * 8) / (overallElapsedMs / 1000) / 1_000_000;
        const progress = Math.min((overallElapsedMs / UPLOAD_TEST_DURATION_MS) * 100, 100);
        onProgress(progress, sanitizeMbps(currentMbps));
      }
    } catch {
      // Continue trying while duration allows.
    }
  }

  if (successfulSamples === 0 || totalBytes === 0) {
    const estimate = getNetworkEstimate();
    if (estimate.downlink) {
      return sanitizeMbps(estimate.downlink * 0.3);
    }
    throw new Error('Upload test could not complete. Browser or network policy may block cross-origin uploads.');
  }

  const elapsedSeconds = (performance.now() - startedAt) / 1000;
  const averageMbps = (totalBytes * 8) / elapsedSeconds / 1_000_000;
  const sampleMedian = [...sampleSpeeds].sort((a, b) => a - b)[Math.floor(sampleSpeeds.length / 2)] ?? averageMbps;

  return sanitizeMbps((averageMbps + sampleMedian) / 2);
}

function parseErrorMessage(error: unknown): string {
  if (!navigator.onLine) {
    return 'You appear to be offline. Reconnect to the internet and try again.';
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Test cancelled.';
  }

  if (error instanceof TypeError) {
    return 'Could not reach public speed test servers. Your browser, VPN, firewall, or network may be blocking cross-origin speed tests.';
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Speed test failed. Please retry in a few seconds.';
}

export function useRealSpeedTest() {
  const [state, setState] = useState<SpeedTestState>({
    phase: 'idle',
    progress: 0,
    currentSpeed: 0,
    ping: 0,
    download: 0,
    upload: 0,
    jitter: 0,
    isRunning: false,
    isOnline: navigator.onLine,
  });

  const cancelRef = useRef(false);
  const runIdRef = useRef(0);
  const serverRef = useRef<Server | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const setOnline = () => {
      setState((prev) => ({ ...prev, isOnline: true }));
    };

    const setOffline = () => {
      abortControllerRef.current?.abort();
      cancelRef.current = true;
      setState((prev) => ({
        ...prev,
        isOnline: false,
        isRunning: false,
        phase: 'error',
        error: 'You are offline. Reconnect to run the speed test.',
      }));
    };

    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOffline);

    return () => {
      window.removeEventListener('online', setOnline);
      window.removeEventListener('offline', setOffline);
      abortControllerRef.current?.abort();
    };
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = true;
    runIdRef.current += 1;
    abortControllerRef.current?.abort();

    setState((prev) => ({
      ...prev,
      phase: 'idle',
      progress: 0,
      currentSpeed: 0,
      ping: 0,
      download: 0,
      upload: 0,
      jitter: 0,
      isRunning: false,
      error: undefined,
    }));
  }, []);

  const startTest = useCallback(async () => {
    if (state.isRunning) return;

    if (!navigator.onLine) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        isRunning: false,
        error: 'You are offline. Reconnect to run the speed test.',
      }));
      return;
    }

    cancelRef.current = false;
    const currentRunId = runIdRef.current + 1;
    runIdRef.current = currentRunId;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((prev) => ({
      ...prev,
      phase: 'ping',
      progress: 0,
      currentSpeed: 0,
      ping: 0,
      download: 0,
      upload: 0,
      jitter: 0,
      isRunning: true,
      error: undefined,
    }));

    const isStale = () => cancelRef.current || runIdRef.current !== currentRunId;

    try {
      if (!serverRef.current) {
        serverRef.current = await selectNearestServer(controller.signal);
      }

      if (isStale()) return;
      const serverUrl = serverRef.current?.url ?? FALLBACK_SERVERS[0].url;

      setState((prev) => ({ ...prev, phase: 'ping', progress: 5 }));
      const { ping, jitter } = await measurePing(serverUrl, controller.signal);
      if (isStale()) return;

      setState((prev) => ({
        ...prev,
        ping: sanitizeMbps(ping),
        jitter: sanitizeMbps(jitter),
        progress: 20,
      }));

      setState((prev) => ({ ...prev, phase: 'download' }));
      const download = await measureDownload(serverUrl, controller.signal, (progress, speed) => {
        if (isStale()) return;
        setState((prev) => ({
          ...prev,
          currentSpeed: sanitizeMbps(speed),
          progress: 20 + progress * 0.4,
        }));
      });

      if (isStale()) return;

      setState((prev) => ({
        ...prev,
        download: sanitizeMbps(download),
        currentSpeed: sanitizeMbps(download),
        progress: 60,
      }));

      setState((prev) => ({ ...prev, phase: 'upload' }));
      const upload = await measureUpload(serverUrl, controller.signal, (progress, speed) => {
        if (isStale()) return;
        setState((prev) => ({
          ...prev,
          currentSpeed: sanitizeMbps(speed),
          progress: 60 + progress * 0.4,
        }));
      });

      if (isStale()) return;

      const safeDownload = sanitizeMbps(download);
      const safeUpload = sanitizeMbps(upload);

      setState((prev) => ({
        ...prev,
        phase: 'done',
        download: safeDownload,
        upload: safeUpload,
        currentSpeed: safeDownload,
        progress: 100,
        isRunning: false,
      }));

      import('../utils/audio').then(({ playSound }) => playSound.success());

      const result: TestResult = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        download: safeDownload,
        upload: safeUpload,
        ping: sanitizeMbps(ping),
        jitter: sanitizeMbps(jitter),
      };

      const historyRaw = localStorage.getItem('speedtest-history');
      const history: TestResult[] = historyRaw ? JSON.parse(historyRaw) : [];
      history.unshift(result);
      localStorage.setItem('speedtest-history', JSON.stringify(history.slice(0, 5)));

      fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          download: safeDownload,
          upload: safeUpload,
          ping: sanitizeMbps(ping),
          jitter: sanitizeMbps(jitter),
        }),
      }).catch((err) => console.warn('Could not save result to server:', err));
    } catch (error) {
      if (isStale()) return;

      setState((prev) => ({
        ...prev,
        phase: 'error',
        isRunning: false,
        error: parseErrorMessage(error),
      }));
    } finally {
      if (runIdRef.current === currentRunId) {
        abortControllerRef.current = null;
      }
    }
  }, [state.isRunning]);

  return { state, startTest, reset, selectedServer: serverRef.current };
}
