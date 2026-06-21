/**
 * InstructionsCard — the floating top-left hint card on the Preview & Share screen (Figma 109:717).
 * Purely presentational. Tells the viewer how to manipulate the 3D paper (driven by OrbitControls in
 * the engine's unfold view). The Figma mock repeats "Spin to rotate"; here the three lines describe
 * the actual orbit/zoom/pan gestures.
 */

const HINTS: { icon: string; text: string }[] = [
  { icon: '360', text: 'Drag to rotate' },
  { icon: 'mouse', text: 'Scroll to zoom' },
  { icon: 'pan_tool', text: 'Right-drag to pan' },
];

export function InstructionsCard() {
  return (
    <div className="absolute top-3 left-3 z-[6] flex flex-col gap-2 items-center p-2 bg-popover border border-border shadow-elevation-low">
      <span className="font-serif text-label tracking-label uppercase text-popover-foreground whitespace-nowrap">
        Instructions
      </span>
      {HINTS.map((h) => (
        <div key={h.text} className="flex gap-2.5 items-center">
          <span className="material-symbols-outlined text-[20px] leading-none text-popover-foreground">
            {h.icon}
          </span>
          <span className="font-serif text-caption tracking-caption text-popover-foreground whitespace-nowrap">
            {h.text}
          </span>
        </div>
      ))}
    </div>
  );
}
