# AI Avatar/Orb Visual Implementation - Code Extraction

This document contains the complete visual implementation of the AI avatar/orb from the Hybrid Coach application, extracted for GPU Claude integration.

## HTML Structure

The AI avatar is rendered within a video grid layout:

```html
<div class="video-wrapper" id="aiVideoWrapper">
    <div class="ai-avatar">
        <div class="ai-sphere" id="aiSphere"></div>
    </div>
    <div class="video-label">AI Coach Assistant</div>
</div>
```

**Key Elements:**
- `aiVideoWrapper` - Container with standard video wrapper styling
- `ai-avatar` - Main container with gradient background
- `aiSphere` - The animated sphere element (this is where GPU Claude's video would go)
- `video-label` - Label showing "AI Coach Assistant"

## CSS Styling & Animations

### Base Styles

```css
.ai-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(45deg, #667eea 0%, #764ba2 100%);
    position: relative;
    width: 100%;
    height: 100%;
}

.ai-sphere {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #ffffff, #667eea, #764ba2);
    animation: rotate 20s linear infinite;
    position: relative;
    transition: all 0.3s ease;
}
```

### State-Specific Styles

```css
.ai-sphere.speaking {
    animation: rotate 2s linear infinite, glow 0.8s ease-in-out infinite alternate, pulse-size 1.2s ease-in-out infinite alternate;
    background: radial-gradient(circle at 30% 30%, #ffffff, #17a2b8, #667eea, #764ba2);
}

.ai-sphere.listening {
    animation: rotate 20s linear infinite, subtle-glow 3s ease-in-out infinite alternate;
}

.ai-sphere.thinking {
    animation: rotate 5s linear infinite, thinking-pulse 1.5s ease-in-out infinite alternate;
    background: radial-gradient(circle at 30% 30%, #ffffff, #ffc107, #667eea, #764ba2);
}
```

### Keyframe Animations

```css
@keyframes rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

@keyframes glow {
    from { 
        box-shadow: 0 0 20px rgba(23, 162, 184, 0.5);
        filter: brightness(1);
    }
    to { 
        box-shadow: 0 0 40px rgba(23, 162, 184, 1), 0 0 60px rgba(23, 162, 184, 0.5);
        filter: brightness(1.3);
    }
}

@keyframes pulse-size {
    from { 
        transform: scale(1) rotate(0deg);
    }
    to { 
        transform: scale(1.1) rotate(180deg);
    }
}

@keyframes subtle-glow {
    from { 
        box-shadow: 0 0 10px rgba(102, 126, 234, 0.3);
    }
    to { 
        box-shadow: 0 0 20px rgba(102, 126, 234, 0.6);
    }
}

@keyframes thinking-pulse {
    from { 
        box-shadow: 0 0 15px rgba(255, 193, 7, 0.4);
        filter: brightness(1);
    }
    to { 
        box-shadow: 0 0 30px rgba(255, 193, 7, 0.8);
        filter: brightness(1.2);
    }
}
```

### Audio-Reactive Effects

```css
/* Audio-reactive visualization elements */
.ai-sphere::before {
    content: '';
    position: absolute;
    top: -10px;
    left: -10px;
    right: -10px;
    bottom: -10px;
    border-radius: 50%;
    background: radial-gradient(circle, transparent 60%, rgba(23, 162, 184, 0.1) 70%, transparent 80%);
    opacity: 0;
    transition: opacity 0.3s ease;
}

.ai-sphere.speaking::before {
    opacity: 1;
    animation: audio-ripple 1s ease-out infinite;
}

@keyframes audio-ripple {
    0% {
        transform: scale(0.8);
        opacity: 1;
    }
    100% {
        transform: scale(1.5);
        opacity: 0;
    }
}
```

### Ripple Animation (Dynamically Injected)

```css
@keyframes ripple-expand {
    0% {
        transform: translate(-50%, -50%) scale(0.8);
        opacity: 1;
    }
    100% {
        transform: translate(-50%, -50%) scale(2);
        opacity: 0;
    }
}
```

## JavaScript Control Functions

### Main Status Update Function

```javascript
function updateAIStatus(status, speaking = false) {
    const indicator = aiIndicator;  // AI status indicator dot
    const text = aiStatusText;      // AI status text
    const sphere = aiSphere;        // AI sphere element
    
    // Reset classes
    indicator.className = 'ai-indicator';
    sphere.className = 'ai-sphere';
    
    switch (status) {
        case 'speaking':
            indicator.classList.add('speaking');
            sphere.classList.add('speaking');
            text.textContent = 'AI Speaking';
            // Start real-time audio analysis for visual effects
            startAISpeechVisualization();
            break;
        case 'listening':
            sphere.classList.add('listening');
            text.textContent = 'AI Listening';
            stopAISpeechVisualization();
            break;
        case 'thinking':
            sphere.classList.add('thinking');
            text.textContent = 'AI Processing...';
            stopAISpeechVisualization();
            break;
        case 'paused':
            indicator.classList.add('paused');
            text.textContent = 'AI Paused - Coach Control';
            stopAISpeechVisualization();
            break;
        default:
            sphere.classList.add('listening');
            text.textContent = 'AI Ready';
            stopAISpeechVisualization();
    }
}
```

### Enhanced Speech Visualization

```javascript
// Audio visualization for AI speech
let aiAudioVisualizationInterval = null;

function startAISpeechVisualization() {
    stopAISpeechVisualization(); // Clear any existing interval
    
    // Enhanced visual effect during AI speech
    let intensity = 0;
    let direction = 1;
    
    aiAudioVisualizationInterval = setInterval(() => {
        intensity += direction * 0.1;
        
        if (intensity >= 1) {
            direction = -1;
        } else if (intensity <= 0.3) {
            direction = 1;
        }
        
        // Apply dynamic effects to the sphere
        aiSphere.style.filter = `brightness(${1 + intensity * 0.5}) saturate(${1 + intensity * 0.3})`;
        aiSphere.style.transform = `scale(${1 + intensity * 0.1}) rotate(${Date.now() / 20}deg)`;
        
        // Add ripple effect
        if (Math.random() > 0.7) {
            createAudioRipple();
        }
    }, 100);
}

function stopAISpeechVisualization() {
    if (aiAudioVisualizationInterval) {
        clearInterval(aiAudioVisualizationInterval);
        aiAudioVisualizationInterval = null;
    }
    
    // Reset sphere styling
    aiSphere.style.filter = '';
    aiSphere.style.transform = '';
}
```

### Dynamic Ripple Effects

```javascript
function createAudioRipple() {
    const ripple = document.createElement('div');
    ripple.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        width: 120px;
        height: 120px;
        border: 2px solid rgba(23, 162, 184, 0.6);
        border-radius: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        animation: ripple-expand 1.5s ease-out forwards;
    `;
    
    aiSphere.parentElement.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 1500);
}

