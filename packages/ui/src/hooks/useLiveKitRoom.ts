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
  audioTrack: Track | null;  // LiveKit Track object (not MediaStreamTrack)
  videoTrack: Track | null;  // LiveKit Track object (not MediaStreamTrack)
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
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [localParticipant, setLocalParticipant] = useState<ParticipantInfo | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, ParticipantInfo>>(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  // Convert LiveKit participant to our ParticipantInfo
  const toParticipantInfo = useCallback((participant: Participant, isLocal: boolean): ParticipantInfo => {
    let audioTrack: Track | null = null;
    let videoTrack: Track | null = null;

    // Store LiveKit Track objects (not mediaStreamTrack) for proper lifecycle management
    participant.trackPublications.forEach((pub) => {
      if (pub.track) {
        if (pub.track.kind === Track.Kind.Audio) {
          audioTrack = pub.track;  // Store Track object
        } else if (pub.track.kind === Track.Kind.Video) {
          videoTrack = pub.track;  // Store Track object
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
    
    // Clean up managed audio elements
    audioElementsRef.current.forEach((el) => {
      el.pause();
      el.srcObject = null;
    });
    audioElementsRef.current.clear();
    
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
      
      // For audio tracks, create/reuse managed audio element for reliable stream access
      if (track.kind === Track.Kind.Audio) {
        let audioEl = audioElementsRef.current.get(participant.identity);
        if (!audioEl) {
          console.log('[LiveKit] 🔊 Creating audio element for', participant.identity);
          audioEl = document.createElement('audio');
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          audioElementsRef.current.set(participant.identity, audioEl);
        }
        
        // Use LiveKit's attach method
        track.attach(audioEl);
        audioEl.play().catch((e) => {
          console.warn('[LiveKit] Audio play failed for', participant.identity, ':', e.message);
        });
        
        console.log('[LiveKit] ✅ Audio attached for', participant.identity);
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
      }, 50);
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

  // Get audio stream for a participant (for Orb visualization)
  // Uses managed audio elements for reliable stream access
  const getParticipantAudioStream = useCallback((identity: string): MediaStream | null => {
    // First check our managed audio elements - most reliable method
    const audioEl = audioElementsRef.current.get(identity);
    if (audioEl?.srcObject instanceof MediaStream && audioEl.srcObject.active) {
      console.log('[LiveKit] ✅ Audio stream from managed element for', identity);
      return audioEl.srcObject;
    }
    
    // Fallback: Get from room participant directly
    const room = roomRef.current;
    if (!room) {
      console.log('[LiveKit] getParticipantAudioStream: no room');
      return null;
    }
    
    const participant = room.remoteParticipants.get(identity);
    if (!participant) {
      console.log('[LiveKit] getParticipantAudioStream: participant not found:', identity);
      return null;
    }
    
    for (const pub of participant.trackPublications.values()) {
      if (pub.kind === Track.Kind.Audio && pub.track) {
        // Create stream from track
        const mediaStreamTrack = pub.track.mediaStreamTrack;
        if (mediaStreamTrack) {
          console.log('[LiveKit] ✅ Audio stream from mediaStreamTrack for', identity);
          return new MediaStream([mediaStreamTrack]);
        }
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
