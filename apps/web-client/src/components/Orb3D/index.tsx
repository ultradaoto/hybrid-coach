/**
 * 3D Audio-Reactive Orb Component
 * 
 * Uses React-Three-Fiber with custom vertex/fragment shaders
 * for organic, audio-reactive visualization.
 * 
 * Features:
 * - Perlin noise vertex displacement
 * - Fresnel glow effect (no postprocessing needed)
 * - EMA + Spring physics smoothing
 * - 60fps performance optimized
 */

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAudioAnalysis } from './useAudioAnalysis';

// =============================================================================
// Vertex Shader - Perlin noise displacement
// =============================================================================
const vertexShader = `
  uniform float uTime;
  uniform float uAudioBass;
  uniform float uAudioMid;
  uniform float uAudioHigh;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;
  
  // Simplex 3D noise
  vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  
  float turbulence(vec3 p) {
    float f = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    
    for (int i = 0; i < 4; i++) {
      f += amplitude * abs(snoise(p * frequency));
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    
    return f;
  }
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    
    // Base noise for organic shape
    float slowTime = uTime * 0.3;
    float noise = turbulence(normal * 0.8 + slowTime);
    
    // Audio-reactive displacement
    float bassDisplacement = uAudioBass * 0.4;
    float midDisplacement = uAudioMid * 0.25 * snoise(normal * 2.0 + uTime);
    float highDisplacement = uAudioHigh * 0.15 * snoise(normal * 4.0 + uTime * 2.0);
    
    float totalDisplacement = noise * 0.15 + bassDisplacement + midDisplacement + highDisplacement;
    vDisplacement = totalDisplacement;
    
    vec3 newPosition = position + normal * totalDisplacement;
    vPosition = newPosition;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

// =============================================================================
// Fragment Shader - Fresnel glow effect
// =============================================================================
const fragmentShader = `
  uniform float uTime;
  uniform float uAudioBass;
  uniform float uAudioMid;
  uniform float uAudioHigh;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uGlowColor;
  
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;
  
  void main() {
    // View direction for fresnel
    vec3 viewDirection = normalize(cameraPosition - vPosition);
    
    // Fresnel effect - stronger at edges
    float fresnel = 1.0 - max(0.0, dot(viewDirection, vNormal));
    fresnel = pow(fresnel, 2.0 + uAudioHigh * 2.0);
    
    // Base color gradient based on displacement
    vec3 baseColor = mix(uColor1, uColor2, vDisplacement * 2.0 + 0.5);
    
    // Add shimmer based on mids
    float shimmer = sin(vDisplacement * 20.0 + uTime * 3.0) * 0.5 + 0.5;
    baseColor = mix(baseColor, uGlowColor, shimmer * uAudioMid * 0.3);
    
    // Glow intensity based on audio
    float glowIntensity = 0.3 + uAudioBass * 0.5 + uAudioHigh * 0.3;
    vec3 glow = uGlowColor * fresnel * glowIntensity;
    
    // Final color
    vec3 finalColor = baseColor + glow;
    
    // Add inner brightness
    float innerGlow = 1.0 - fresnel;
    finalColor += uColor1 * innerGlow * 0.2;
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// =============================================================================
// Inner Glow Sphere (rendered behind main orb)
// =============================================================================
const innerGlowVertexShader = `
  varying vec3 vNormal;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position * 1.15, 1.0);
  }
`;

const innerGlowFragmentShader = `
  uniform vec3 uGlowColor;
  uniform float uIntensity;
  
  varying vec3 vNormal;
  
  void main() {
    vec3 viewDirection = normalize(cameraPosition);
    float fresnel = dot(viewDirection, vNormal);
    fresnel = pow(max(0.0, fresnel), 3.0);
    
    gl_FragColor = vec4(uGlowColor, fresnel * uIntensity * 0.4);
  }
`;

// =============================================================================
// Animated Orb Mesh Component
// =============================================================================
interface OrbMeshProps {
  audioData: {
    bass: number;
    mid: number;
    high: number;
    overall: number;
  };
}

function OrbMesh({ audioData }: OrbMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const innerGlowRef = useRef<THREE.Mesh>(null);
  
  // Spring physics state
  const springState = useRef({
    scale: 1,
    scaleVelocity: 0,
    targetScale: 1,
  });
  
  // Memoize geometry for performance
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 5), []);
  
  // Create shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAudioBass: { value: 0 },
        uAudioMid: { value: 0 },
        uAudioHigh: { value: 0 },
        uColor1: { value: new THREE.Color('#6366f1') }, // Indigo
        uColor2: { value: new THREE.Color('#06b6d4') }, // Cyan
        uGlowColor: { value: new THREE.Color('#a855f7') }, // Purple
      },
    });
  }, []);
  
  // Inner glow material
  const innerGlowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: innerGlowVertexShader,
      fragmentShader: innerGlowFragmentShader,
      uniforms: {
        uGlowColor: { value: new THREE.Color('#6366f1') },
        uIntensity: { value: 1 },
      },
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);
  
  // Animation loop
  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    const time = state.clock.elapsedTime;
    
    // Update shader uniforms
    material.uniforms.uTime.value = time;
    material.uniforms.uAudioBass.value = audioData.bass;
    material.uniforms.uAudioMid.value = audioData.mid;
    material.uniforms.uAudioHigh.value = audioData.high;
    
    // Spring physics for scale
    const spring = springState.current;
    spring.targetScale = 1 + audioData.bass * 0.3;
    
    const stiffness = 180;
    const damping = 12;
    const mass = 1;
    
    const springForce = -stiffness * (spring.scale - spring.targetScale);
    const dampingForce = -damping * spring.scaleVelocity;
    spring.scaleVelocity += (springForce + dampingForce) / mass * delta;
    spring.scale += spring.scaleVelocity * delta;
    
    // Apply scale
    meshRef.current.scale.setScalar(spring.scale);
    
    // Gentle rotation
    meshRef.current.rotation.y += delta * 0.1;
    meshRef.current.rotation.x = Math.sin(time * 0.3) * 0.1;
    
    // Update inner glow
    if (innerGlowRef.current) {
      innerGlowMaterial.uniforms.uIntensity.value = 0.5 + audioData.overall * 0.5;
      innerGlowRef.current.scale.setScalar(spring.scale);
      innerGlowRef.current.rotation.copy(meshRef.current.rotation);
    }
  });
  
  return (
    <group>
      {/* Inner glow sphere */}
      <mesh ref={innerGlowRef} geometry={geometry} material={innerGlowMaterial} />
      
      {/* Main orb */}
      <mesh ref={meshRef} geometry={geometry} material={material} />
    </group>
  );
}

// =============================================================================
// Main Orb3D Component
// =============================================================================
export interface Orb3DProps {
  stream?: MediaStream | null;
  size?: number;
  className?: string;
}

export function Orb3D({ stream = null, size = 200, className = '' }: Orb3DProps) {
  const audioData = useAudioAnalysis(stream);
  
  return (
    <div 
      className={className}
      style={{ 
        width: size, 
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: 'radial-gradient(circle, rgba(15,23,42,0.9) 0%, rgba(15,23,42,1) 100%)',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 3], fov: 50 }}
        dpr={Math.min(window.devicePixelRatio, 2)}
        gl={{ 
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        }}
      >
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={0.5} />
        <OrbMesh audioData={audioData} />
      </Canvas>
    </div>
  );
}

export default Orb3D;
