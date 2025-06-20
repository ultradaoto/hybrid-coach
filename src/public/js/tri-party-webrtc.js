/**
 * TriPartyWebRTC - Client-side WebRTC implementation for 3-party mesh network
 * Supports Coach ↔ Client ↔ AI Orb connections
 */
export class TriPartyWebRTC {
    constructor(config) {
        this.roomId = config.roomId;
        this.userId = config.userId;
        this.userName = config.userName;
        this.userRole = config.userRole;
        this.participantType = config.participantType || 'human';
        
        this.peerConnections = new Map(); // peerId -> RTCPeerConnection
        this.remoteStreams = new Map(); // peerId -> MediaStream
        this.pendingCandidates = new Map(); // peerId -> ICE candidates array
        
        this.socket = null; // Socket.IO connection
        this.localStream = null;
        this.iceServers = null;
        
        // Callbacks
        this.onLocalStream = config.onLocalStream || (() => {});
        this.onRemoteStream = config.onRemoteStream || (() => {});
        this.onUserJoined = config.onUserJoined || (() => {});
        this.onUserLeft = config.onUserLeft || (() => {});
        this.onConnectionState = config.onConnectionState || (() => {});
        this.onError = config.onError || (() => {});
        this.onAIStatus = config.onAIStatus || (() => {});
        
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    /**
     * Initialize WebRTC connections
     */
    async initialize() {
        try {
            // Get ICE servers first
            await this.fetchIceServers();
            
            // Setup local media
            await this.setupLocalMedia();
            
            // Connect to Socket.IO
            this.connectSocket();
            
        } catch (err) {
            console.error('[TriPartyWebRTC] Initialization error:', err);
            this.onError('initialization', err);
        }
    }

    /**
     * Fetch TURN credentials from server
     */
    async fetchIceServers() {
        try {
            const response = await fetch('/api/turn-credentials');
            const data = await response.json();
            this.iceServers = data.iceServers;
            console.log('[TriPartyWebRTC] ICE servers loaded:', this.iceServers.length);
        } catch (err) {
            console.warn('[TriPartyWebRTC] Failed to fetch TURN credentials, using STUN only');
            this.iceServers = [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ];
        }
    }

    /**
     * Setup local media stream
     */
    async setupLocalMedia() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 640, max: 1280 },
                    height: { ideal: 480, max: 720 },
                    facingMode: 'user'
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.onLocalStream(this.localStream);
            
