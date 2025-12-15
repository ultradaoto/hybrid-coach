/**
 * Audio Level Hook for Volume Meter
 * 
 * Monitors audio stream volume level for visual meter display.
 * Uses Web Audio API AnalyserNode with RMS (Root Mean Square) calculation
 * for accurate volume measurement.
 */

import { useEffect, useRef, useState } from 'react';

export interface AudioLevel {
  volume: number;      // 0-1: Current volume level (RMS)
  peak: number;        // 0-1: Peak level in last second
  isPeaking: boolean;  // True if volume > 0.85 (too loud)
  isTooQuiet: boolean; // True if volume < 0.15 (too quiet)
  isActive: boolean;   // True if any audio detected recently
}

// EMA Smoother for smooth volume transitions
class EMASmoother {
  private value: number = 0;
  private factor: number;
  
  constructor(factor: number = 0.7) {
    this.factor = factor;
  }
  
  smooth(input: number): number {
    this.value = this.factor * this.value + (1 - this.factor) * input;
    return this.value;
  }
  
  reset(): void {
    this.value = 0;
  }
}

export function useAudioLevel(
  stream: MediaStream | null,
  options: { sensitivity?: number } = {}
): AudioLevel {
  const { sensitivity = 1.0 } = options;
  
  const [audioLevel, setAudioLevel] = useState<AudioLevel>({
    volume: 0,
    peak: 0,
    isPeaking: false,
    isTooQuiet: false,
    isActive: false,
  });
  
  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const smootherRef = useRef(new EMASmoother(0.7));
  const peakRef = useRef(0);
  const peakDecayRef = useRef(0);
  
  useEffect(() => {
    if (!stream) {
      setAudioLevel({ 
        volume: 0, 
        peak: 0, 
        isPeaking: false, 
        isTooQuiet: false, 
        isActive: false 
      });
      smootherRef.current.reset();
      return;
    }
    
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      return;
    }
    
    // Create audio context
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextClass();
    audioContextRef.current = audioContext;
    
    // Create analyser with higher resolution for volume detection
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // Higher resolution for accurate RMS
    analyser.smoothingTimeConstant = 0.3;
    analyserRef.current = analyser;
    
    // Create source from stream
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;
    
    // Create data array for time domain (waveform) analysis
    const dataArray = new Uint8Array(analyser.fftSize);
    dataArrayRef.current = dataArray;
    
    // Animation loop
    const tick = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;
      
      // Get time domain data (waveform)
      analyser.getByteTimeDomainData(dataArray);
      
      // Calculate RMS (Root Mean Square) for accurate volume
      let sumOfSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128; // Convert to -1 to 1 range
        sumOfSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumOfSquares / dataArray.length);
      
      // Apply sensitivity multiplier
      const rawVolume = Math.min(1, rms * sensitivity * 3); // Scale up for visibility
      
      // Smooth the volume
      const smoothedVolume = smootherRef.current.smooth(rawVolume);
      
      // Track peak with slow decay
      if (rawVolume > peakRef.current) {
        peakRef.current = rawVolume;
        peakDecayRef.current = 0;
      } else {
        peakDecayRef.current++;
        if (peakDecayRef.current > 60) { // Decay after 1 second (assuming 60fps)
          peakRef.current *= 0.95; // Slow decay
        }
      }
      
      // Determine status
      const isPeaking = smoothedVolume > 0.85;
      const isTooQuiet = smoothedVolume < 0.15 && smoothedVolume > 0.01;
      const isActive = smoothedVolume > 0.01; // Any audio detected
      
      setAudioLevel({
        volume: smoothedVolume,
        peak: peakRef.current,
        isPeaking,
        isTooQuiet,
        isActive,
      });
      
      rafRef.current = requestAnimationFrame(tick);
    };
    
    // Resume audio context if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        rafRef.current = requestAnimationFrame(tick);
      });
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
    
    // Cleanup
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [stream, sensitivity]);
  
  return audioLevel;
}

export default useAudioLevel;
