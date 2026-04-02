import { createSignal, Show, For, type Component } from "solid-js";
import { A, useLocation, useNavigate } from "@solidjs/router";
import { Button } from "~/components/ui/Button";
import {
  ChevronDown,
  Menu,
  X,
  Network,
  Search,
  Command as CommandIcon,
} from "lucide-solid";
import Settings from "./Settings";
import NamespaceSelector from "./NamespaceSelector";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "~/components/ui/Command";
import { sidebarSections } from "~/pages/index/Index";

interface TopNavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

type NavIcon = Component<{ class?: string }> | Component;

interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: NavIcon;
}

export default function TopNavigation(props: TopNavigationProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false);
  const [commandOpen, setCommandOpen] = createSignal(false);

  // Note: Keyboard shortcuts are handled by CommandPalette component

  const handleNavClick = (id: string) => {
    props.setActiveTab(id);
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* Main Navigation Bar */}
      <header class="fixed top-0 left-0 right-0 z-50 glass border-b border-border">
        <div class="container-main">
          <div class="flex h-16 items-center justify-between">
            {/* Logo */}
            <div class="flex items-center gap-3">
              <A href="/" class="flex items-center gap-2 group">
                <div
                  class="h-9 w-9 rounded-lg flex items-center justify-center transition-all group-hover:glow"
                  style={{ background: "hsl(var(--primary))" }}
                  data-glow-element="true"
                >
                  <Network class="h-5 w-5 text-primary-foreground" />
                </div>
                <div class="hidden sm:block">
                  <h1 class="text-lg font-bold tracking-tight">
                    <span class="gradient-text">METTA</span>
                    <span class="text-foreground">-KG</span>
                  </h1>
                </div>
              </A>
            </div>

            {/* Desktop Navigation */}
            <nav class="hidden md:flex items-center gap-1">
              <For each={sidebarSections}>
                {(section) => (
                  <div class="relative group">
                    <Button
                      variant="ghost"
                      class="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                      {section.title.split(" ")[0]}
                      <ChevronDown class="h-3 w-3 opacity-50" />
                    </Button>

                    {/* Dropdown */}
                    <div class="absolute top-full left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                      <div class="w-56 rounded-xl border border-border bg-popover shadow-2xl p-2">
                        <div class="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {section.title}
                        </div>
                        <For each={section.items}>
                          {(item: NavItem) => {
                            const Icon = item.icon;
                            const isActive =
                              location.pathname === item.to ||
                              props.activeTab === item.id;

                            return (
                              <A
                                href={item.to}
                                onClick={() => handleNavClick(item.id)}
                                class={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                                  isActive
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "text-foreground hover:bg-muted"
                                }`}
                              >
                                <div class="flex items-center justify-center w-5 h-5">
                                  {typeof Icon === "function" &&
                                  Icon.name === undefined ? (
                                    <Icon />
                                  ) : (
                                    <Icon class="h-4 w-4" />
                                  )}
                                </div>
                                {item.label}
                              </A>
                            );
                          }}
                        </For>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </nav>

            {/* Right Side Actions */}
            <div class="flex items-center gap-2">
              {/* Command Palette Trigger */}
              <Button
                variant="ghost"
                size="sm"
                class="hidden sm:flex items-center gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  // Dispatch custom event to open CommandPalette
                  window.dispatchEvent(new CustomEvent("open-command-palette"));
                }}
              >
                <Search class="h-4 w-4" />
                <span class="text-xs">Search</span>
                <kbd class="hidden lg:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
                  <span class="text-xs">/</span>
                </kbd>
              </Button>

              {/* Namespace Selector */}
              <div class="hidden md:block">
                <NamespaceSelector />
              </div>

              {/* Settings */}
              <Settings />

              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="icon"
                class="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen())}
              >
                <Show when={!mobileMenuOpen()} fallback={<X class="h-5 w-5" />}>
                  <Menu class="h-5 w-5" />
                </Show>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Spacer for fixed header */}
      <div class="h-16" />

      {/* Mobile Menu */}
      <Show when={mobileMenuOpen()}>
        <div
          class="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
        <div class="fixed top-16 left-0 right-0 z-40 border-b border-border bg-popover md:hidden animate-fade-in">
          <div class="container-main py-4 space-y-4">
            <For each={sidebarSections}>
              {(section) => (
                <div class="space-y-2">
                  <h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
                    {section.title}
                  </h3>
                  <div class="grid grid-cols-2 gap-2">
                    <For each={section.items}>
                      {(item: NavItem) => {
                        const Icon = item.icon;
                        const isActive =
                          location.pathname === item.to ||
                          props.activeTab === item.id;

                        return (
                          <A
                            href={item.to}
                            onClick={() => handleNavClick(item.id)}
                            class={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all ${
                              isActive
                                ? "bg-primary/10 text-primary font-medium border border-primary/30"
                                : "text-foreground hover:bg-muted border border-transparent"
                            }`}
                          >
                            <div class="flex items-center justify-center w-5 h-5">
                              {typeof Icon === "function" &&
                              Icon.name === undefined ? (
                                <Icon />
                              ) : (
                                <Icon class="h-4 w-4" />
                              )}
                            </div>
                            {item.label}
                          </A>
                        );
                      }}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Command Palette */}
      <CommandDialog open={commandOpen()} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search pages and commands..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <For each={sidebarSections}>
            {(section) => (
              <CommandGroup heading={section.title}>
                <For each={section.items}>
                  {(item: NavItem) => {
                    const Icon = item.icon;

                    return (
                      <CommandItem
                        onSelect={() => {
                          handleNavClick(item.id);
                          setCommandOpen(false);
                          // Use SolidJS router navigate
                          navigate(item.to);
                        }}
                      >
                        <div class="flex items-center justify-center w-5 h-5 mr-2">
                          {typeof Icon === "function" &&
                          Icon.name === undefined ? (
                            <Icon />
                          ) : (
                            <Icon class="h-4 w-4" />
                          )}
                        </div>
                        {item.label}
                      </CommandItem>
                    );
                  }}
                </For>
              </CommandGroup>
            )}
          </For>

          <CommandSeparator />

          <CommandGroup heading="Settings">
            <CommandItem
              onSelect={() => {
                setCommandOpen(false);
                // Open settings dialog
                const settingsBtn = document.querySelector(
                  "[data-settings-trigger]"
                ) as HTMLButtonElement;
                settingsBtn?.click();
              }}
            >
              <CommandIcon class="h-4 w-4 mr-2" />
              Open Settings
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