// Add ripple animation to stylesheet
if (!document.getElementById('ripple-animation')) {
    const style = document.createElement('style');
    style.id = 'ripple-animation';
    style.textContent = `
        @keyframes ripple-expand {
            0% {
                transform: translate(-50%, -50%) scale(0.8);
                opacity: 1;
            }
            100% {
                transform: translate(-50%, -50%) scale(2);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}
```

## AI States and Visual Behaviors

### State Definitions

1. **`'listening'`** (Default/Ready)
   - Slow rotation (20s)
   - Subtle blue glow effect
   - Status: "AI Listening" or "AI Ready"

2. **`'thinking'`** (Processing)
   - Medium rotation (5s)
   - Yellow/gold coloring with pulsing
   - Status: "AI Processing..."

3. **`'speaking'`** (Active Speech)
   - Fast rotation (2s)
   - Bright blue/cyan glow with size pulsing
   - Dynamic brightness/saturation changes
   - Random ripple effects
   - Status: "AI Speaking"

4. **`'paused'`** (Coach Control)
   - No special sphere animation
   - Indicator shows paused state
   - Status: "AI Paused - Coach Control"

### Color Scheme

- **Base Colors**: Purple/blue gradient (`#667eea`, `#764ba2`)
- **Speaking**: Cyan accent (`#17a2b8`)
- **Thinking**: Yellow accent (`#ffc107`)
- **Background**: Dark gradient (`#667eea` to `#764ba2`)

## Integration Guide for GPU Claude

### Replacing the AI Sphere with Video Stream

To integrate GPU Claude's video stream while maintaining the visual effects:

1. **Replace the sphere with video element**:
   ```html
   <div class="ai-avatar">
       <video id="aiVideo" autoplay playsinline></video>
       <!-- Keep the sphere as overlay for effects -->
       <div class="ai-sphere ai-sphere-overlay" id="aiSphere"></div>
   </div>
   ```

2. **Add overlay styling**:
   ```css
   .ai-sphere-overlay {
       position: absolute;
       top: 50%;
       left: 50%;
       transform: translate(-50%, -50%);
       mix-blend-mode: overlay; /* Blend with video */
       pointer-events: none;
   }
   ```

3. **Use existing JavaScript functions**:
   - Call `updateAIStatus('speaking')` when GPU Claude starts talking
   - Call `updateAIStatus('listening')` when waiting for user input
   - Call `updateAIStatus('thinking')` during processing
   - Call `updateAIStatus('paused')` when coach intervenes

### Required DOM Elements

Ensure these elements exist for the JavaScript to work:

```html
<div class="ai-status">
    <div class="ai-indicator" id="aiIndicator"></div>
    <span id="aiStatusText">AI Ready</span>
</div>
```

### Usage Example

```javascript
// When GPU Claude starts speaking
updateAIStatus('speaking');

// When GPU Claude finishes speaking
updateAIStatus('listening');

// During processing/thinking
updateAIStatus('thinking');

// When paused by coach
updateAIStatus('paused');
```

This implementation provides a rich, animated visual feedback system that users are familiar with, while allowing GPU Claude to seamlessly integrate its video stream into the existing interface.