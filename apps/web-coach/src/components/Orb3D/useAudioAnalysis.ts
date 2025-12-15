/**
 * Audio Analysis Hook for 3D Orb
 * 
 * Uses Web Audio API AnalyserNode for frequency analysis
 * with EMA (Exponential Moving Average) smoothing for organic motion.
 */

import { useEffect, useRef, useState } from 'react';

export interface AudioData {
  bass: number;      // 0-1: Low frequencies (20-200Hz) - drives scale/pulse
  mid: number;       // 0-1: Mid frequencies (200-2000Hz) - drives distortion
  high: number;      // 0-1: High frequencies (2000Hz+) - drives glow
  overall: number;   // 0-1: Overall volume level
}

// EMA Smoother class for organic motion
class EMASmoother {
  private value: number = 0;
  private factor: number;
  
  constructor(factor: number = 0.85) {
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

export function useAudioAnalysis(stream: MediaStream | null): AudioData {
  const [audioData, setAudioData] = useState<AudioData>({
    bass: 0,
    mid: 0,
    high: 0,
    overall: 0,
  });
  
  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  
  // Smoothers for each frequency band - different responsiveness
  const smoothersRef = useRef({
    bass: new EMASmoother(0.8),     // Snappier for punch
    mid: new EMASmoother(0.85),     // Balanced
    high: new EMASmoother(0.88),    // Smoother for shimmer
    overall: new EMASmoother(0.82), // Overall responsiveness
  });
  
  useEffect(() => {
    if (!stream) {
      // Reset when no stream
      setAudioData({ bass: 0, mid: 0, high: 0, overall: 0 });
      Object.values(smoothersRef.current).forEach(s => s.reset());
      return;
    }
    
    // Check if stream has audio tracks
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log('[AudioAnalysis] No audio tracks in stream');
      return;
    }
    
    console.log('[AudioAnalysis] 🎵 Setting up audio analysis for stream');
    
    // Create audio context
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextClass();
    audioContextRef.current = audioContext;
    
    // Create analyser
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512; // 256 frequency bins - good balance of speed and resolution
    analyser.smoothingTimeConstant = 0.4; // Some built-in smoothing
    analyserRef.current = analyser;
    
    // Create source from stream
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;
    
    // Create data array
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    dataArrayRef.current = dataArray;
    
    // Frequency bin calculation
    // AudioContext sample rate (browser default, typically 48000Hz)
    // Note: LiveKit audio tracks are captured at 24kHz for optimal Deepgram quality
    // AudioContext automatically resamples for analysis
    // With fftSize 512, each bin = sampleRate / fftSize = ~94Hz
    const sampleRate = audioContext.sampleRate;
    const binSize = sampleRate / analyser.fftSize;
    
    // Calculate bin ranges for frequency bands
    const bassEnd = Math.floor(200 / binSize);      // 0-200Hz
    const midEnd = Math.floor(2000 / binSize);      // 200-2000Hz
    const highEnd = Math.floor(8000 / binSize);     // 2000-8000Hz
    
    console.log('[AudioAnalysis] Frequency bins:', { 
      sampleRate, 
      binSize: binSize.toFixed(1), 
      bassEnd, 
      midEnd, 
      highEnd,
      totalBins: analyser.frequencyBinCount 
    });
    
    // Animation loop
    const tick = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;
      
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average for each frequency band
      let bassSum = 0;
      let midSum = 0;
      let highSum = 0;
      let overallSum = 0;
      
      for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i] / 255; // Normalize to 0-1
        overallSum += value;
        
        if (i < bassEnd) {
          bassSum += value;
        } else if (i < midEnd) {
          midSum += value;
        } else if (i < highEnd) {
          highSum += value;
        }
      }
      
      // Calculate averages
      const rawBass = bassEnd > 0 ? bassSum / bassEnd : 0;
      const rawMid = midEnd > bassEnd ? midSum / (midEnd - bassEnd) : 0;
      const rawHigh = highEnd > midEnd ? highSum / (highEnd - midEnd) : 0;
      const rawOverall = dataArray.length > 0 ? overallSum / dataArray.length : 0;
      
      // Apply EMA smoothing
      const smoothers = smoothersRef.current;
      const smoothedData: AudioData = {
        bass: smoothers.bass.smooth(rawBass),
        mid: smoothers.mid.smooth(rawMid),
        high: smoothers.high.smooth(rawHigh),
        overall: smoothers.overall.smooth(rawOverall),
      };
      
      setAudioData(smoothedData);
      rafRef.current = requestAnimationFrame(tick);
    };
    
    // Resume audio context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        console.log('[AudioAnalysis] AudioContext resumed');
        rafRef.current = requestAnimationFrame(tick);
      });
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
    
    // Cleanup
    return () => {
      console.log('[AudioAnalysis] 🔇 Cleaning up audio analysis');
      
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
  }, [stream]);
  
  return audioData;
}

export default useAudioAnalysis;
