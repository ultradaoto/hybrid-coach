interface AudioVisualizerProps {
  audioLevels: number[];
}

export default function AudioVisualizer({ audioLevels }: AudioVisualizerProps) {
  return (
    <div className="flex items-end justify-center gap-1 h-8">
      {audioLevels.map((level, i) => (
        <div
          key={i}
          className="w-1 bg-admin-accent rounded-full transition-all duration-100"
          style={{ height: `${Math.max(level * 100, 4)}%` }}
        />
      ))}
    </div>
  );
}