            console.log('[TriPartyWebRTC] Local media ready');
        } catch (err) {
            console.error('[TriPartyWebRTC] Failed to get local media:', err);
            // Continue without local stream for receive-only mode
            this.localStream = null;
        }
    }

    /**
     * Connect to Socket.IO server
     */
    connectSocket() {
        console.log('[TriPartyWebRTC] Connecting to Socket.IO...');
        
        // Connect to Socket.IO (global io should be available)
        this.socket = io({
            transports: ['polling'], // Use same transport as main server
            forceNew: true
        });
        
        this.socket.on('connect', () => {
            console.log('[TriPartyWebRTC] Socket.IO connected:', this.socket.id);
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            // Join room using Socket.IO room system
            this.socket.emit('join-room', {
                roomId: this.roomId,
                name: this.userName,
                userRole: this.userRole,
                participantType: this.participantType
            });
            
            this.onConnectionState('connected');
        });

        // Handle existing participants list
        this.socket.on('existing-participants', (participants) => {
            console.log('[TriPartyWebRTC] Existing participants:', participants);
            participants.forEach(async (participant) => {
                await this.handleUserJoined(participant);
            });
        });

        // Handle new user joining
        this.socket.on('user-joined', async (data) => {
            console.log('[TriPartyWebRTC] User joined:', data);
            await this.handleUserJoined(data);
        });

        // Handle WebRTC signaling
        this.socket.on('signal', async (data) => {
            console.log('[TriPartyWebRTC] Signal from', data.sender, ':', data.signal.type);
            await this.handleSignal(data);
        });

        // Handle room events
        this.socket.on('room-full', () => {
            console.error('[TriPartyWebRTC] Room is full');
            this.onError('room-full', new Error('Room is full'));
        });

        this.socket.on('room-start', (startTime) => {
            console.log('[TriPartyWebRTC] Room session started at:', new Date(startTime));
        });

        this.socket.on('connect_error', (error) => {
            console.error('[TriPartyWebRTC] Socket.IO connection error:', error);
            this.onError('connection', error);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[TriPartyWebRTC] Socket.IO disconnected:', reason);
            this.isConnected = false;
            this.onConnectionState('disconnected');
            
            // Attempt reconnection for certain disconnect reasons
            if (reason === 'io server disconnect') {
                // Server initiated disconnect, reconnect manually
                this.socket.connect();
            }
        });
    }

    /**
     * Handle user joining event
     */
    async handleUserJoined(data) {
        const { socketId, name, userRole, participantType, shouldCreateOffer } = data;
        
        console.log(`[TriPartyWebRTC] ${name} (${userRole}) joined, should create offer:`, shouldCreateOffer);
        
        // Call the onUserJoined callback
        this.onUserJoined({ userName: name, userRole, participantType });
        
        // Create peer connection
        const peerConnection = await this.createPeerConnection(socketId);
        
        // If we should create offer, initiate connection
        if (shouldCreateOffer) {
            console.log(`[TriPartyWebRTC] Creating offer for ${name}`);
            await this.createOffer(socketId);
        }
    }

    /**
     * Handle WebRTC signaling
     */
    async handleSignal(data) {
        const { sender, signal } = data;
        const peerConnection = this.peerConnections.get(sender);
        
        if (!peerConnection) {
            console.warn(`[TriPartyWebRTC] No peer connection for ${sender}, creating one`);
            await this.createPeerConnection(sender);
            return this.handleSignal(data); // Retry with new connection
        }
        
        try {
            if (signal.type === 'offer') {
                await peerConnection.setRemoteDescription(signal);
                await this.processBufferedCandidates(sender);
                
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                
                this.socket.emit('signal', {
                    target: sender,
                    signal: answer
                });
                
            } else if (signal.type === 'answer') {
                await peerConnection.setRemoteDescription(signal);
                await this.processBufferedCandidates(sender);
                
            } else if (signal.type === 'candidate' && signal.candidate) {
                if (peerConnection.remoteDescription) {
                    await peerConnection.addIceCandidate(signal);
                } else {
                    // Buffer candidates until remote description is set
                    this.bufferCandidate(sender, signal);
                }
            }
        } catch (err) {
            console.error('[TriPartyWebRTC] Signal handling error:', err);
        }
    }

    /**
     * Handle legacy WebSocket messages (for compatibility)
     */
    async handleWebSocketMessage(data) {
        console.log('[TriPartyWebRTC] Received:', data.type);
        
        switch (data.type) {
            case 'peer-discovery':
                await this.handlePeerDiscovery(data);
                break;
                
            case 'user-joined':
                await this.handleUserJoined(data);
                break;
                
            case 'offer':
                await this.handleOffer(data);
                break;
                
            case 'answer':
                await this.handleAnswer(data);
                break;
                
            case 'ice-candidate':
                await this.handleIceCandidate(data);
                break;
                
            case 'user-left':
                this.handleUserLeft(data);
                break;
                
            case 'ai_status':
                this.onAIStatus(data);
                break;
                
            case 'pong':
                // Heartbeat response
                break;
                
            default:
                console.log('[TriPartyWebRTC] Unhandled message type:', data.type);
        }
    }

    /**
     * Handle peer discovery (initial room state)
     */
    async handlePeerDiscovery(data) {
        console.log('[TriPartyWebRTC] Discovered peers:', data.peers);
        
        // Create connections to all existing peers
        for (const peer of data.peers) {
            await this.createPeerConnection(peer.userId, peer);
            
            // Check if we should create offer
            if (this.shouldCreateOffer(peer)) {
                console.log(`[TriPartyWebRTC] Creating offer to ${peer.userId}`);
                await this.createOffer(peer.userId);
            }
        }
    }

    /**
     * Handle new user joining
     */
    async handleUserJoined(data) {
        console.log('[TriPartyWebRTC] User joined:', data);
        
        this.onUserJoined({
            userId: data.userId,
            userName: data.userName,
            userRole: data.userRole,
            participantType: data.participantType
        });
        
        // Create peer connection
        await this.createPeerConnection(data.userId, data);
        
        // Create offer if instructed
        if (data.shouldCreateOffer) {
            console.log(`[TriPartyWebRTC] Creating offer to new user ${data.userId}`);
            await this.createOffer(data.userId);
        }
    }

    /**
     * Create peer connection to another participant
     */
    async createPeerConnection(peerId, peerInfo) {
        if (this.peerConnections.has(peerId)) {
            console.log(`[TriPartyWebRTC] Peer connection already exists for ${peerId}`);
            return this.peerConnections.get(peerId);
        }
        
        console.log(`[TriPartyWebRTC] Creating peer connection to ${peerId}`);
        
        const configuration = {
            iceServers: this.iceServers,
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };
        
        const pc = new RTCPeerConnection(configuration);
        this.peerConnections.set(peerId, pc);
        
        // Add local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                console.log(`[TriPartyWebRTC] Adding ${track.kind} track to ${peerId}`);
                pc.addTrack(track, this.localStream);
            });
        }
        
        // Handle remote stream
        pc.ontrack = (event) => {
            console.log(`[TriPartyWebRTC] Received ${event.track.kind} track from ${peerId}`);
            
            if (event.streams && event.streams[0]) {
                this.remoteStreams.set(peerId, event.streams[0]);
                this.onRemoteStream(peerId, event.streams[0], peerInfo);
            }
        };
        
        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('signal', {
                    target: peerId,
                    signal: {
                        type: 'candidate',
                        candidate: event.candidate.candidate,
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        sdpMid: event.candidate.sdpMid
                    }
                });
            }
        };
        
        // Monitor connection state
        pc.oniceconnectionstatechange = () => {
            console.log(`[TriPartyWebRTC] ICE state for ${peerId}:`, pc.iceConnectionState);
            
            if (pc.iceConnectionState === 'failed') {
                console.error(`[TriPartyWebRTC] Connection failed to ${peerId}`);
                this.handleConnectionFailure(peerId);
            }
        };
        
        pc.onconnectionstatechange = () => {
            console.log(`[TriPartyWebRTC] Connection state for ${peerId}:`, pc.connectionState);
        };
        
        // Process any pending ICE candidates
        const pendingCandidates = this.pendingCandidates.get(peerId);
        if (pendingCandidates) {
            console.log(`[TriPartyWebRTC] Processing ${pendingCandidates.length} pending candidates for ${peerId}`);
            for (const candidate of pendingCandidates) {
                await pc.addIceCandidate(candidate);
            }
            this.pendingCandidates.delete(peerId);
        }
        
        return pc;
    }

    /**
     * Create and send offer
     */
    async createOffer(peerId) {
        const pc = this.peerConnections.get(peerId);
        if (!pc) {
            console.error(`[TriPartyWebRTC] No peer connection for ${peerId}`);
            return;
        }
        
        try {
            const offer = await pc.createOffer({
                offerToReceiveVideo: true,
                offerToReceiveAudio: true
            });
            
            await pc.setLocalDescription(offer);
            
            this.socket.emit('signal', {
                target: peerId,
                signal: offer
            });
            
            console.log(`[TriPartyWebRTC] Sent offer to ${peerId}`);
        } catch (err) {
            console.error(`[TriPartyWebRTC] Failed to create offer for ${peerId}:`, err);
            this.onError('offer', err);
        }
    }

    /**
     * Handle incoming offer
     */
    async handleOffer(data) {
        const peerId = data.fromId;
        console.log(`[TriPartyWebRTC] Received offer from ${peerId}`);
        
        try {
            let pc = this.peerConnections.get(peerId);
            if (!pc) {
                // Create peer connection if it doesn't exist
                pc = await this.createPeerConnection(peerId, { userId: peerId });
            }
            
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            this.sendWebSocketMessage({
                type: 'answer',
                answer: answer,
                toId: peerId
            });
            
            console.log(`[TriPartyWebRTC] Sent answer to ${peerId}`);
        } catch (err) {
            console.error(`[TriPartyWebRTC] Failed to handle offer from ${peerId}:`, err);
            this.onError('answer', err);
        }
    }

    /**
     * Handle incoming answer
     */
    async handleAnswer(data) {
        const peerId = data.fromId;
        console.log(`[TriPartyWebRTC] Received answer from ${peerId}`);
        
        try {
            const pc = this.peerConnections.get(peerId);
            if (!pc) {
                console.error(`[TriPartyWebRTC] No peer connection for ${peerId}`);
                return;
            }
            
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (err) {
            console.error(`[TriPartyWebRTC] Failed to handle answer from ${peerId}:`, err);
            this.onError('answer', err);
        }
    }

    /**
     * Handle incoming ICE candidate
     */
    async handleIceCandidate(data) {
        const peerId = data.fromId;
        
        try {
            const pc = this.peerConnections.get(peerId);
            if (!pc) {
                // Store candidate for later if peer connection doesn't exist yet
                if (!this.pendingCandidates.has(peerId)) {
                    this.pendingCandidates.set(peerId, []);
                }
                this.pendingCandidates.get(peerId).push(new RTCIceCandidate(data.candidate));
                console.log(`[TriPartyWebRTC] Stored ICE candidate for ${peerId}`);
                return;
            }
            
            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
                // Store for later
                if (!this.pendingCandidates.has(peerId)) {
                    this.pendingCandidates.set(peerId, []);
                }
                this.pendingCandidates.get(peerId).push(new RTCIceCandidate(data.candidate));
            }
        } catch (err) {
            console.error(`[TriPartyWebRTC] Failed to add ICE candidate from ${peerId}:`, err);
        }
    }

    /**
     * Handle user leaving
     */
    handleUserLeft(data) {
        const userId = data.userId;
        console.log(`[TriPartyWebRTC] User left: ${userId}`);
        
        // Close and remove peer connection
        const pc = this.peerConnections.get(userId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(userId);
        }
        
        // Remove remote stream
        this.remoteStreams.delete(userId);
        
        // Clear any pending candidates
        this.pendingCandidates.delete(userId);
        
        // Notify callback
        this.onUserLeft(userId);
    }

    /**
     * Handle connection failure
     */
    async handleConnectionFailure(peerId) {
        console.log(`[TriPartyWebRTC] Attempting to restart connection to ${peerId}`);
        
        // Close existing connection
        const pc = this.peerConnections.get(peerId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(peerId);
        }
        
        // Wait a moment then recreate
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Recreate connection and offer
        await this.createPeerConnection(peerId, { userId: peerId });
        await this.createOffer(peerId);
    }

    /**
     * Determine if we should create offer to peer
     */
    shouldCreateOffer(peer) {
        // AI always receives offers
        if (peer.participantType === 'ai') return false;
        if (this.participantType === 'ai') return false;
        
        // Coach creates offer to client
        if (this.userRole === 'coach' && peer.userRole === 'client') return true;
        if (this.userRole === 'client' && peer.userRole === 'coach') return false;
        
        // Use ID comparison for same roles
        return this.userId < peer.userId;
    }

    /**
     * Send Socket.IO message (for AI control commands)
     */
    sendWebSocketMessage(data) {
        if (this.socket && this.socket.connected) {
            // For AI control messages, emit directly
            if (data.type === 'ai_control' || data.type === 'client_signal') {
                this.socket.emit(data.type, data);
            } else {
                console.warn('[TriPartyWebRTC] Unknown message type for Socket.IO:', data.type);
            }
        } else {
            console.error('[TriPartyWebRTC] Socket.IO not connected');
        }
    }

    /**
     * Toggle local video
     */
    toggleVideo(enabled) {
        if (this.localStream) {
            this.localStream.getVideoTracks().forEach(track => {
                track.enabled = enabled;
            });
        }
    }

    /**
     * Toggle local audio
     */
    toggleAudio(enabled) {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = enabled;
            });
        }
    }

    /**
     * Disconnect and cleanup
     */
    disconnect() {
        console.log('[TriPartyWebRTC] Disconnecting...');
        
        // Disconnect from Socket.IO
        if (this.socket && this.socket.connected) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        // Close all peer connections
        this.peerConnections.forEach((pc, peerId) => {
            console.log(`[TriPartyWebRTC] Closing connection to ${peerId}`);
            pc.close();
        });
        this.peerConnections.clear();
        
        // Stop local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        // Clear streams
        this.remoteStreams.clear();
        this.pendingCandidates.clear();
        
        this.isConnected = false;
        this.onConnectionState('disconnected');
    }

    /**
     * Get connection statistics
     */
    async getStats() {
        const stats = {
            connected: this.isConnected,
            peers: this.peerConnections.size,
            connections: {}
        };
        
        for (const [peerId, pc] of this.peerConnections) {
            stats.connections[peerId] = {
                iceConnectionState: pc.iceConnectionState,
                connectionState: pc.connectionState,
                signalingState: pc.signalingState
            };
            
            // Get detailed stats if needed
            try {
                const detailedStats = await pc.getStats();
                // Process stats as needed
            } catch (err) {
                console.error(`[TriPartyWebRTC] Failed to get stats for ${peerId}:`, err);
            }
        }
        
        return stats;
    }
}