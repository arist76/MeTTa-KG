import { createSignal, Show, For, type Component } from "solid-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/Dialog";
import { Button } from "~/components/ui/Button";
import { Switch, SwitchControl, SwitchThumb } from "~/components/ui/Switch";
import {
  Settings as SettingsIcon,
  Palette,
  Layout,
  Maximize,
  Check,
  Sun,
  Grid3x3,
  Sparkles,
  Activity,
  Image,
} from "lucide-solid";
import {
  accentColors,
  backgroundPatterns,
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
  type LayoutMode,
} from "~/lib/theme";

interface SettingsProps {
  showLabel?: boolean;
}

export default function Settings(props: SettingsProps) {
  const [open, setOpen] = createSignal(false);

  const accentColorKeys = Object.keys(
    accentColors
  ) as (keyof typeof accentColors)[];

  const handleAccentChange = (key: keyof typeof accentColors) => {
    setCurrentAccent(key);
  };

  const handleLayoutChange = (mode: LayoutMode) => {
    setLayoutMode(mode);
  };

  const handleWidthChange = (width: "full" | "contained") => {
    setContentWidth(width);
  };

  const patternKeys = Object.keys(
    backgroundPatterns
  ) as (keyof typeof backgroundPatterns)[];

  const patternIcons: Record<
    keyof typeof backgroundPatterns,
    Component<{ class?: string }>
  > = {
    none: Image,
    lines: Layout,
    stars: Sparkles,
  };

  const handlePatternChange = (key: keyof typeof backgroundPatterns) => {
    setBackgroundPattern(key);
  };

  const handlePatternAnimationChange = (enabled: boolean) => {
    setPatternAnimationEnabled(enabled);
  };

  return (
    <Dialog open={open()} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={props.showLabel ? "default" : "icon"}
          class={`relative ${props.showLabel ? "w-full justify-start" : ""}`}
          data-settings-trigger
        >
          <SettingsIcon class="h-5 w-5" />
          <Show when={props.showLabel}>
            <span class="text-sm font-medium">Settings</span>
          </Show>
          <Show when={glowEnabled()}>
            <span class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
          </Show>
        </Button>
      </DialogTrigger>

      <DialogContent class="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-lg font-semibold">
            <SettingsIcon class="h-5 w-5 text-primary" />
            UI Settings
          </DialogTitle>
        </DialogHeader>

        <div class="space-y-8 py-4">
          {/* Accent Color */}
          <section class="space-y-4">
            <div class="flex items-center gap-2">
              <Palette class="h-4 w-4 text-muted-foreground" />
              <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Accent Color
              </h3>
            </div>
            <p class="text-xs text-muted-foreground">
              Choose your preferred accent color for the interface
            </p>

            <div class="grid grid-cols-3 gap-3">
              <For each={accentColorKeys}>
                {(key) => {
                  const color = accentColors[key];
                  const isSelected = () => currentAccent() === key;

                  return (
                    <button
                      onClick={() => handleAccentChange(key)}
                      class={`relative flex items-center gap-3 rounded-lg border p-3 transition-all ${
                        isSelected()
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      <div
                        class="h-8 w-8 rounded-full border-2 border-white/20"
                        style={{
                          background: `hsl(${color.hue} ${color.saturation}% ${color.lightness}%)`,
                          "box-shadow": glowEnabled() ? color.glow : "none",
                        }}
                      />
                      <span class="text-sm font-medium">{color.name}</span>
                      <Show when={isSelected()}>
                        <Check class="absolute right-3 top-3 h-4 w-4 text-primary" />
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>
          </section>

          {/* Glow Effect */}
          <section class="space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Sun class="h-4 w-4 text-muted-foreground" />
                <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Glow Effects
                </h3>
              </div>
              <Switch
                checked={glowEnabled()}
                onChange={(checked) => setGlowEnabled(checked)}
              >
                <SwitchControl>
                  <SwitchThumb />
                </SwitchControl>
              </Switch>
            </div>
            <p class="text-xs text-muted-foreground">
              Enable glow effects on interactive elements (batteries may drain
              faster)
            </p>

            <div
              class={`rounded-lg border p-6 transition-all ${
                glowEnabled() ? "border-primary/50 glow" : "border-border"
              }`}
            >
              <div class="flex items-center gap-4">
                <div
                  class="h-12 w-12 rounded-lg flex items-center justify-center text-primary-foreground font-bold"
                  style={{
                    background: `hsl(var(--primary))`,
                    "box-shadow": glowEnabled() ? "var(--glow-shadow)" : "none",
                  }}
                >
                  G
                </div>
                <div>
                  <p class="text-sm font-medium">Glow Preview</p>
                  <p class="text-xs text-muted-foreground">
                    {glowEnabled() ? "Effects enabled" : "Effects disabled"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Layout Mode */}
          <section class="space-y-4">
            <div class="flex items-center gap-2">
              <Layout class="h-4 w-4 text-muted-foreground" />
              <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Navigation Layout
              </h3>
            </div>
            <p class="text-xs text-muted-foreground">
              Choose how the navigation is displayed
            </p>

            <div class="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleLayoutChange("topnav")}
                class={`relative rounded-lg border p-4 transition-all ${
                  layoutMode() === "topnav"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div class="mb-3 space-y-1">
                  <div class="h-1.5 w-full rounded bg-muted" />
                  <div class="flex gap-1">
                    <div class="h-1.5 w-4 rounded bg-primary" />
                    <div class="h-1.5 w-4 rounded bg-muted" />
                    <div class="h-1.5 w-4 rounded bg-muted" />
                  </div>
                </div>
                <span class="text-sm font-medium">Top Nav</span>
                <Show when={layoutMode() === "topnav"}>
                  <Check class="absolute right-2 top-2 h-3 w-3 text-primary" />
                </Show>
              </button>

              <button
                onClick={() => handleLayoutChange("sidebar")}
                class={`relative rounded-lg border p-4 transition-all ${
                  layoutMode() === "sidebar"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div class="mb-3 flex gap-1">
                  <div class="h-8 w-3 rounded bg-muted" />
                  <div class="flex-1 space-y-1">
                    <div class="h-1.5 w-full rounded bg-muted" />
                    <div class="h-1.5 w-full rounded bg-muted" />
                  </div>
                </div>
                <span class="text-sm font-medium">Sidebar</span>
                <Show when={layoutMode() === "sidebar"}>
                  <Check class="absolute right-2 top-2 h-3 w-3 text-primary" />
                </Show>
              </button>
            </div>
          </section>

          {/* Content Width */}
          <section class="space-y-4">
            <div class="flex items-center gap-2">
              <Maximize class="h-4 w-4 text-muted-foreground" />
              <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Content Width
              </h3>
            </div>
            <p class="text-xs text-muted-foreground">
              Choose how wide the content area should be
            </p>

            <div class="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleWidthChange("contained")}
                class={`relative rounded-lg border p-4 transition-all ${
                  contentWidth() === "contained"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div class="mb-3 flex justify-center">
                  <div class="h-6 w-16 rounded bg-muted border-x-4 border-border" />
                </div>
                <span class="text-sm font-medium">Contained</span>
                <p class="text-xs text-muted-foreground mt-1">
                  Max-width centered
                </p>
                <Show when={contentWidth() === "contained"}>
                  <Check class="absolute right-2 top-2 h-3 w-3 text-primary" />
                </Show>
              </button>

              <button
                onClick={() => handleWidthChange("full")}
                class={`relative rounded-lg border p-4 transition-all ${
                  contentWidth() === "full"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div class="mb-3">
                  <div class="h-6 w-full rounded bg-muted" />
                </div>
                <span class="text-sm font-medium">Full Width</span>
                <p class="text-xs text-muted-foreground mt-1">Edge to edge</p>
                <Show when={contentWidth() === "full"}>
                  <Check class="absolute right-2 top-2 h-3 w-3 text-primary" />
                </Show>
              </button>
            </div>
          </section>

          {/* Background Pattern */}
          <section class="space-y-4">
            <div class="flex items-center gap-2">
              <Grid3x3 class="h-4 w-4 text-muted-foreground" />
              <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Background Pattern
              </h3>
            </div>
            <p class="text-xs text-muted-foreground">
              Choose a subtle background pattern to enhance the visual
              experience
            </p>

            {/* Pattern Animation Toggle */}
            <div class="flex items-center justify-between rounded-lg border border-border bg-card p-4">
              <div class="flex items-center gap-2">
                <Activity class="h-4 w-4 text-muted-foreground" />
                <div>
                  <p class="text-sm font-medium">Pattern Animation</p>
                  <p class="text-xs text-muted-foreground">
                    Animate background patterns
                  </p>
                </div>
              </div>
              <Switch
                checked={patternAnimationEnabled()}
                onChange={(checked) => handlePatternAnimationChange(checked)}
              >
                <SwitchControl>
                  <SwitchThumb />
                </SwitchControl>
              </Switch>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <For each={patternKeys}>
                {(key) => {
                  const pattern = backgroundPatterns[key];
                  const isSelected = () => backgroundPattern() === key;
                  const Icon = patternIcons[key] || Image;

                  return (
                    <button
                      onClick={() => handlePatternChange(key)}
                      class={`relative flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-all ${
                        isSelected()
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      <div
                        class={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          isSelected()
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon class="h-5 w-5" />
                      </div>
                      <div>
                        <p class="text-sm font-medium">{pattern.name}</p>
                        <p class="text-xs text-muted-foreground line-clamp-1">
                          {pattern.description}
                        </p>
                      </div>
                      <Show when={isSelected()}>
                        <Check class="absolute right-2 top-2 h-3 w-3 text-primary" />
                      </Show>
                    </button>
                  );
                }}
              </For>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
