import { Component, createSignal, createEffect, For } from "solid-js";
import {
  TextField,
  TextFieldLabel,
  TextFieldInput,
} from "~/components/ui/TextField";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/DropdownMenu";
import ChevronDown from "lucide-solid/icons/chevron-down";
import { tokens } from "../../tokens/lib";

interface TransformBuilderProps {
  onCodeChange: (code: string) => void;
}

export const TransformBuilder: Component<TransformBuilderProps> = (props) => {
  const [matchNs, setMatchNs] = createSignal("");
  const [matchPattern, setMatchPattern] = createSignal("$x");
  const [outputNs, setOutputNs] = createSignal("");
  const [outputTemplate, setOutputTemplate] = createSignal("$x");

  const availableTokens = () => tokens() || [];

  const generateCode = () => {
    const wrapWithNamespace = (ns: string, value: string) => {
      if (ns === "") return value;

      const parts = ns.split("/").filter((p) => p.length > 0);

      // If parts is empty (e.g. "/"), treat as root to match backend behavior
      const currentName = parts.length > 0 ? parts[parts.length - 1] : "root";
      const dataTag = `${currentName}a727d4f9-836a-4e4c-9480`;

      let result = `(${dataTag} ${value})`;

      for (let i = parts.length - 1; i >= 0; i--) {
        result = `(${parts[i]} ${result})`;
      }

      return result;
    };

    const processList = (input: string, ns: string, shouldWrap: boolean) => {
      const items = input
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
      if (items.length === 0) return "";

      return items
        .map((item) => (shouldWrap ? wrapWithNamespace(ns, item) : item))
        .join(" ");
    };

    // Backend handles pattern wrapping based on context, so we don't wrap here
    const patterns = processList(matchPattern(), matchNs(), false);
    // We explicitly wrap the template to target specific namespaces
    const templates = processList(outputTemplate(), outputNs(), true);

    return `(transform 
  (, ${patterns}) 
  (, ${templates})
)`;
  };

  createEffect(() => {
    props.onCodeChange(generateCode());
  });

  return (
    <div class="space-y-4 mt-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-4 p-4 border border-neutral-800 rounded-md bg-neutral-900/50">
          <h4 class="font-medium text-sm text-neutral-400 mb-2">
            Match Pattern
          </h4>
          <TextField>
            <TextFieldLabel>Namespace (Optional)</TextFieldLabel>
            <DropdownMenu>
              <DropdownMenuTrigger
                as="button"
                type="button"
                class="w-full flex items-center justify-between px-3 py-2 border rounded-md bg-background hover:bg-accent text-left"
              >
                <span class="text-sm block truncate">
                  {matchNs() || "Select namespace"}
                </span>
                <ChevronDown class="h-4 w-4 opacity-50 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent class="w-[var(--kb-popper-anchor-width)] max-h-60 overflow-y-auto">
                <DropdownMenuItem onSelect={() => setMatchNs("")}>
                  <span class="font-medium italic text-muted-foreground">
                    None
                  </span>
                </DropdownMenuItem>
                <For each={availableTokens()}>
                  {(token) => (
                    <DropdownMenuItem
                      onSelect={() => setMatchNs(token.namespace)}
                      class="flex flex-col items-start"
                    >
                      <span class="font-medium">{token.namespace}</span>
                    </DropdownMenuItem>
                  )}
                </For>
              </DropdownMenuContent>
            </DropdownMenu>
          </TextField>
          <TextField>
            <TextFieldLabel>Pattern(s)</TextFieldLabel>
            <TextFieldInput
              value={matchPattern()}
              onInput={(e) => setMatchPattern(e.currentTarget.value)}
              placeholder="$x (comma separated)"
            />
          </TextField>
        </div>

        <div class="space-y-4 p-4 border border-neutral-800 rounded-md bg-neutral-900/50">
          <h4 class="font-medium text-sm text-neutral-400 mb-2">
            Output Template
          </h4>
          <TextField>
            <TextFieldLabel>Namespace (Optional)</TextFieldLabel>
            <DropdownMenu>
              <DropdownMenuTrigger
                as="button"
                type="button"
                class="w-full flex items-center justify-between px-3 py-2 border rounded-md bg-background hover:bg-accent text-left"
              >
                <span class="text-sm block truncate">
                  {outputNs() || "Select namespace"}
                </span>
                <ChevronDown class="h-4 w-4 opacity-50 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent class="w-[var(--kb-popper-anchor-width)] max-h-60 overflow-y-auto">
                <DropdownMenuItem onSelect={() => setOutputNs("")}>
                  <span class="font-medium italic text-muted-foreground">
                    None
                  </span>
                </DropdownMenuItem>
                <For each={availableTokens()}>
                  {(token) => (
                    <DropdownMenuItem
                      onSelect={() => setOutputNs(token.namespace)}
                      class="flex flex-col items-start"
                    >
                      <span class="font-medium">{token.namespace}</span>
                    </DropdownMenuItem>
                  )}
                </For>
              </DropdownMenuContent>
            </DropdownMenu>
          </TextField>
          <TextField>
            <TextFieldLabel>Template(s)</TextFieldLabel>
            <TextFieldInput
              value={outputTemplate()}
              onInput={(e) => setOutputTemplate(e.currentTarget.value)}
              placeholder="$x (comma separated)"
            />
          </TextField>
        </div>
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium text-neutral-400">Preview</label>
        <pre class="p-4 rounded-md bg-neutral-950 font-mono text-xs text-neutral-400 overflow-x-auto border border-neutral-800">
          {generateCode()}
        </pre>
      </div>
    </div>
  );
};
