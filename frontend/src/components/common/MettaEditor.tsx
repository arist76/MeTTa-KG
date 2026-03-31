import {
  Component,
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  Show,
} from "solid-js";
import { ParseError } from "../../types";
import { highlightText } from "./syntaxHighlighter";
import "./syntax-theme.css";

// Component Prop Interfaces - Same API as original
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
  const [highlightedHtml, setHighlightedHtml] = createSignal("");
  const [lineCount, setLineCount] = createSignal(1);

  let textareaRef: HTMLTextAreaElement | undefined;
  let highlightRef: HTMLPreElement | undefined;
  let lineNumbersRef: HTMLDivElement | undefined;
  let containerRef: HTMLDivElement | undefined;

  // Update syntax highlighting when text changes
  createEffect(() => {
    const currentText = text();
    const html = highlightText(currentText);
    setHighlightedHtml(html);
    setLineCount(currentText.split("\n").length);
  });

  // Handle text changes from textarea
  const handleInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    const newText = target.value;
    setText(newText);
    props.onTextChange(newText);
    setRealTimeErrors([]);
  };

  // Sync scroll between textarea and highlight layer
  const handleScroll = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    if (highlightRef && lineNumbersRef) {
      highlightRef.scrollTop = target.scrollTop;
      highlightRef.scrollLeft = target.scrollLeft;
      lineNumbersRef.scrollTop = target.scrollTop;
    }
  };

  // Handle tab key for indentation
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const value = target.value;

      // Insert 2 spaces for tab
      const newValue = value.substring(0, start) + "  " + value.substring(end);
      setText(newValue);
      props.onTextChange(newText());

      // Restore cursor position
      requestAnimationFrame(() => {
        if (textareaRef) {
          textareaRef.selectionStart = start + 2;
          textareaRef.selectionEnd = start + 2;
        }
      });
    }
  };

  // Sync text when props.initialText changes (only on initial load)
  createEffect(() => {
    const initialText = props.initialText;
    if (
      textareaRef &&
      initialText !== text() &&
      textareaRef.value !== initialText
    ) {
      setText(initialText);
      textareaRef.value = initialText;
    }
  });

  // Handle paste with proper formatting
  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData?.getData("text/plain") || "";
    const target = e.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const currentValue = target.value;

    const newValue =
      currentValue.substring(0, start) +
      pastedText +
      currentValue.substring(end);
    setText(newValue);
    props.onTextChange(newValue);

    requestAnimationFrame(() => {
      if (textareaRef) {
        textareaRef.selectionStart = start + pastedText.length;
        textareaRef.selectionEnd = start + pastedText.length;
      }
    });
  };

  // Get error/warning lines from parseErrors
  const getErrorLines = () => {
    const errors = new Set<number>();
    const warnings = new Set<number>();

    for (const error of props.parseErrors) {
      if (error.severity === "error") {
        errors.add(error.line);
      } else {
        warnings.add(error.line);
      }
    }

    return { errors, warnings };
  };

  // Generate line numbers
  const lineNumbers = () => {
    const numbers: number[] = [];
    for (let i = 1; i <= Math.max(lineCount(), 1); i++) {
      numbers.push(i);
    }
    return numbers;
  };

  const { errors: errorLines, warnings: warningLines } = getErrorLines();

  const lineHeight = 19.5;
  const padding = 8;

  return (
    <div class="flex flex-col h-full w-full box-border">
      <h3 class="m-0 mb-3 text-sm font-semibold flex-shrink-0 leading-tight text-foreground">
        {realTimeErrors().length > 0 && (
          <span class="ml-2 text-xs font-normal text-destructive">
            ({realTimeErrors().filter((e) => e.severity === "error").length}{" "}
            errors,{" "}
            {realTimeErrors().filter((e) => e.severity === "warning").length}{" "}
            warnings)
          </span>
        )}
      </h3>

      {/* Editor Container */}
      <div
        ref={containerRef}
        class="relative flex-1 min-h-0 mb-2 border border-border rounded bg-background transition-all duration-300 ease-linear"
        style={{ overflow: "auto" }}
      >
        <div class="flex" style={{ "min-height": "100%" }}>
          {/* Line Numbers */}
          <div
            ref={lineNumbersRef}
            class="flex-shrink-0 select-none border-r border-border bg-muted"
            style={{
              width: "48px",
              "font-family":
                "'Courier New', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
              "font-size": "13px",
              "line-height": `${lineHeight}px`,
              color: "hsl(var(--muted-foreground))",
              padding: `${padding}px 8px`,
              "text-align": "right",
            }}
          >
            {lineNumbers().map((num) => (
              <div
                style={{
                  height: `${lineHeight}px`,
                  color: errorLines.has(num)
                    ? "hsl(var(--destructive))"
                    : warningLines.has(num)
                      ? "hsl(38 92% 50%)"
                      : "hsl(var(--muted-foreground))",
                  "font-weight":
                    errorLines.has(num) || warningLines.has(num)
                      ? "600"
                      : "normal",
                }}
              >
                {num}
              </div>
            ))}
          </div>

          {/* Editor Area */}
          <div class="relative flex-1" style={{ position: "relative" }}>
            {/* Syntax Highlighted Layer */}
            <pre
              ref={highlightRef}
              class="absolute m-0 pointer-events-none overflow-hidden"
              style={{
                top: `${padding}px`,
                left: `${padding}px`,
                right: `${padding}px`,
                bottom: `${padding}px`,
                "font-family":
                  "'Courier New', Consolas, 'Liberation Mono', Menlo, monospace",
                "font-size": "13px",
                "line-height": `${lineHeight}px`,
                "tab-size": "2",
                "white-space": "pre",
                "word-wrap": "normal",
                "overflow-wrap": "normal",
                background: "transparent",
                color: "hsl(var(--foreground))",
                "z-index": "0",
              }}
              aria-hidden="true"
            >
              <code
                innerHTML={highlightedHtml()}
                style={{ display: "block" }}
              />
            </pre>

            {/* Textarea Layer */}
            <textarea
              ref={textareaRef}
              value={text()}
              onInput={handleInput}
              onScroll={handleScroll}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              spellcheck={false}
              class="absolute m-0 resize-none outline-none border-none"
              style={{
                top: `${padding}px`,
                left: `${padding}px`,
                right: `${padding}px`,
                bottom: `${padding}px`,
                "font-family":
                  "'Courier New', Consolas, 'Liberation Mono', Menlo, monospace",
                "font-size": "13px",
                "line-height": `${lineHeight}px`,
                "tab-size": "2",
                "white-space": "pre",
                "word-wrap": "normal",
                "overflow-wrap": "normal",
                background: "transparent",
                color: "transparent",
                "caret-color": "hsl(var(--foreground))",
                "z-index": 1,
              }}
            />
          </div>
        </div>

        {/* Error line highlights overlay */}
        <div
          class="absolute pointer-events-none"
          style={{
            top: `${padding}px`,
            left: "48px",
            right: `${padding}px`,
            bottom: `${padding}px`,
            "z-index": 2,
          }}
        >
          <style>{`
            .highlight-line {
              position: absolute;
              left: 0;
              right: 0;
              height: ${lineHeight}px;
              pointer-events: none;
            }
            .highlight-line.error {
              background-color: hsl(var(--destructive) / 0.1);
              border-left: 3px solid hsl(var(--destructive));
            }
            .highlight-line.warning {
              background-color: hsl(38 92% 50% / 0.1);
              border-left: 3px solid hsl(38 92% 50% / 0.8);
            }
          `}</style>
          {props.parseErrors.map((error) => (
            <div
              class={`highlight-line ${error.severity}`}
              style={{
                top: `${(error.line - 1) * lineHeight}px`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <Show when={props.showActionButtons ?? true}>
        <div class="mb-2 flex gap-2 flex-shrink-0 items-center">
          <button
            class="px-2 py-1 text-xs border border-border rounded-sm bg-background text-foreground cursor-pointer transition-all duration-200 ease-linear hover:bg-accent hover:border-primary"
            onClick={() => props.onPatternLoad(text())}
          >
            Visualize
          </button>
        </div>
      </Show>
    </div>
  );
};

export default MettaEditor;

// Export syntax highlighting utilities for external use
export { highlightText, tokenize, tokenizeLine } from "./syntaxHighlighter";
export type { Token, TokenType } from "./syntaxHighlighter";
