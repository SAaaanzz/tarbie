// Премиум-рамки для аватара: описание доступных рамок и их отрисовка.
import React from 'react';

export interface FrameDef {
  id: string;
  label: string;
  emoji: string;
  border: string;   // CSS gradient or color for the ring
  shadow: string;    // box-shadow glow
  bg?: string;       // optional background tint inside ring gap
}

export const FRAMES: FrameDef[] = [
  {
    id: 'unicorn', label: 'Unicorn', emoji: '🦄',
    border: 'linear-gradient(135deg, #f0abfc, #818cf8, #67e8f9)',
    shadow: '0 0 10px rgba(168,85,247,0.5), inset 0 0 6px rgba(168,85,247,0.2)',
  },
  {
    id: 'bunny', label: 'Bunny', emoji: '🐰',
    border: 'linear-gradient(135deg, #fbcfe8, #f9a8d4, #f0abfc)',
    shadow: '0 0 10px rgba(244,114,182,0.4), inset 0 0 6px rgba(244,114,182,0.15)',
  },
  {
    id: 'crown', label: 'Crown', emoji: '👑',
    border: 'linear-gradient(135deg, #fbbf24, #f97316, #ef4444)',
    shadow: '0 0 12px rgba(251,191,36,0.5), inset 0 0 6px rgba(251,191,36,0.2)',
  },
  {
    id: 'stars', label: 'Stars', emoji: '⭐',
    border: 'linear-gradient(135deg, #a78bfa, #818cf8, #67e8f9, #fbbf24)',
    shadow: '0 0 10px rgba(167,139,250,0.5), inset 0 0 6px rgba(251,191,36,0.15)',
  },
  {
    id: 'witch', label: 'Witch', emoji: '🧙',
    border: 'linear-gradient(135deg, #7c3aed, #6d28d9, #4c1d95)',
    shadow: '0 0 12px rgba(124,58,237,0.5), inset 0 0 6px rgba(124,58,237,0.2)',
  },
  {
    id: 'cat', label: 'Cat', emoji: '🐱',
    border: 'linear-gradient(135deg, #fb923c, #f97316, #ea580c)',
    shadow: '0 0 10px rgba(249,115,22,0.5), inset 0 0 6px rgba(249,115,22,0.2)',
  },
  {
    id: 'wings', label: 'Wings', emoji: '🪽',
    border: 'linear-gradient(135deg, #818cf8, #6366f1, #a78bfa)',
    shadow: '0 0 12px rgba(99,102,241,0.5), inset 0 0 6px rgba(99,102,241,0.2)',
  },
  {
    id: 'flowers', label: 'Flowers', emoji: '🌸',
    border: 'linear-gradient(135deg, #4ade80, #a3e635, #f472b6, #c084fc)',
    shadow: '0 0 10px rgba(74,222,128,0.4), inset 0 0 6px rgba(244,114,182,0.15)',
  },
  {
    id: 'knight', label: 'Knight', emoji: '⚔️',
    border: 'linear-gradient(135deg, #312e81, #4338ca, #1e1b4b)',
    shadow: '0 0 12px rgba(67,56,202,0.5), inset 0 0 6px rgba(67,56,202,0.2)',
  },
  {
    id: 'moon', label: 'Moon', emoji: '🌙',
    border: 'linear-gradient(135deg, #6366f1, #4338ca, #fbbf24)',
    shadow: '0 0 12px rgba(99,102,241,0.5), inset 0 0 6px rgba(251,191,36,0.15)',
  },
];

export function getFrameStyle(frameId: string, size: number): React.CSSProperties {
  const frame = FRAMES.find(f => f.id === frameId);
  if (!frame) return {};
  const borderW = Math.max(3, Math.round(size * 0.06));
  return {
    background: frame.border,
    padding: borderW,
    borderRadius: '50%',
    boxShadow: frame.shadow,
  };
}
