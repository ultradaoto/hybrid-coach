/**
 * useLiveKitRoom Hook
 * 
 * Reusable hook for LiveKit room connections.
 * Provides participant tracking, audio/video controls, and stream access.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  Participant,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  ConnectionState,
} from 'livekit-client';

// =============================================================================
// Types
// =============================================================================

export interface ParticipantInfo {
  identity: string;
  name: string;
  isSpeaking: boolean;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
  isLocal: boolean;
  metadata?: string;
}

export interface UseLiveKitRoomOptions {
  url: string;
  token: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onParticipantJoined?: (participant: ParticipantInfo) => void;
  onParticipantLeft?: (identity: string) => void;
  onError?: (error: Error) => void;
  onDataReceived?: (payload: Uint8Array, participant: RemoteParticipant | undefined) => void;
}

export interface UseLiveKitRoomReturn {
  room: Room | null;
  connectionState: ConnectionState;
  localParticipant: ParticipantInfo | null;
  remoteParticipants: Map<string, ParticipantInfo>;
  connect: () => Promise<void>;
  disconnect: () => void;
  toggleAudio: () => Promise<void>;
  toggleVideo: () => Promise<void>;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  getParticipantAudioStream: (identity: string) => MediaStream | null;
  publishData: (data: Uint8Array | string, options?: { reliable?: boolean }) => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useLiveKitRoom(options: UseLiveKitRoomOptions): UseLiveKitRoomReturn {
  const {
    url,
    token,
    onConnected,
    onDisconnected,
    onParticipantJoined,
    onParticipantLeft,
    onError,
    onDataReceived,
  } = options;

  // Store callbacks in refs to avoid dependency issues
  const callbacksRef = useRef({
    onConnected,
    onDisconnected,
    onParticipantJoined,
    onParticipantLeft,
    onError,
    onDataReceived,
  });
  
  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = {
      onConnected,
      onDisconnected,
      onParticipantJoined,
      onParticipantLeft,
      onError,
      onDataReceived,
    };
  }, [onConnected, onDisconnected, onParticipantJoined, onParticipantLeft, onError, onDataReceived]);

  const roomRef = useRef<Room | null>(null);
  const connectingRef = useRef(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [localParticipant, setLocalParticipant] = useState<ParticipantInfo | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, ParticipantInfo>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  // Convert LiveKit participant to our ParticipantInfo
  const toParticipantInfo = useCallback((participant: Participant, isLocal: boolean): ParticipantInfo => {
    let audioTrack: MediaStreamTrack | null = null;
    let videoTrack: MediaStreamTrack | null = null;

    participant.trackPublications.forEach((pub) => {
      if (pub.track) {
        if (pub.track.kind === Track.Kind.Audio) {
          audioTrack = pub.track.mediaStreamTrack;
        } else if (pub.track.kind === Track.Kind.Video) {
          videoTrack = pub.track.mediaStreamTrack;
        }
      }
    });

    return {
      identity: participant.identity,
      name: participant.name || participant.identity,
      isSpeaking: participant.isSpeaking,
      audioTrack,
      videoTrack,
      isLocal,
      metadata: participant.metadata,
    };
  }, []);

  // Update remote participants map
  const updateRemoteParticipants = useCallback(() => {
    if (!roomRef.current) return;

    const newMap = new Map<string, ParticipantInfo>();
    roomRef.current.remoteParticipants.forEach((participant) => {
      newMap.set(participant.identity, toParticipantInfo(participant, false));
    });
    setRemoteParticipants(newMap);
  }, [toParticipantInfo]);

  // Disconnect from room
  const disconnect = useCallback(() => {
    if (roomRef.current) {
      console.log('[LiveKit] Disconnecting...');
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    connectingRef.current = false;
    setConnectionState(ConnectionState.Disconnected);
    setLocalParticipant(null);
    setRemoteParticipants(new Map());
    setIsAudioEnabled(false);
    setIsVideoEnabled(false);
  }, []);

  // Connect to room - stable callback that only depends on url/token
  const connect = useCallback(async () => {
    if (!url || !token) {
      console.log('[LiveKit] Missing url or token');
      return;
    }

    // Prevent concurrent connection attempts
    if (connectingRef.current) {
      console.log('[LiveKit] Already connecting, skipping...');
      return;
    }

    // If already connected with the same room, skip
    if (roomRef.current?.state === ConnectionState.Connected) {
      console.log('[LiveKit] Already connected');
      return;
    }

    // If there's an existing room in a different state, disconnect first
    if (roomRef.current) {
      console.log('[LiveKit] Cleaning up existing room before reconnect');
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    connectingRef.current = true;
    console.log('[LiveKit] Connecting to:', url);

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: { width: 640, height: 480, frameRate: 24 },
      },
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    roomRef.current = room;

    // Set up event listeners
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log('[LiveKit] Connection state:', state);
      setConnectionState(state);

      if (state === ConnectionState.Connected) {
        connectingRef.current = false;
        callbacksRef.current.onConnected?.();
      } else if (state === ConnectionState.Disconnected) {
        connectingRef.current = false;
        callbacksRef.current.onDisconnected?.();
      }
    });

    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log('[LiveKit] Participant joined:', participant.identity);
      updateRemoteParticipants();
      callbacksRef.current.onParticipantJoined?.(toParticipantInfo(participant, false));
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log('[LiveKit] Participant left:', participant.identity);
      updateRemoteParticipants();
      callbacksRef.current.onParticipantLeft?.(participant.identity);
    });

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log('[LiveKit] Track subscribed from', participant.identity, {
        kind: track.kind,
        sid: track.sid,
        hasMediaStreamTrack: !!track.mediaStreamTrack,
      });
      
      // For audio tracks, ensure they're attached so we can access mediaStreamTrack
      if (track.kind === Track.Kind.Audio) {
        const audioElements = track.attachedElements;
        if (!audioElements || audioElements.length === 0) {
          console.log('[LiveKit] 🔊 Attaching audio track from', participant.identity);
          track.attach();
        }
      }
      
      // For video tracks, also attach to ensure mediaStreamTrack is available
      if (track.kind === Track.Kind.Video) {
        const videoElements = track.attachedElements;
        if (!videoElements || videoElements.length === 0) {
          console.log('[LiveKit] 📹 Attaching video track from', participant.identity);
          track.attach();
        }
      }
      
      // Small delay to allow track to be fully initialized
      setTimeout(() => {
        updateRemoteParticipants();
      }, 100);
    });

    room.on(RoomEvent.TrackUnsubscribed, (_track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log('[LiveKit] Track unsubscribed from', participant.identity);
      updateRemoteParticipants();
    });

    // Handle track muted/unmuted events to update participant state
    room.on(RoomEvent.TrackMuted, (_publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log('[LiveKit] Track muted from', participant.identity);
      updateRemoteParticipants();
    });

    room.on(RoomEvent.TrackUnmuted, (_publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log('[LiveKit] Track unmuted from', participant.identity);
      updateRemoteParticipants();
    });

    room.on(RoomEvent.ActiveSpeakersChanged, () => {
      updateRemoteParticipants();
      if (room.localParticipant) {
        setLocalParticipant(toParticipantInfo(room.localParticipant, true));
      }
    });

    room.on(RoomEvent.LocalTrackPublished, () => {
      if (room.localParticipant) {
        setLocalParticipant(toParticipantInfo(room.localParticipant, true));
      }
    });

    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
      callbacksRef.current.onDataReceived?.(payload, participant);
    });

    try {
      // Connect to room with timeout
      console.log('[LiveKit] Attempting connection...');
      await room.connect(url, token, {
        autoSubscribe: true,
      });
      console.log('[LiveKit] Connected to room:', room.name);

      // Enable camera and microphone
      try {
        await room.localParticipant.enableCameraAndMicrophone();
        console.log('[LiveKit] Camera and microphone enabled');
      } catch (mediaError) {
        console.warn('[LiveKit] Could not enable camera/mic:', mediaError);
        // Continue without media - user can enable later
      }

      setIsAudioEnabled(room.localParticipant.isMicrophoneEnabled);
      setIsVideoEnabled(room.localParticipant.isCameraEnabled);

      setLocalParticipant(toParticipantInfo(room.localParticipant, true));
      updateRemoteParticipants();

    } catch (error) {
      console.error('[LiveKit] Connection error:', error);
      connectingRef.current = false;
      
      // Clean up failed room
      roomRef.current = null;
      room.disconnect();
      setLocalParticipant(null);
      setRemoteParticipants(new Map());
      
      callbacksRef.current.onError?.(error as Error);
    }
  }, [url, token, toParticipantInfo, updateRemoteParticipants]);

  // Toggle audio
  const toggleAudio = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;

    const enabled = roomRef.current.localParticipant.isMicrophoneEnabled;
    await roomRef.current.localParticipant.setMicrophoneEnabled(!enabled);
    setIsAudioEnabled(!enabled);
  }, []);

  // Toggle video
  const toggleVideo = useCallback(async () => {
    if (!roomRef.current?.localParticipant) return;

    const enabled = roomRef.current.localParticipant.isCameraEnabled;
    await roomRef.current.localParticipant.setCameraEnabled(!enabled);
    setIsVideoEnabled(!enabled);
  }, []);

  // Store audio streams we've captured for Orb visualization
  const capturedStreamsRef = useRef<Map<string, MediaStream>>(new Map());

  // Get audio stream for a participant (for Orb visualization)
  const getParticipantAudioStream = useCallback((identity: string): MediaStream | null => {
    if (!roomRef.current) {
      console.log('[LiveKit] getParticipantAudioStream: no room');
      return null;
    }

    // Check if we already have a captured stream for this participant
    const existingStream = capturedStreamsRef.current.get(identity);
    if (existingStream && existingStream.active) {
      return existingStream;
    }

    const participant = identity === roomRef.current.localParticipant?.identity
      ? roomRef.current.localParticipant
      : roomRef.current.remoteParticipants.get(identity);

    if (!participant) {
      console.log('[LiveKit] getParticipantAudioStream: participant not found:', identity);
      return null;
    }

    // Find audio track and try to get stream
    const publications: Array<{ track: typeof Track.prototype | null; isSubscribed: boolean }> = [];
    participant.trackPublications.forEach((pub) => {
      if (pub.track?.kind === Track.Kind.Audio) {
        publications.push({ track: pub.track, isSubscribed: pub.isSubscribed });
      }
    });

    for (const pub of publications) {
      if (!pub.track) continue;
      const track = pub.track;
      console.log('[LiveKit] getParticipantAudioStream: checking audio track', {
        identity,
        isSubscribed: pub.isSubscribed,
        hasMediaStreamTrack: !!track.mediaStreamTrack,
        trackSid: track.sid,
        attachedElementsCount: (track as any).attachedElements?.length ?? 0,
      });

      // Approach 1: Direct mediaStreamTrack property
      if (track.mediaStreamTrack) {
        console.log('[LiveKit] ✅ Method 1: Using mediaStreamTrack for', identity);
        const stream = new MediaStream([track.mediaStreamTrack]);
        capturedStreamsRef.current.set(identity, stream);
        return stream;
      }

      // Approach 2: Get from attached audio element
      const attachedElements = (track as any).attachedElements as HTMLMediaElement[] | undefined;
      if (attachedElements && attachedElements.length > 0) {
        const audioElement = attachedElements[0];
        
        // Try srcObject first
        if (audioElement.srcObject instanceof MediaStream) {
          console.log('[LiveKit] ✅ Method 2: Using attached element srcObject for', identity);
          capturedStreamsRef.current.set(identity, audioElement.srcObject);
          return audioElement.srcObject;
        }
        
        // Try captureStream() - captures audio from playing element
        if ('captureStream' in audioElement) {
          try {
            const captured = (audioElement as any).captureStream() as MediaStream;
            if (captured && captured.getAudioTracks().length > 0) {
              console.log('[LiveKit] ✅ Method 3: Using captureStream() for', identity);
              capturedStreamsRef.current.set(identity, captured);
              return captured;
            }
          } catch (e) {
            console.log('[LiveKit] captureStream() failed:', e);
          }
        }
      }

      // Approach 3: Create our own audio element and attach
      console.log('[LiveKit] 🔧 Method 4: Creating new audio element for', identity);
      try {
        const newAudioEl = track.attach();
        if (newAudioEl.srcObject instanceof MediaStream) {
          console.log('[LiveKit] ✅ Method 4 success: Got stream from new attachment');
          capturedStreamsRef.current.set(identity, newAudioEl.srcObject);
          return newAudioEl.srcObject;
        }
        
        if ('captureStream' in newAudioEl) {
          // Ensure audio is playing
          newAudioEl.play().catch(() => {});
          const captured = (newAudioEl as any).captureStream() as MediaStream;
          if (captured) {
            console.log('[LiveKit] ✅ Method 4 success: Got stream via captureStream');
            capturedStreamsRef.current.set(identity, captured);
            return captured;
          }
        }
      } catch (e) {
        console.log('[LiveKit] Method 4 failed:', e);
      }
    }

    console.log('[LiveKit] ❌ No audio stream available for', identity);
    return null;
  }, []);

  // Publish data to room
  const publishData = useCallback((data: Uint8Array | string, options?: { reliable?: boolean }) => {
    if (!roomRef.current?.localParticipant) return;

    const payload = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    roomRef.current.localParticipant.publishData(payload, { reliable: options?.reliable ?? true });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    room: roomRef.current,
    connectionState,
    localParticipant,
    remoteParticipants,
    connect,
    disconnect,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
    getParticipantAudioStream,
    publishData,
  };
}

export default useLiveKitRoom;
