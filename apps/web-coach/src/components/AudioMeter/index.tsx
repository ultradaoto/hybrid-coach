/**
 * AudioMeter Component
 * 
 * Visual audio level meter with color-coded volume indicator.
 * Shows real-time audio level with warnings for peaking and low volume.
 */

import React from 'react';
import { useAudioLevel } from './useAudioLevel';
import './styles.css';

export interface AudioMeterProps {
  /** Audio stream to monitor */
  stream: MediaStream | null;
  /** Label to display */
  label?: string;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Sensitivity multiplier (default: 1.0) */
  sensitivity?: number;
  /** Show numeric value */
  showValue?: boolean;
}

export function AudioMeter({ 
  stream, 
  label, 
  size = 'medium',
  sensitivity = 1.0,
  showValue = false,
}: AudioMeterProps) {
  const audioLevel = useAudioLevel(stream, { sensitivity });
  
  // Determine color based on volume level
  const getColor = (): string => {
    if (!audioLevel.isActive) return '#444'; // Gray when silent
    if (audioLevel.isPeaking) return '#ef4444'; // Red when peaking
    if (audioLevel.isTooQuiet) return '#fbbf24'; // Yellow when too quiet
    if (audioLevel.volume > 0.65) return '#fb923c'; // Orange when getting loud
    return '#10b981'; // Green when normal
  };
  
  const getStatusText = (): string | null => {
    if (!audioLevel.isActive) return null;
    if (audioLevel.isPeaking) return '⚠️ Too Loud';
    if (audioLevel.isTooQuiet) return '🔉 Low Volume';
    return null;
  };
  
  const color = getColor();
  const statusText = getStatusText();
  const volumePercent = audioLevel.volume * 100;
  const peakPercent = audioLevel.peak * 100;
  
  return (
    <div className={`audio-meter audio-meter-${size}`}>
      {label && (
        <div className="audio-meter-label">
          {label}
          {showValue && audioLevel.isActive && (
            <span className="audio-meter-value">
              {volumePercent.toFixed(0)}%
            </span>
          )}
        </div>
      )}
      
      <div className="audio-meter-bar-container">
        {/* Background track */}
        <div className="audio-meter-track" />
        
        {/* Peak indicator (thin line showing recent peak) */}
        {audioLevel.peak > 0.1 && (
          <div 
            className="audio-meter-peak"
            style={{
              left: `${peakPercent}%`,
              borderColor: audioLevel.isPeaking ? '#ef4444' : '#fff',
            }}
          />
        )}
        
        {/* Current level bar */}
        <div 
          className="audio-meter-fill"
          style={{
            width: `${volumePercent}%`,
            backgroundColor: color,
            boxShadow: audioLevel.isActive ? `0 0 8px ${color}` : 'none',
          }}
        />
        
        {/* Threshold markers */}
        <div className="audio-meter-threshold" style={{ left: '15%' }} title="Low threshold" />
        <div className="audio-meter-threshold" style={{ left: '85%' }} title="Peak threshold" />
      </div>
      
      {/* Status warning text */}
      {statusText && (
        <div 
          className="audio-meter-status"
          style={{ color }}
        >
          {statusText}
        </div>
      )}
    </div>
  );
}

export default AudioMeter;
