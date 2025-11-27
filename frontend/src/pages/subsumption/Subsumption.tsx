import { Component, Show, onCleanup, createUniqueId } from "solid-js";
import { createStore, produce, Store } from "solid-js/store";
import { CommandCard } from "~/components/common/CommandCard";
import { Button } from "~/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/Card";
import { formatedNamespace } from "~/lib/state";
import { getAllTokens } from "~/lib/api";
import { rootToken, tokenRootNamespace } from "~/lib/state";
import { isLoading, isPolling, executeSubsumption, stopPolling } from "./lib";
import { Copy, Check } from "lucide-solid";
import {
  Item,
  SubsumptionInput as SubsumptionInputComponent,
} from "./components/SubsumptionInput";
import { setOperationInput } from "~/lib/types";

interface AppState {
  patterns: Item[];
  templates: Item[];
  copied: boolean;
}

const SubsumptionPage: Component = () => {
  const [state, setState] = createStore({
    patterns: [{ id: createUniqueId(), namespace: [""] }],
    templates: [{ id: createUniqueId(), namespace: [""] }],
    copied: false,
  });

  onCleanup(stopPolling);

  const buildSubsutitionExpr = (patterns: Item[]) => {
    const patternExprs: string[] = [];
    const templatesExprs: string[] = [];

    patterns.forEach((_, index) => {
      // convert name space path to stringsItem
      const key = `<source-${(index + 1).toString()}> ($${index.toString()} $${(index + 1).toString()})`;
      patternExprs.push(`(${key})`);
      templatesExprs.push(`$${index}`);
    });

    return `(subsumption\n (, ${patternExprs.join(" ")})\n (, (<target> ${templatesExprs.join(" ")}))\n)`;
  };

  const buildSubsumptionSetInput = (state: Store<AppState>) => {
    const pattern: string[] = [];
    const template: string[] = [];

    const normalizeNamespace = (ns: string[]): string[] => {
      return ns.length > 1 && ns[0] === "/" ? ns.slice(1) : ns;
    };

    state.patterns.forEach((p) => {
      pattern.push(normalizeNamespace(p.namespace).join("/"));
    });

    state.templates.forEach((t) => {
      template.push(normalizeNamespace(t.namespace).join("/"));
    });
    return {
      pattern,
      template,
    };
  };

  const handleSubsumption = () => {
    const subsumtionQueryInput: setOperationInput =
      buildSubsumptionSetInput(state);
    executeSubsumption(subsumtionQueryInput, formatedNamespace());
  };

  const addPattern = () => {
    setState("patterns", (prev) => [
      ...prev,
      { id: createUniqueId(), namespace: ["/"] },
    ]);
  };

  const removePattern = (id: string) => {
    setState("patterns", (prev) => prev.filter((p) => p.id !== id));
  };

  const updatePattern = (id: string, field: "namespace", value: string[]) => {
    setState(
      "patterns",
      produce((patterns) => {
        const item = patterns.find((p) => p.id === id);
        if (item) item[field] = value;
      })
    );
  };

  const addTemplate = () => {
    setState("templates", (prev) => [
      ...prev,
      { id: createUniqueId(), namespace: ["/"] },
    ]);
  };

  const removeTemplate = (id: string) => {
    setState("templates", (prev) => prev.filter((t) => t.id !== id));
  };

  const updateTemplate = (id: string, field: "namespace", value: string[]) => {
    setState(
      "templates",
      produce((templates) => {
        const item = templates.find((t) => t.id === id);
        if (item) item[field] = value;
      })
    );
  };

  const canSubsume = () => {
    return state.templates.length === 1 && state.patterns.length === 1;
  };

  const copyExpression = () => {
    navigator.clipboard.writeText(buildSubsumptionSetInput(state));
    setState("copied", true);
    setTimeout(() => setState("copied", false), 2000);
  };

  return (
    <div class="ml-10 mt-8">
      <CommandCard
        title="S-Expression Builder"
        description="Create transform expressions with patterns and templates"
      >
        <div class="space-y-6">
          {/* Responsive Layout */}
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Builder - 2/3 */}
            <div class="lg:col-span-2 space-y-6">
              <SubsumptionInputComponent
                type="patterns"
                items={state.patterns}
                addItem={addPattern}
                removeItem={removePattern}
                updateItem={updatePattern}
                accentColor="primary"
                rootToken={rootToken()}
                tokenRootNamespace={tokenRootNamespace}
                getAllTokens={getAllTokens}
              />

              <SubsumptionInputComponent
                type="templates"
                items={state.templates}
                addItem={addTemplate}
                removeItem={removeTemplate}
                updateItem={updateTemplate}
                accentColor="primary"
                rootToken={rootToken()}
                tokenRootNamespace={tokenRootNamespace}
                getAllTokens={getAllTokens}
              />
            </div>

            {/* Preview - 1/3 */}
            <div class="lg:col-span-1">
              <Card class="sticky top-4">
                <CardHeader>
                  <CardTitle>S-Expression Preview</CardTitle>
                  <CardDescription>
                    Live output of your transform
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre class="text-sm font-mono bg-muted p-3 rounded overflow-auto">
                    {buildSubsutitionExpr(state.patterns)}
                  </pre>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={copyExpression}
                    class="w-full mt-4"
                  >
                    {state.copied ? (
                      <Check class="w-4 h-4 mr-2" />
                    ) : (
                      <Copy class="w-4 h-4 mr-2" />
                    )}
                    {state.copied ? "Copied!" : "Copy Expression"}
                  </Button>
                  <div class="mt-4 p-3 bg-muted/50 rounded text-sm text-muted-foreground">
                    Items are independently sized.
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Button
          onClick={handleSubsumption}
          disabled={isLoading() || isPolling() || !canSubsume()}
          class="inline-flex items-center justify-center w-[180px] h-10 mt-4"
        >
          <Show when={isLoading() || isPolling()}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="animate-spin mr-2 h-4 w-4"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </Show>
          <Show
            when={isLoading()}
            fallback={
              <Show when={isPolling()} fallback={"Run Subsumption"}>
                Waiting for results...
              </Show>
            }
          >
            Performing Union...
          </Show>
        </Button>
      </CommandCard>
    </div>
  );
};

export default SubsumptionPage;
