import { useMemo } from 'react';
import { useAudioAnalyser } from './useAudioAnalyser';

export type OrbProps = {
  stream?: MediaStream | null;
  size?: number;
  label?: string;
};

export function Orb({ stream = null, size = 140, label = 'Orb' }: OrbProps) {
  const { level } = useAudioAnalyser(stream);
  const glow = useMemo(() => 10 + level * 30, [level]);
  const scale = useMemo(() => 1 + level * 0.12, [level]);

  return (
    <div
      aria-label={label}
      style={{
        width: size,
        height: size,
        borderRadius: '9999px',
        background: 'radial-gradient(circle at 30% 30%, rgba(99,102,241,0.9), rgba(6,182,212,0.25) 55%, rgba(15,23,42,0.9) 100%)',
        boxShadow: `0 0 ${glow}px rgba(99,102,241,0.55), 0 0 ${glow * 0.6}px rgba(6,182,212,0.35)`,
        transform: `scale(${scale})`,
        transition: 'transform 80ms linear, box-shadow 80ms linear',
      }}
    />
  );
}
