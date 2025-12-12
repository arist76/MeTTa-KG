import { Component, onMount, createSignal, createEffect, Show } from "solid-js";
import { ParseError } from "../../types";
import { EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import {
  bracketMatching,
  indentOnInput,
  foldGutter,
  foldKeymap,
} from "@codemirror/language";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { lintGutter } from "@codemirror/lint";
import {
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
} from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { mettaLanguage } from "../../syntax/mettaLanguage";
import {
  mettaHighlighter,
  mettaHighlightTheme,
} from "../../syntax/mettaHighlight";

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

  let editorRef: HTMLDivElement | undefined;
  let editorView: EditorView | undefined;

  const handleTextChange = (textValue: string) => {
    setText(textValue);
    props.onTextChange(textValue);
    setRealTimeErrors([]);
  };

  onMount(() => {
    if (!editorRef) return;

    const state = EditorState.create({
      doc: props.initialText,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
        ]),
        // MeTTa language support
        mettaLanguage,
        // Custom syntax highlighting (no styleTags needed!)
        mettaHighlighter,
        mettaHighlightTheme,
        lintGutter(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newText = update.state.doc.toString();
            handleTextChange(newText);
          }
        }),
        EditorView.theme({
          "&": {
            fontSize: "13px",
            fontFamily:
              "'Courier New', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
            lineHeight: "1.5",
            background: "hsl(var(--background))",
            color: "hsl(var(--foreground))",
            border: "none",
            outline: "none",
          },
          ".cm-content": {
            padding: "8px",
            whiteSpace: "pre",
            wordWrap: "break-word",
            tabSize: "2",
            background: "hsl(var(--background))",
            color: "hsl(var(--foreground))",
            lineHeight: "1.5",
          },
          ".cm-gutters": {
            borderRight: "1px solid hsl(var(--border))",
            fontFamily:
              "'Courier New', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
            fontSize: "13px",
            lineHeight: "1.5",
            padding: "0px 4px",
            background: "hsl(var(--muted))",
            color: "hsl(var(--muted-foreground))",
          },
          ".cm-lineNumbers .cm-gutterElement": {
            minWidth: "3ch",
            textAlign: "right",
            paddingRight: "8px",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily:
              "'Courier New', Consolas, 'Liberation Mono', Menlo, Courier, monospace",
          },
          ".cm-cursor": {
            borderLeft: "2px solid hsl(var(--foreground))",
          },
          "&.cm-focused .cm-cursor": {
            borderLeftColor: "hsl(var(--primary))",
          },
          ".cm-selectionBackground, ::selection": {
            backgroundColor: "hsl(var(--accent))",
          },
          "&.cm-focused .cm-selectionBackground": {
            backgroundColor: "hsl(var(--accent))",
          },
          ".cm-activeLine": {
            backgroundColor: "hsl(var(--muted) / 0.3)",
          },
          ".cm-activeLineGutter": {
            backgroundColor: "hsl(var(--muted))",
          },
          ".cm-matchingBracket": {
            backgroundColor: "hsl(var(--accent))",
            outline: "1px solid hsl(var(--border))",
          },
          ".cm-nonmatchingBracket": {
            backgroundColor: "hsl(var(--destructive) / 0.3)",
          },
        }),
      ],
    });

    editorView = new EditorView({
      state,
      parent: editorRef,
    });
  });

  // Handle external updates (initial load)
  createEffect(() => {
    if (editorView && props.initialText !== text()) {
      if (editorView.state.doc.length === 0) {
        const transaction = editorView.state.update({
          changes: { from: 0, to: 0, insert: props.initialText },
        });
        editorView.dispatch(transaction);
        setText(props.initialText);
      }
    }
  });

  return (
    <div class="flex flex-col h-full w-full box-border">
      <h3 class="m-0 mb-3 text-sm font-semibold flex-shrink-0 leading-tight text-foreground">
        {realTimeErrors().length > 0 && (
          <span class="ml-2 text-xs font-normal text-destructive">
            External Parser Errors: {realTimeErrors().length}
          </span>
        )}
      </h3>

      <div class="relative flex-1 min-h-0 mb-2 border border-border rounded bg-background overflow-hidden transition-all duration-300 ease-linear">
        <div ref={editorRef} class="h-full w-full bg-background" />
      </div>

      <Show when={props.showActionButtons ?? true}>
        <div class="mb-2 flex gap-2 flex-shrink-0 items-center">
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
