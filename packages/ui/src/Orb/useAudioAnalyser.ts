import { useEffect, useRef, useState } from 'react';

export type AudioAnalyserState = {
  level: number;
};

export function useAudioAnalyser(stream: MediaStream | null) {
  const [state, setState] = useState<AudioAnalyserState>({ level: 0 });
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream) {
      setState({ level: 0 });
      return;
    }

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setState({ level: Math.min(1, Math.max(0, rms)) });
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      ctx.close().catch(() => undefined);
    };
  }, [stream]);

  return state;
}
