import { Component, onMount, createSignal, createEffect, onCleanup } from "solid-js";
import { CodeJar } from "codejar";
import { highlightMetta } from "../../syntax/mettaLanguage";

interface MettaEditorProps {
  initialText: string;
  onTextChange: (text: string) => void;
  onPatternLoad: (pattern: string) => void;
  parseErrors: { line: number; column: number; message: string; severity: string }[];
  showActionButtons?: boolean;
}

function syncGutter(gutter: HTMLDivElement, code: string) {
  const lines = code.split("\n");
  gutter.innerHTML = lines
    .map(
      (_, i) =>
        `<div class="text-right px-1.5 text-[13px] leading-[1.5] text-muted-foreground select-none font-mono" style="min-width:2ch">${i + 1}</div>`
    )
    .join("");
}

const MettaEditor: Component<MettaEditorProps> = (props) => {
  const [text, setText] = createSignal(props.initialText);
  const [realTimeErrors] = createSignal<{ line: number; column: number; message: string; severity: string }[]>([]);

  let editorRef: HTMLDivElement | undefined;
  let gutterRef: HTMLDivElement | undefined;
  let jar: CodeJar | undefined;

  const handleTextChange = (textValue: string) => {
    setText(textValue);
    props.onTextChange(textValue);
  };

  onMount(() => {
    if (!editorRef || !gutterRef) return;

    jar = CodeJar(editorRef, highlightMetta, {
      tab: "  ",
      indentOn: /[([]$/,
    });

    jar.onUpdate((code) => {
      handleTextChange(code);
      syncGutter(gutterRef!, code);
    });

    if (props.initialText) {
      jar.updateCode(props.initialText);
    }
  });

  createEffect(() => {
    if (jar && props.initialText !== text() && props.initialText.length > 0) {
      if (jar.toString().length === 0) {
        jar.updateCode(props.initialText);
        setText(props.initialText);
      }
    }
  });

  onCleanup(() => {
    jar?.destroy();
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
        {realTimeErrors().filter((e) => e.severity === "error").length > 0 && (
          <span class="ml-2 text-xs font-normal text-destructive">
            ({realTimeErrors().filter((e) => e.severity === "error").length} errors,{" "}
            {realTimeErrors().filter((e) => e.severity === "warning").length} warnings)
          </span>
        )}
      </h3>

      {/* Editor Container */}
      <div class="relative flex-1 min-h-0 mb-2 border border-border rounded bg-background overflow-hidden">
        <div class="flex h-full w-full">
          {/* Gutter */}
          <div
            ref={gutterRef}
            class="flex-shrink-0 pt-2 bg-muted border-r border-border overflow-hidden"
            style="padding-top:8px"
          />
          {/* CodeJar Editor */}
          <div
            ref={editorRef}
            class="flex-1 overflow-auto bg-background"
            style={{
              padding: "8px",
              "font-family": "'Courier New', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
              "font-size": "13px",
              "line-height": "1.5",
              color: "hsl(var(--foreground))",
              outline: "none",
              "white-space": "pre",
              "word-wrap": "break-word",
              "tab-size": "2",
            }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      {props.showActionButtons !== false && (
        <div class="mb-2 flex gap-2 flex-shrink-0 items-center">
          <button
            class="px-2 py-1 text-xs border border-border rounded-sm bg-background text-foreground cursor-pointer transition-all duration-200 ease-linear hover:bg-accent hover:border-primary"
            onClick={() => props.onPatternLoad(text())}
          >
            Visualize
          </button>
        </div>
      )}
    </div>
  );
};

export default MettaEditor;
