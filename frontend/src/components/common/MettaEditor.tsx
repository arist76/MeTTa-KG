import { Component, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { ParseError } from "../../types";
import { createEditor, type PrismEditor } from "prism-code-editor";
import "prism-code-editor/layout.css";
import "prism-code-editor/themes/github-dark.css";
import "prism-code-editor/languages/clike";

// Component Prop Interfaces
export interface MettaEditorProps {
  initialText: string;
  onTextChange: (text: string) => void;
  onPatternLoad: (pattern: string) => void;
  parseErrors: ParseError[];
  showActionButtons?: boolean;
}

const MettaEditor: Component<MettaEditorProps> = (props) => {
  const [text, setText] = createSignal(props.initialText);
  const [realTimeErrors, setRealTimeErrors] = createSignal<ParseError[]>([]);

  let editorHostRef: HTMLDivElement | undefined;
  let prismEditor: PrismEditor | undefined;
  let lastInitialText = props.initialText;
  let isProgrammaticUpdate = false;

  const destroyPrismEditor = () => {
    if (!prismEditor) {
      return;
    }

    prismEditor.remove();
    prismEditor = undefined;

    if (editorHostRef) {
      editorHostRef.innerHTML = "";
    }
  };

  const handleTextChange = (textValue: string) => {
    setText(textValue);
    props.onTextChange(textValue);

    // Perform real-time validation
    // const validation = validateSyntax(textValue);
    // setRealTimeErrors([...validation.errors, ...validation.warnings]);
    setRealTimeErrors([]);
  };

  const mountPrismEditor = () => {
    if (!editorHostRef || prismEditor) {
      return;
    }

    prismEditor = createEditor(editorHostRef, {
      class: "metta-prism-instance",
      language: "clike",
      value: text(),
      lineNumbers: true,
      wordWrap: false,
      onUpdate: (value) => {
        if (isProgrammaticUpdate) {
          return;
        }
        handleTextChange(value);
      },
    });
  };

  onMount(() => {
    mountPrismEditor();
  });

  createEffect(() => {
    if (props.initialText === lastInitialText) {
      return;
    }

    lastInitialText = props.initialText;
    setText(props.initialText);

    if (prismEditor && prismEditor.value !== props.initialText) {
      isProgrammaticUpdate = true;
      prismEditor.setOptions({ value: props.initialText });
      isProgrammaticUpdate = false;
    }
  });

  onCleanup(() => {
    destroyPrismEditor();
  });

  return (
    <div class="flex flex-col h-full w-full box-border">
      <style>{`
        .metta-prism-editor-host,
        .metta-prism-editor-host .prism-code-editor,
        .metta-prism-editor-host .pce-wrapper,
        .metta-prism-editor-host .pce-textarea,
        .metta-prism-editor-host .pce-line {
          font-family: 'Courier New', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
          font-size: 13px;
          line-height: 1.5;
        }

        .metta-prism-editor-host .prism-code-editor {
          height: 100%;
          margin: 0;
          --pce-bg: hsl(var(--background));
          --pce-cursor: hsl(var(--primary));
          --pce-selection: hsl(var(--primary) / 0.2);
          --pce-line-number: hsl(var(--muted-foreground));
          --pce-bg-highlight: hsl(var(--accent) / 0.1);
          --pce-border-highlight: 0 solid transparent;
          --padding-inline: 8px;
          --number-spacing: 8px;
        }

        .metta-prism-editor-host .pce-wrapper {
          margin: 0;
        }

        .metta-prism-editor-host .show-line-numbers::before,
        .metta-prism-editor-host .show-line-numbers .pce-line::before {
          background: hsl(var(--muted));
          border-right: 1px solid hsl(var(--border));
          font-weight: 600;
        }

        .metta-prism-editor-host .show-line-numbers .active-line::before {
          color: hsl(var(--accent-foreground));
          background: hsl(var(--accent));
        }
      `}</style>

      <h3 class="m-0 mb-3 text-sm font-semibold flex-shrink-0 leading-tight text-foreground">
        {realTimeErrors().length > 0 && (
          <span class="ml-2 text-xs font-normal text-destructive">
            ({realTimeErrors().filter((e) => e.severity === "error").length} errors,{" "}
            {realTimeErrors().filter((e) => e.severity === "warning").length} warnings)
          </span>
        )}
      </h3>

      <div class="relative flex-1 min-h-0 mb-2 border border-border rounded bg-background overflow-hidden transition-all duration-300 ease-linear">
        <div ref={editorHostRef} class="metta-prism-editor-host h-full w-full" />
      </div>

      <Show when={props.showActionButtons ?? true}>
        <div class="mb-2 flex gap-2 flex-shrink-0 items-center flex-wrap">
          <button
            class="px-2 py-1 text-xs border border-border rounded-sm bg-background text-foreground cursor-pointer transition-all duration-200 ease-linear hover:bg-accent hover:border-primary"
            onClick={() => {
              props.onPatternLoad(text());
            }}
          >
            Visualize
          </button>
        </div>
      </Show>
    </div>
  );
};

export default MettaEditor;
