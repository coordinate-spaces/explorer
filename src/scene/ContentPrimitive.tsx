import { Html, Text } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { SpatialNode } from '../model/SpatialNode';
import { CONTENT_CARD_DEPTH } from './contentGeometry';

interface ContentPrimitiveProps {
  node: SpatialNode;
  onSelect?: (id: string) => void;
  selectionEnabled?: boolean;
}

const MAX_TEXT_CHARACTERS = 800;

function displayedText(text: string): string {
  return text.length > MAX_TEXT_CHARACTERS ? `${text.slice(0, MAX_TEXT_CHARACTERS - 1)}…` : text;
}

function contentLabel(node: SpatialNode): string {
  switch (node.content?.kind) {
    case 'url':
      return node.content.url;
    case 'text':
      return node.content.text;
    default:
      return '';
  }
}

export function ContentPrimitive({ node, onSelect, selectionEnabled = true }: ContentPrimitiveProps) {
  if (!node.content?.kind) {
    return null;
  }

  const { position, rotation, scale } = node.transform;
  const label = contentLabel(node);

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (selectionEnabled) onSelect?.(node.id);
  }

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      userData={{
        spatialNodeId: node.id,
        contentKind: node.content.kind,
        label,
      }}
    >
      <mesh castShadow receiveShadow onClick={handleClick}>
        <boxGeometry args={[1, 1, CONTENT_CARD_DEPTH]} />
        <meshStandardMaterial color={node.content.kind === 'url' ? '#e7eef8' : '#f4ecd8'} roughness={0.86} metalness={0} />
      </mesh>
      {node.content.kind === 'text' ? (
        <Text
          position={[0, 0, 0.031]}
          color="#1f2937"
          anchorX="center"
          anchorY="middle"
          maxWidth={0.86}
          fontSize={0.12}
          textAlign="center"
          overflowWrap="break-word"
        >
          {displayedText(node.content.text)}
        </Text>
      ) : (
        <Html transform position={[0, 0, 0.033]} distanceFactor={4} occlude>
          <div className="url-content-card" title={node.content.url}>
            <iframe
              src={node.content.url}
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              title={`Embedded content: ${node.content.url}`}
            />
            <a href={node.content.url} target="_blank" rel="noreferrer">
              Open URL
            </a>
          </div>
        </Html>
      )}
    </group>
  );
}
