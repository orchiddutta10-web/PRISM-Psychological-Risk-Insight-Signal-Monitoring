/**
 * PRISM Animation presets
 */

export const Animations = {
  // Spring configs
  spring: {
    gentle: {
      damping: 15,
      stiffness: 120,
    },
    snappy: {
      damping: 12,
      stiffness: 200,
    },
    bouncy: {
      damping: 8,
      stiffness: 150,
    },
  },

  // Timing
  timing: {
    fast: 200,
    normal: 300,
    slow: 500,
    reveal: 800,
  },

  // Stagger delays (ms)
  stagger: {
    card: 80,
    list: 50,
    instant: 30,
  },
} as const;
