import { createSignal, createEffect, createRoot } from "solid-js";

// Accent color definitions
export const accentColors = {
  neonGreen: {
    name: "Neon Green",
    hue: 142,
    saturation: 71,
    lightness: 45,
    glow: "0 0 20px hsl(142 71% 45% / 0.5)",
  },
  neonCyan: {
    name: "Neon Cyan",
    hue: 180,
    saturation: 100,
    lightness: 50,
    glow: "0 0 20px hsl(180 100% 50% / 0.5)",
  },
  electricPurple: {
    name: "Electric Purple",
    hue: 270,
    saturation: 100,
    lightness: 60,
    glow: "0 0 20px hsl(270 100% 60% / 0.5)",
  },
  hotPink: {
    name: "Hot Pink",
    hue: 320,
    saturation: 100,
    lightness: 60,
    glow: "0 0 20px hsl(320 100% 60% / 0.5)",
  },
  orangeGold: {
    name: "Orange Gold",
    hue: 35,
    saturation: 100,
    lightness: 50,
    glow: "0 0 20px hsl(35 100% 50% / 0.5)",
  },
  blue: {
    name: "Ocean Blue",
    hue: 210,
    saturation: 100,
    lightness: 55,
    glow: "0 0 20px hsl(210 100% 55% / 0.5)",
  },
};

const satoshiFont = {
  family: "'Satoshi', monospace",
  import:
    "https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700,800,900&display=swap",
};

// Layout options
export type LayoutMode = "sidebar" | "topnav";

// Background pattern options
export const backgroundPatterns = {
  none: {
    name: "None",
    description: "Clean gradient background only",
    class: "bg-pattern-none",
  },
  lines: {
    name: "Line Grid",
    description: "Fine horizontal and vertical lines",
    class: "bg-pattern-lines",
  },
  stars: {
    name: "Particles",
    description: "Floating particle dots",
    class: "bg-pattern-stars",
  },
};

const getInitialLayoutMode = (): LayoutMode => {
  const persisted = localStorage.getItem("theme-layout");
  return persisted === "sidebar" || persisted === "topnav"
    ? persisted
    : "topnav";
};

const getInitialPattern = (): keyof typeof backgroundPatterns => {
  const persisted = localStorage.getItem("theme-pattern");
  return persisted && persisted in backgroundPatterns
    ? (persisted as keyof typeof backgroundPatterns)
    : "none";
};

// Theme state
const [currentAccent, setCurrentAccent] = createSignal<
  keyof typeof accentColors
>(
  (localStorage.getItem("theme-accent") as keyof typeof accentColors) ||
    "neonGreen"
);

const [glowEnabled, setGlowEnabled] = createSignal(
  localStorage.getItem("theme-glow") === "true"
);

const [layoutMode, setLayoutMode] = createSignal<LayoutMode>(
  getInitialLayoutMode()
);

const [contentWidth, setContentWidth] = createSignal(
  localStorage.getItem("theme-width") || "contained" // "full" | "contained"
);

const [backgroundPattern, setBackgroundPattern] =
  createSignal<keyof typeof backgroundPatterns>(getInitialPattern());

const [patternAnimationEnabled, setPatternAnimationEnabled] = createSignal(
  localStorage.getItem("theme-pattern-animation") === "true"
);

// Persist theme changes
const persistTheme = () => {
  localStorage.setItem("theme-accent", currentAccent());
  localStorage.setItem("theme-glow", glowEnabled().toString());
  localStorage.setItem("theme-layout", layoutMode());
  localStorage.setItem("theme-width", contentWidth());
  localStorage.setItem("theme-pattern", backgroundPattern());
  localStorage.setItem(
    "theme-pattern-animation",
    patternAnimationEnabled().toString()
  );
};

// Apply theme to document
const applyTheme = () => {
  const accent = accentColors[currentAccent()];

  // Update CSS variables
  const root = document.documentElement;

  // Accent color
  root.style.setProperty("--accent-hue", accent.hue.toString());
  root.style.setProperty("--accent-saturation", `${accent.saturation}%`);
  root.style.setProperty("--accent-lightness", `${accent.lightness}%`);
  root.style.setProperty(
    "--primary",
    `${accent.hue} ${accent.saturation}% ${accent.lightness}%`
  );
  root.style.setProperty(
    "--ring",
    `${accent.hue} ${accent.saturation}% ${accent.lightness}%`
  );
  root.style.setProperty(
    "--accent",
    `${accent.hue} ${accent.saturation}% ${accent.lightness}%`
  );

  // Glow effect
  if (glowEnabled()) {
    root.style.setProperty("--glow-shadow", accent.glow);
    root.style.setProperty("--glow-intense", accent.glow.replace("0.5", "0.8"));
    root.classList.remove("no-glow");
  } else {
    root.style.setProperty("--glow-shadow", "none");
    root.style.setProperty("--glow-intense", "none");
    root.classList.add("no-glow");
  }

  // Font
  root.style.setProperty("--font-family", satoshiFont.family);

  // Load font if needed
  if (
    satoshiFont.import &&
    !document.querySelector(`link[href="${satoshiFont.import}"]`)
  ) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = satoshiFont.import;
    document.head.appendChild(link);
  }

  // Layout class
  root.classList.remove("layout-sidebar", "layout-topnav", "layout-minimal");
  root.classList.add(`layout-${layoutMode()}`);

  // Content width
  root.classList.remove("width-full", "width-contained");
  root.classList.add(`width-${contentWidth()}`);

  // Background pattern
  const patterns = Object.keys(backgroundPatterns);
  root.classList.remove(...patterns.map((p) => `bg-pattern-${p}`));
  root.classList.add(backgroundPatterns[backgroundPattern()].class);

  // Pattern animation
  if (patternAnimationEnabled()) {
    root.classList.add("pattern-animated");
  } else {
    root.classList.remove("pattern-animated");
  }
};

// Track if theme has been initialized
let isThemeInitialized = false;

// Initialize theme
const initTheme = () => {
  if (isThemeInitialized) return;
  isThemeInitialized = true;

  // Apply initial theme
  applyTheme();

  // Set up reactive effect to persist and apply changes
  createRoot(() => {
    createEffect(() => {
      currentAccent();
      glowEnabled();
      layoutMode();
      contentWidth();
      backgroundPattern();
      patternAnimationEnabled();

      // Apply and persist
      applyTheme();
      persistTheme();
    });
  });
};

export {
  currentAccent,
  setCurrentAccent,
  glowEnabled,
  setGlowEnabled,
  layoutMode,
  setLayoutMode,
  contentWidth,
  setContentWidth,
  backgroundPattern,
  setBackgroundPattern,
  patternAnimationEnabled,
  setPatternAnimationEnabled,
  applyTheme,
  initTheme,
};
