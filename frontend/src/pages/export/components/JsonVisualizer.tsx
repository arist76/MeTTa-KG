import { Component, createSignal, For, Show } from "solid-js";
import { clsx } from "clsx";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ChevronDown from "lucide-solid/icons/chevron-down";

interface JsonVisualizerProps {
  data: JsonValue;
  depth?: number;
  label?: string;
  isLast?: boolean;
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

const JsonNode: Component<JsonVisualizerProps> = (props) => {
  const [isExpanded, setIsExpanded] = createSignal(true);
  const depth = props.depth || 0;

  const isObject = typeof props.data === "object" && props.data !== null;
  const isArray = Array.isArray(props.data);
  const isEmpty =
    isObject &&
    Object.keys(props.data as Record<string, JsonValue>).length === 0;
  const isExpandable = isObject && !isEmpty;

  const type = isArray ? "array" : isObject ? "object" : typeof props.data;

  const toggle = () => {
    if (isExpandable) setIsExpanded(!isExpanded());
  };

  const rowContent = () => (
    <>
      <span class="mr-1 mt-1 text-muted-foreground w-4 flex justify-center flex-shrink-0">
        <Show when={isExpandable}>
          {isExpanded() ? (
            <ChevronDown class="h-3.5 w-3.5" />
          ) : (
            <ChevronRight class="h-3.5 w-3.5" />
          )}
        </Show>
      </span>

      <span class="mr-2 text-primary break-all">
        {props.label ? props.label + ": " : ""}
      </span>

      <Show when={!isExpanded() && isObject}>
        <span class="text-muted-foreground">{isArray ? "[...]" : "{...}"}</span>
      </Show>

      <Show when={!isObject}>
        <span
          class={clsx(
            "break-all",
            type === "string"
              ? "text-green-600 dark:text-green-400"
              : type === "number"
                ? "text-orange-600 dark:text-orange-400"
                : type === "boolean"
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400"
          )}
        >
          {JSON.stringify(props.data)}
        </span>
      </Show>

      <Show when={!props.isLast && !isExpanded()}>
        <span class="text-muted-foreground">,</span>
      </Show>
    </>
  );

  return (
    <div class="font-mono text-sm leading-6">
      <Show
        when={isExpandable}
        fallback={
          <div class="flex items-start rounded px-1">{rowContent()}</div>
        }
      >
        <button
          type="button"
          class="flex w-full items-start rounded px-1 text-left hover:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-expanded={isExpanded()}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          {rowContent()}
        </button>
      </Show>

      <Show when={isExpanded() && isObject}>
        <div class="pl-4 border-l border-muted ml-2">
          <Show when={isArray}>
            <For each={isArray ? (props.data as JsonValue[]) : []}>
              {(item, index) => (
                <JsonNode
                  data={item}
                  depth={depth + 1}
                  isLast={index() === (props.data as JsonValue[]).length - 1}
                />
              )}
            </For>
          </Show>
          <Show when={!isArray}>
            <For
              each={
                isObject
                  ? Object.entries(props.data as Record<string, JsonValue>)
                  : []
              }
            >
              {([key, value], index) => (
                <JsonNode
                  label={JSON.stringify(key)}
                  data={value}
                  depth={depth + 1}
                  isLast={
                    index() ===
                    Object.keys(props.data as Record<string, JsonValue>)
                      .length -
                      1
                  }
                />
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export const JsonVisualizer: Component<{ data: JsonValue }> = (props) => {
  return (
    <div class="bg-card text-card-foreground p-4 rounded-md overflow-auto border shadow-sm max-h-[600px]">
      <JsonNode data={props.data} isLast={true} />
    </div>
  );
};
