const USER_VISIBLE_ATTRIBUTES = new Set([
  "alt",
  "aria-label",
  "aria-description",
  "placeholder",
  "title"
]);
const USER_VISIBLE_CALLS = new Set([
  "addIssue",
  "emailBody",
  "emailSubject",
  "exportHeading",
  "exportLabel",
  "notify",
  "publicCopy",
  "sendNotification",
  "setError",
  "toast",
  "validationMessage"
]);

function containsWords(value) {
  return /[\p{L}\p{N}]{2,}/u.test(value);
}

function calledName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  )
    return callee.property.name;
  return undefined;
}

function isHardcodedString(node) {
  return node?.type === "Literal" && typeof node.value === "string" && containsWords(node.value);
}

const noHardcodedUserVisibleString = {
  meta: {
    type: "problem",
    docs: { description: "Require user-visible copy to come from the localization catalog." },
    messages: { hardcoded: "User-visible copy must use a localized message key." },
    schema: []
  },
  create(context) {
    return {
      JSXText(node) {
        if (containsWords(node.value)) context.report({ node, messageId: "hardcoded" });
      },
      JSXAttribute(node) {
        if (
          node.name.type === "JSXIdentifier" &&
          USER_VISIBLE_ATTRIBUTES.has(node.name.name) &&
          node.value?.type === "Literal" &&
          typeof node.value.value === "string" &&
          containsWords(node.value.value)
        ) {
          context.report({ node, messageId: "hardcoded" });
        }
      },
      NewExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          ["Error", "TypeError", "RangeError"].includes(node.callee.name) &&
          isHardcodedString(node.arguments[0])
        ) {
          context.report({ node: node.arguments[0], messageId: "hardcoded" });
        }
      },
      CallExpression(node) {
        if (
          USER_VISIBLE_CALLS.has(calledName(node.callee)) &&
          isHardcodedString(node.arguments[0])
        ) {
          context.report({ node: node.arguments[0], messageId: "hardcoded" });
        }
      }
    };
  }
};

export const localizationPlugin = {
  meta: { name: "@knotline/localization-policy", version: "1.0.0" },
  rules: { "no-hardcoded-user-visible-string": noHardcodedUserVisibleString }
};

export default localizationPlugin;
