export const motionDuration = {
  instant: 0.08,
  fast: 0.16,
  normal: 0.22,
  slow: 0.3
} as const;

export const motionEase = {
  standard: [0.2, 0.8, 0.2, 1] as const,
  enter: [0.16, 1, 0.3, 1] as const,
  exit: [0.7, 0, 0.84, 0] as const
} as const;

export const motionSpring = {
  gentle: { type: "spring", stiffness: 360, damping: 32, mass: 0.8 } as const,
  snappy: { type: "spring", stiffness: 500, damping: 35, mass: 0.65 } as const
} as const;

export const motionDistance = { page: 8, card: 2 } as const;

