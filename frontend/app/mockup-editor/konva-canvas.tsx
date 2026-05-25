"use client";

import React from "react";
import { Stage, Layer, Rect, Text, Image as KonvaImage } from "react-konva";

type Template = {
  id: string; label: string; bgColor: string; width: number; height: number;
  zones: Array<{ id: string; label: string; x: number; y: number; w: number; h: number; color: string }>;
};
type LogoItem = {
  id: string; url: string; x: number; y: number; scaleX: number; scaleY: number;
  rotation: number; imgElement?: HTMLImageElement;
};

type Props = {
  stageRef: React.RefObject<unknown>;
  tmpl: Template;
  logos: LogoItem[];
  showZones: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLogoMove: (id: string, x: number, y: number) => void;
  onLogoTransform: (id: string, x: number, y: number, scaleX: number, scaleY: number, rotation: number) => void;
};

export function KonvaCanvas({ stageRef, tmpl, logos, showZones, selectedId, onSelect, onLogoMove, onLogoTransform }: Props) {
  return (
    <Stage ref={stageRef as any} width={tmpl.width} height={tmpl.height}>
      <Layer>
        {/* Background */}
        <Rect x={0} y={0} width={tmpl.width} height={tmpl.height} fill={tmpl.bgColor} />

        {/* Jersey template: draw Coritiba-style green/white vertical stripes */}
        {tmpl.id === "jersey" && (
          <>
            {/* White vertical stripe in center (Coritiba hallmark) */}
            <Rect x={tmpl.width / 2 - 30} y={0} width={60} height={tmpl.height} fill="rgba(255,255,255,0.15)" />
            {/* Collar area */}
            <Rect x={tmpl.width / 2 - 35} y={0} width={70} height={40} fill="rgba(255,255,255,0.08)" />
            {/* Shoulder seams */}
            <Rect x={0} y={120} width={tmpl.width} height={3} fill="rgba(255,255,255,0.12)" />
          </>
        )}

        {/* LED board: add stadium lighting glow */}
        {tmpl.id === "led_board" && (
          <>
            <Rect x={0} y={0} width={tmpl.width} height={tmpl.height}
              fillLinearGradientStartPoint={{ x: 0, y: 0 }}
              fillLinearGradientEndPoint={{ x: tmpl.width, y: 0 }}
              fillLinearGradientColorStops={[0, "rgba(0,80,20,0.3)", 0.5, "rgba(0,150,50,0.1)", 1, "rgba(0,80,20,0.3)"]}
            />
          </>
        )}

        {/* Placement zones — only when showZones is true, do NOT show in final export */}
        {showZones && tmpl.zones.map(zone => (
          <React.Fragment key={zone.id}>
            <Rect
              x={zone.x} y={zone.y} width={zone.w} height={zone.h}
              fill={zone.color}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={1.5}
              dash={[6, 3]}
            />
            <Text
              x={zone.x + 6} y={zone.y + 6}
              text={zone.label}
              fill="rgba(255,255,255,0.6)"
              fontSize={10}
              fontFamily="Arial, sans-serif"
            />
          </React.Fragment>
        ))}

        {/* Logos */}
        {logos.map(logo =>
          logo.imgElement ? (
            <KonvaImage
              key={logo.id}
              id={logo.id}
              image={logo.imgElement}
              x={logo.x}
              y={logo.y}
              scaleX={logo.scaleX}
              scaleY={logo.scaleY}
              rotation={logo.rotation}
              draggable
              onClick={() => onSelect(logo.id)}
              onTap={() => onSelect(logo.id)}
              onDragEnd={(e: any) => onLogoMove(logo.id, e.target.x(), e.target.y())}
              onTransformEnd={(e: any) => onLogoTransform(logo.id, e.target.x(), e.target.y(), e.target.scaleX(), e.target.scaleY(), e.target.rotation())}
              shadowBlur={selectedId === logo.id ? 10 : 0}
              shadowColor="rgba(255,255,255,0.8)"
            />
          ) : null
        )}
      </Layer>
    </Stage>
  );
}
