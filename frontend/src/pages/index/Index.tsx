import { Route, Router } from "@solidjs/router";
import { createSignal, For, Show, onMount } from "solid-js";
import LoadPage from "../load/Load";
import UploadPage from "../upload/Upload";
import TransformPage from "../transform/Transform";
import CompositionPage from "../composition/Composition";
import IntersectionPage from "../intersection/Intersection";
import ExportPage from "../export/Export";
import TokensPage from "../tokens/Tokens";
import ClearPage from "../clear/Clear";
import Sidebar from "~/pages/index/components/Sidebar";
import Header from "~/pages/index/components/Header";
import TopNavigation from "~/components/common/TopNavigation";
import ContentWrapper from "~/components/common/ContentWrapper";
import Upload from "lucide-solid/icons/upload";
import Database from "lucide-solid/icons/database";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import Download from "lucide-solid/icons/download";
import Key from "lucide-solid/icons/key";
import NotImplemented from "~/components/common/NotImplemented";
import Trash2 from "lucide-solid/icons/trash-2";
import CommandPalette from "~/components/common/CommandPalette";
import UnionPage from "../union/Union";
import { initSSE, isCommandRunning, commandProgress } from "~/lib/sse";
import { layoutMode } from "~/lib/theme";
import { initTheme } from "~/lib/theme";

export const sidebarSections = [
  {
    title: "Inspection & Visualization",
    items: [
      {
        id: "explore",
        label: "Explore",
        icon: Database,
        to: "/",
        component: LoadPage,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        id: "transform",
        label: "Transform",
        icon: RotateCcw,
        to: "/transform",
        component: TransformPage,
      },
      {
        id: "composition",
        label: "Composition",
        icon: () => <span class="text-lg">∘</span>,
        to: "/composition",
        component: CompositionPage,
      },
      {
        id: "union",
        label: "Union",
        icon: () => <span class="text-lg">∪</span>,
        to: "/union",
        component: UnionPage,
      },
      {
        id: "intersection",
        label: "Intersection",
        icon: () => <span class="text-lg">∩</span>,
        to: "/intersection",
        component: IntersectionPage,
      },
      {
        id: "difference",
        label: "Difference",
        icon: () => <span class="text-lg font-bold">∖</span>,
        to: "/difference",
      },
      {
        id: "restrict",
        label: "Restrict",
        icon: () => <span class="text-lg font-bold">◁</span>,
        to: "/restrict",
      },
      {
        id: "decapitate",
        label: "Decapitate",
        icon: () => <span class="text-lg">⊤</span>,
        to: "/decapitate",
      },
      {
        id: "head",
        label: "Head",
        icon: () => <span class="text-lg">⊢</span>,
        to: "/head",
      },
      {
        id: "cartesian",
        label: "Cartesian",
        icon: () => <span class="text-lg">×</span>,
        to: "/cartesian",
      },
    ],
  },
  {
    title: "Data Management",
    items: [
      {
        id: "upload",
        label: "Import",
        icon: Upload,
        to: "/upload",
        component: UploadPage,
      },
      {
        id: "export",
        label: "Export",
        icon: Download,
        to: "/export",
        component: ExportPage,
      },
      {
        id: "tokens",
        label: "Tokens",
        icon: Key,
        to: "/tokens",
        component: TokensPage,
      },
      {
        id: "clear",
        label: "Clear",
        icon: Trash2,
        to: "/clear",
        component: ClearPage,
      },
    ],
  },
];

const AppLayout = (
  props: any /* eslint-disable-line @typescript-eslint/no-explicit-any */
) => {
  const [activeTab, setActiveTab] = createSignal("explore");

  return (
    <>
      {/* Global Command Palette */}
      <CommandPalette />

      {/* Top Navigation - Only show in topnav mode */}
      <Show when={layoutMode() !== "sidebar"}>
        <TopNavigation activeTab={activeTab()} setActiveTab={setActiveTab} />
      </Show>

      {/* Main Layout */}
      <div
        class={`flex ${layoutMode() === "sidebar" ? "min-h-screen" : "min-h-[calc(100vh-4rem)]"}`}
      >
        {/* Sidebar - Only visible in sidebar layout mode */}
        <Show when={layoutMode() === "sidebar"}>
          <div class="hidden lg:block">
            <Sidebar
              activeTab={() => activeTab()}
              setActiveTab={setActiveTab}
              sidebarSections={sidebarSections}
            />
          </div>
        </Show>

        {/* Main Content Area */}
        <div class="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div class="flex-shrink-0">
            <Header />
          </div>

          {/* Progress Bar */}
          <Show when={isCommandRunning()}>
            <div class="w-full h-1 bg-muted overflow-hidden flex-shrink-0">
              <div
                class="h-full bg-primary transition-all duration-300"
                style={{ width: `${commandProgress()}%` }}
              />
            </div>
          </Show>

          {/* Page Content */}
          <main class="flex-1 min-h-0 overflow-hidden">
            <ContentWrapper>{props.children}</ContentWrapper>
          </main>
        </div>
      </div>
    </>
  );
};

const NotImplementedWrapper = (name: string) => () => (
  <NotImplemented name={name} />
);

const App = () => {
  onMount(() => {
    initTheme();
    initSSE();
  });

  return (
    <div class="flex min-h-screen">
      <div class="flex-1 flex flex-col">
        <Router>
          <Route path="*" component={AppLayout}>
            <For each={sidebarSections}>
              {(section) => (
                <For each={section.items}>
                  {(item) => (
                    <Route
                      path={item.to}
                      component={
                        item.component || NotImplementedWrapper(item.label)
                      }
                    />
                  )}
                </For>
              )}
            </For>
          </Route>
        </Router>
      </div>
    </div>
  );
};

export default App;
