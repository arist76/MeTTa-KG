import { Component, createSignal, For, Show } from "solid-js";
import { clsx } from "clsx";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ChevronDown from "lucide-solid/icons/chevron-down";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface JsonVisualizerProps {
  data: JsonValue;
  depth?: number;
  label?: string;
  isLast?: boolean;
}

const JsonNode: Component<JsonVisualizerProps> = (props) => {
  const [isExpanded, setIsExpanded] = createSignal(true);
  const depth = props.depth || 0;

  const isObject = typeof props.data === "object" && props.data !== null;
  const isArray = Array.isArray(props.data);
  const isEmpty = isObject && Object.keys(props.data).length === 0;
  const arrayItems = () => (Array.isArray(props.data) ? props.data : []);
  const objectEntries = () =>
    isObject && !isArray
      ? Object.entries(props.data as Record<string, JsonValue>)
      : [];

  const type = isArray ? "array" : isObject ? "object" : typeof props.data;

  const toggle = () => {
    if (isObject && !isEmpty) setIsExpanded(!isExpanded());
  };

  return (
    <div class="font-mono text-sm leading-6">
      <div
        class={clsx(
          "flex items-start hover:bg-muted/50 rounded px-1",
          isObject && !isEmpty ? "cursor-pointer" : ""
        )}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        <span class="mr-1 mt-1 text-muted-foreground w-4 flex justify-center flex-shrink-0">
          <Show when={isObject && !isEmpty}>
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
          <span class="text-muted-foreground">
            {isArray ? "[...]" : "{...}"}
          </span>
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
      </div>

      <Show when={isExpanded() && isObject}>
        <div class="pl-4 border-l border-muted ml-2">
          <Show when={isArray}>
            <For each={arrayItems()}>
              {(item, index) => (
                <JsonNode
                  data={item}
                  depth={depth + 1}
                  isLast={index() === arrayItems().length - 1}
                />
              )}
            </For>
          </Show>
          <Show when={!isArray}>
            <For each={objectEntries()}>
              {([key, value], index) => (
                <JsonNode
                  label={JSON.stringify(key)}
                  data={value}
                  depth={depth + 1}
                  isLast={index() === objectEntries().length - 1}
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
