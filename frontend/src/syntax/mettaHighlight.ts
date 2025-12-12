import {
  ViewPlugin,
  Decoration,
  DecorationSet,
  EditorView,
  ViewUpdate,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";

const nodeStyles: Record<string, string> = {
  LINE_COMMENT: "cmt-lineComment",
  StringLiteral: "cmt-string",
  STRING_LITERAL: "cmt-string",
  BooleanLiteral: "cmt-bool",
  BOOLEAN_LITERAL: "cmt-bool",
  IntegerLiteral: "cmt-number",
  INTEGER_LITERAL: "cmt-number",
  FloatLiteral: "cmt-number",
  FLOAT_LITERAL: "cmt-number",
  Identifier: "cmt-variableName",
  IDENTIFIER: "cmt-variableName",
  Variable: "cmt-variableName",
  VARIABLE: "cmt-variableName",
  SpaceReference: "cmt-namespace",
  SPACE_REFERENCE: "cmt-namespace",
  GroundedFunction: "cmt-keyword",
  GroundedArithmeticFunction: "cmt-operator",
  GroundedBooleanFunction: "cmt-keyword",
  GroundedComparisonFunction: "cmt-operator",
  OtherGroundedFunction: "cmt-keyword",
  GroundedType: "cmt-typeName",
};

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        const style = nodeStyles[node.name];
        if (style) {
          builder.add(node.from, node.to, Decoration.mark({ class: style }));
        }
      },
    });
  }

  return builder.finish();
}

export const mettaHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

// Theme with colors for the CSS classes
export const mettaHighlightTheme = EditorView.baseTheme({
  ".cmt-lineComment": { color: "#6a9955", fontStyle: "italic" },
  ".cmt-string": { color: "#ce9178" },
  ".cmt-bool": { color: "#569cd6" },
  ".cmt-number": { color: "#b5cea8" },
  ".cmt-variableName": { color: "#9cdcfe" },
  ".cmt-namespace": { color: "#4ec9b0" },
  ".cmt-keyword": { color: "#c586c0" },
  ".cmt-operator": { color: "#d4d4d4" },
  ".cmt-typeName": { color: "#4ec9b0" },
});
