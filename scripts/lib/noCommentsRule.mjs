const DIRECTIVE =
  /^\s*(eslint-|@ts-(expect-error|ignore|nocheck|check)\b|@vitest-environment\b|@jsxImportSource\b|prettier-ignore\b|istanbul\b|v8 ignore\b|c8 ignore\b|\/\s*<reference\b)/;

export const noComments = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      comment:
        'No comments: a comment is a reason or a workaround, so fix the code (rename, extract, or delete the hack) and record scope decisions in docs/context/decisions/.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type === 'Shebang' || DIRECTIVE.test(comment.value)) continue;
          context.report({ loc: comment.loc, messageId: 'comment' });
        }
      },
    };
  },
};
