import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sphere } from '@react-three/drei';
import * as THREE from 'three';

interface CoreVisualizerProps {
  state: 'idle' | 'listening' | 'thinking' | 'speaking';
}

function FluidSphere({ state }: { state: CoreVisualizerProps['state'] }) {
  const sphereRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);

  useFrame((stateTime) => {
    if (!sphereRef.current || !materialRef.current) return;
    
    const time = stateTime.clock.getElapsedTime();
    sphereRef.current.rotation.y = time * 0.2;
    sphereRef.current.rotation.x = time * 0.1;

    // Animate based on state
    let targetDistort = 0.3;
    let targetSpeed = 2;
    let targetColor = new THREE.Color('#8A2BE2'); // Default Purple
    let targetEmissive = new THREE.Color('#4169E1');

    switch (state) {
      case 'listening':
        targetDistort = 0.6;
        targetSpeed = 4;
        targetColor = new THREE.Color('#00F0FF'); // Cyan
        targetEmissive = new THREE.Color('#0080FF');
        break;
      case 'thinking':
        targetDistort = 0.4;
        targetSpeed = 1;
        targetColor = new THREE.Color('#FFB000'); // Amber
        targetEmissive = new THREE.Color('#FF8000');
        break;
      case 'speaking':
        targetDistort = 0.8;
        targetSpeed = 6;
        targetColor = new THREE.Color('#FFFFFF'); // White
        targetEmissive = new THREE.Color('#A1A1AA');
        break;
      case 'idle':
      default:
        targetDistort = 0.3;
        targetSpeed = 2;
        targetColor = new THREE.Color('#8A2BE2');
        targetEmissive = new THREE.Color('#4169E1');
        break;
    }

    // Smooth transitions
    materialRef.current.distort = THREE.MathUtils.lerp(materialRef.current.distort, targetDistort, 0.05);
    materialRef.current.speed = THREE.MathUtils.lerp(materialRef.current.speed, targetSpeed, 0.05);
    materialRef.current.color.lerp(targetColor, 0.05);
    materialRef.current.emissive.lerp(targetEmissive, 0.05);
  });

  return (
    <Sphere ref={sphereRef} args={[1, 64, 64]} scale={1.5}>
      <MeshDistortMaterial
        ref={materialRef}
        color="#8A2BE2"
        emissive="#4169E1"
        emissiveIntensity={0.5}
        roughness={0.2}
        metalness={0.8}
        distort={0.3}
        speed={2}
        transparent
        opacity={0.9}
      />
    </Sphere>
  );
}

export default function CoreVisualizer({ state }: CoreVisualizerProps) {
  return (
    <div className="w-full h-full absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
      <div className="w-[400px] h-[400px] md:w-[600px] md:h-[600px]">
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 10]} intensity={1} />
          <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00F0FF" />
          <FluidSphere state={state} />
        </Canvas>
      </div>
    </div>
  );
}
