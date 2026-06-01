import { Show } from "solid-js";
import MettaEditor from "~/components/common/MettaEditor";
import ZoomControls from "./components/ZoomControls";
import MinimizeControls from "./components/MinimizeControls";
import ExpressionList from "./components/expandableList/ExpandableList";
import Plus from "lucide-solid/icons/plus";
import Minus from "lucide-solid/icons/minus";
import Database from "lucide-solid/icons/database";
import { initNodesFromApiResponse } from "~/lib/space";
import {
  mettaText,
  handleTextChange,
  parseErrors,
  isMinimized,
  handlePatternLoad,
  toggleMinimize,
  pattern,
  refetchSubSpace,
  subSpace,
  handleExpandAll,
  handleCollapseToRoot,
  setupGraphApi,
  handleToggleCard,
  isIndented,
  handleToggleIndent,
} from "./lib";

import "../../styles/variables.css";
import "../../styles/components.css";

const LoadPage = () => {
  return (
    <div class="relative h-full w-full">
      {/* Pattern Editor Card */}
      <div
        class={`
          absolute bottom-2.5 right-2.5 z-[1001] p-3
          rounded-xl border border-border bg-card text-card-foreground
          shadow-lg transition-all duration-300 ease-in-out
          ${
            isMinimized()
              ? "h-auto w-[300px] max-h-[50px] resize-none"
              : "flex h-[60vh] min-h-[200px] w-[320px] min-w-[250px] max-w-[50vw] resize flex-col overflow-hidden"
          }
        `}
      >
        <div class="mb-3 -m-3 flex items-center justify-between border-b border-border bg-muted/50 p-3">
          <h3 class="text-sm font-medium text-muted-foreground tracking-wider uppercase">
            PATTERN
          </h3>
          <button
            class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-all duration-200 hover:border-primary hover:bg-muted hover:text-primary glow"
            onClick={toggleMinimize}
          >
            {isMinimized() ? (
              <Plus class="h-4 w-4" />
            ) : (
              <Minus class="h-4 w-4" />
            )}
          </button>
        </div>

        <Show when={!isMinimized()}>
          <div class="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            <MettaEditor
              initialText={mettaText()}
              onTextChange={handleTextChange}
              onPatternLoad={handlePatternLoad}
              parseErrors={parseErrors()}
            />
          </div>
        </Show>
      </div>

      {/* Zoom Controls */}
      <div class="absolute top-9 right-2.5 z-10">
        <ZoomControls
          onZoomIn={handleExpandAll}
          onZoomOut={handleCollapseToRoot}
        />
      </div>
      {/* Minimize Controls */}
      <div class="absolute top-9 right-[74px] z-10">
        <MinimizeControls
          onToggleCards={handleToggleCard}
          onToggleIndent={handleToggleIndent}
        />
      </div>
      {/* Expandable list */}
      <div
        class="absolute inset-0 w-full h-full flex pt-3 pb-4 px-1"
        style="z-index: 1;"
      >
        <Show when={subSpace.loading}>
          <div class="flex items-center justify-center h-full w-full">
            <div class="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </Show>
        <Show when={subSpace.error}>
          <div class="flex flex-col items-center justify-center h-full w-full gap-4">
            <div
              class="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: "hsl(var(--destructive) / 0.1)",
                border: "1px solid hsl(var(--destructive))",
              }}
            >
              <Database class="h-8 w-8 text-destructive" />
            </div>
            <div class="text-center">
              <p class="text-lg font-medium text-foreground mb-1">Failed to Load</p>
              <p class="text-sm text-muted-foreground">
                {subSpace.error.message || "An unexpected error occurred"}
              </p>
              <button
                class="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                onClick={() => refetchSubSpace()}
              >
                Retry
              </button>
            </div>
          </div>
        </Show>
        <Show
          when={!subSpace.loading && !subSpace.error && subSpace() && subSpace()!.length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full w-full gap-4">
              <div
                class="w-16 h-16 rounded-full flex items-center justify-center"
                style={{
                  background: "hsl(var(--muted))",
                  border: "1px solid hsl(var(--border))",
                }}
              >
                <Database class="h-8 w-8 text-muted-foreground" />
              </div>
              <div class="text-center">
                <p class="text-lg font-medium text-foreground mb-1">
                  No Data Loaded
                </p>
                <p class="text-sm text-muted-foreground">
                  Use the pattern editor to load space data
                </p>
              </div>
            </div>
          }
        >
          <div class="w-full h-full">
            <ExpressionList
              data={initNodesFromApiResponse(subSpace()!)}
              pattern={pattern()}
              ref={setupGraphApi}
              isIndented={isIndented()}
            />
          </div>
        </Show>
      </div>
    </div>
  );
};

export default LoadPage;
