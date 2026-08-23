export function Lighting() {
  return (
    <>
      <hemisphereLight args={['#fff7e8', '#586070', 0.85]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        castShadow
        intensity={2.1}
        position={[1, 1.6, 0.9]}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-1.4}
        shadow-camera-right={1.8}
        shadow-camera-top={1.8}
        shadow-camera-bottom={-1.2}
      />
    </>
  );
}
