import { useState, useCallback, useRef, useEffect } from 'react';
import { Room } from 'livekit-client';
import { connectToRoomAsListener, disconnectFromRoom } from '@/services/livekit';

interface AudioTrack {
  participantId: string;
  track: MediaStreamTrack;
  audioLevel: number;
}

export function useAudioMonitor(roomId: string | null) {
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const roomRef = useRef<Room | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<Map<string, AnalyserNode>>(new Map());
  
  const startListening = useCallback(async () => {
    if (!roomId || isListening || isConnecting) return;
    
    setIsConnecting(true);
    setError(null);
    
    try {
      // Create audio context for visualization
      audioContextRef.current = new AudioContext();
      
      const room = await connectToRoomAsListener(roomId, (track, participantId) => {
        const audioContext = audioContextRef.current;
        if (!audioContext) return;
        
        // Create audio source and analyser for visualization
        const stream = new MediaStream([track]);
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        
        // Connect to destination to actually hear the audio
        const destination = audioContext.destination;
        source.connect(destination);
        
        analyserRef.current.set(participantId, analyser);
        
        setAudioTracks((prev) => [
          ...prev.filter((t) => t.participantId !== participantId),
          { participantId, track, audioLevel: 0 },
        ]);
      });
      
      roomRef.current = room;
      setIsListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      console.error('Failed to start listening:', err);
    } finally {
      setIsConnecting(false);
    }
  }, [roomId, isListening, isConnecting]);
  
  const stopListening = useCallback(() => {
    if (roomRef.current) {
      disconnectFromRoom(roomRef.current);
      roomRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyserRef.current.clear();
    setAudioTracks([]);
    setIsListening(false);
  }, []);
  
  // Update audio levels periodically
  useEffect(() => {
    if (!isListening) return;
    
    const updateLevels = () => {
      setAudioTracks((prev) =>
        prev.map((track) => {
          const analyser = analyserRef.current.get(track.participantId);
          if (!analyser) return track;
          
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);
          
          const average = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
          return { ...track, audioLevel: average / 255 };
        })
      );
    };
    
    const interval = setInterval(updateLevels, 100);
    return () => clearInterval(interval);
  }, [isListening]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);
  
  return {
    isListening,
    isConnecting,
    audioTracks,
    error,
    startListening,
    stopListening,
  };
}
