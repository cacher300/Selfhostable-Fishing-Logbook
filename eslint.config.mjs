// Lint the browser modules and build scripts.
import globals from "globals";

const mutatingArrayMethods = new Set(["push", "splice", "pop", "shift", "unshift", "sort", "reverse", "fill", "copyWithin"]);

function unwrapChain(node) {
  return node?.type === "ChainExpression" ? node.expression : node;
}

function memberPropertyName(node) {
  const member = unwrapChain(node);
  if (!member || member.type !== "MemberExpression") return "";
  if (!member.computed && member.property.type === "Identifier") return member.property.name;
  if (member.computed && member.property.type === "Literal") return String(member.property.value);
  return "";
}

function memberRoot(node) {
  let current = unwrapChain(node);
  while (current?.type === "MemberExpression") {
    current = unwrapChain(current.object);
  }
  return current;
}

const noStateMutationRule = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow direct mutation of imported logbook state",
    },
    schema: [],
    messages: {
      mutate: "Mutate the logbook through store.commit() or a domain action instead of assigning to imported state.",
      arrayMethod: "Call mutating array methods on a commit draft, not on imported state.",
    },
  },
  create(context) {
    const stateBindings = new Set();
    const isStateMember = (node) => {
      const root = memberRoot(node);
      return root?.type === "Identifier" && stateBindings.has(root.name);
    };
    return {
      ImportDeclaration(node) {
        if (!String(node.source.value || "").endsWith("app-state.js")) return;
        node.specifiers.forEach((specifier) => {
          if (specifier.type === "ImportSpecifier" && specifier.imported.name === "state") {
            stateBindings.add(specifier.local.name);
          }
        });
      },
      AssignmentExpression(node) {
        if (isStateMember(node.left)) context.report({ node: node.left, messageId: "mutate" });
      },
      UpdateExpression(node) {
        if (isStateMember(node.argument)) context.report({ node: node.argument, messageId: "mutate" });
      },
      UnaryExpression(node) {
        if (node.operator === "delete" && isStateMember(node.argument)) {
          context.report({ node: node.argument, messageId: "mutate" });
        }
      },
      CallExpression(node) {
        const callee = unwrapChain(node.callee);
        if (callee?.type !== "MemberExpression") return;
        if (mutatingArrayMethods.has(memberPropertyName(callee)) && isStateMember(callee.object)) {
          context.report({ node: callee, messageId: "arrayMethod" });
        }
      },
    };
  },
};

const noDomHtmlSinksRule = {
  meta: {
    type: "problem",
    docs: {
      description: "require SafeHtml helpers for DOM HTML insertion",
    },
    schema: [],
    messages: {
      assign: "Use setHtml()/setOuterHtml() from static/js/html.js instead of assigning to {{property}}.",
      insert: "Use insertHtml() from static/js/html.js instead of insertAdjacentHTML().",
    },
  },
  create(context) {
    return {
      AssignmentExpression(node) {
        const left = unwrapChain(node.left);
        if (left?.type !== "MemberExpression") return;
        const property = memberPropertyName(left);
        if (property === "innerHTML" || property === "outerHTML") {
          context.report({ node: left.property, messageId: "assign", data: { property } });
        }
      },
      CallExpression(node) {
        const callee = unwrapChain(node.callee);
        if (callee?.type !== "MemberExpression") return;
        if (memberPropertyName(callee) === "insertAdjacentHTML") {
          context.report({ node: callee.property, messageId: "insert" });
        }
      },
    };
  },
};

const noDynamicRawHtmlRule = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow raw() for dynamic markup",
    },
    schema: [],
    messages: {
      dynamic: "raw() is only for trusted constant markup; pass data through html interpolation instead.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = unwrapChain(node.callee);
        if (callee?.type !== "Identifier" || callee.name !== "raw") return;
        const [argument] = node.arguments;
        const constantString = argument?.type === "Literal" && typeof argument.value === "string";
        const constantTemplate = argument?.type === "TemplateLiteral" && argument.expressions.length === 0;
        if (!constantString && !constantTemplate) {
          context.report({ node, messageId: "dynamic" });
        }
      },
    };
  },
};

export default [
  {
    ignores: ["static/dist/**", "static/js/generated/**", "node_modules/**", "cloud/**", "standalone.html"],
  },
  {
    files: ["static/js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, __STRICT_STATE__: "readonly" },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-dupe-keys": "error",
      "no-redeclare": "error",
      "no-import-assign": "error",
    },
  },
  {
    files: ["static/js/**/*.js"],
    ignores: ["static/js/html.js"],
    plugins: {
      "safe-html": {
        rules: {
          "no-dom-html-sinks": noDomHtmlSinksRule,
          "no-dynamic-raw-html": noDynamicRawHtmlRule,
        },
      },
    },
    rules: {
      "safe-html/no-dom-html-sinks": "error",
      "safe-html/no-dynamic-raw-html": "error",
    },
  },
  {
    files: ["static/js/**/*.js"],
    ignores: ["static/js/store.js"],
    plugins: {
      "local-state": {
        rules: {
          "no-state-mutation": noStateMutationRule,
        },
      },
    },
    rules: {
      "local-state/no-state-mutation": "error",
    },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
];
