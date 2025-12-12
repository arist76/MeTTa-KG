import { LRLanguage, LanguageSupport, syntaxTree } from "@codemirror/language";
import { linter, Diagnostic } from "@codemirror/lint";
import { CompletionContext, snippetCompletion } from "@codemirror/autocomplete";
import { parser, METTA_KEYWORDS } from "./mettaGrammar";

const mettaLRLanguage = LRLanguage.define({
  parser: parser,
  languageData: {
    commentTokens: { line: ";" },
    closeBrackets: { brackets: ["("] },
  },
});

const mettaLinter = linter((view) => {
  const diagnostics: Diagnostic[] = [];
  syntaxTree(view.state)
    .cursor()
    .iterate((node) => {
      if (node.type.isError) {
        diagnostics.push({
          from: node.from,
          to: node.to,
          severity: "error",
          message: "Syntax error",
          actions: [],
        });
      }
    });
  return diagnostics;
});

const mettaCompletion = (context: CompletionContext) => {
  const word = context.matchBefore(/[\w\-!>]*$/);
  if (!word || (word.from == word.to && !context.explicit)) return null;

  return {
    from: word.from,
    options: [
      ...METTA_KEYWORDS.map((label) => ({ label, type: "keyword" })),
      // Snippet example (optional)
      snippetCompletion("(: ${term} ${type})", {
        label: ":",
        detail: "Type definition",
        type: "text",
      }),
      snippetCompletion("(= (${func} ${args}) ${body})", {
        label: "=",
        detail: "Function definition",
        type: "text",
      }),
    ],
  };
};

export const mettaLanguage = new LanguageSupport(mettaLRLanguage, [
  // mettaLinter,
  mettaLRLanguage.data.of({
    autocomplete: mettaCompletion,
  }),
]);
