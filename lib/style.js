'use strict';

const stable = require('stable');
const csstree = require('css-tree');
const specificity = require('csso/lib/restructure/prepare/specificity');
const { selectAll, is } = require('css-select');
const svgoCssSelectAdapter = require('./svgo/css-select-adapter.js');
const { compareSpecificity } = require('./css-tools.js');
const {
  attrsGroups,
  inheritableAttrs,
  presentationNonInheritableGroupAttrs,
} = require('../plugins/_collections.js');

const cssSelectOptions = {
  xmlMode: true,
  adapter: svgoCssSelectAdapter,
};

const parseRule = (ruleNode, dynamic) => {
  let selectors;
  let selectorsSpecificity;
  const declarations = [];
  csstree.walk(ruleNode, (cssNode) => {
    if (cssNode.type === 'SelectorList') {
      // compute specificity from original node to consider pseudo classes
      selectorsSpecificity = specificity(cssNode);
      const newSelectorsNode = csstree.clone(cssNode);
      csstree.walk(newSelectorsNode, (pseudoClassNode, item, list) => {
        if (pseudoClassNode.type === 'PseudoClassSelector') {
          dynamic = true;
          list.remove(item);
        }
      });
      selectors = csstree.generate(newSelectorsNode);
      return csstree.walk.skip;
    }
    if (cssNode.type === 'Declaration') {
      declarations.push({
        name: cssNode.property,
        value: csstree.generate(cssNode.value),
        important: cssNode.important,
      });
      return csstree.walk.skip;
    }
  });
  return {
    dynamic,
    selectors,
    specificity: selectorsSpecificity,
    declarations,
  };
};

const parseStylesheet = (css, dynamic) => {
  const rules = [];
  const ast = csstree.parse(css);
  csstree.walk(ast, (cssNode) => {
    if (cssNode.type === 'Rule') {
      rules.push(parseRule(cssNode, dynamic || false));
      return csstree.walk.skip;
    }
    if (cssNode.type === 'Atrule') {
      csstree.walk(cssNode, (ruleNode) => {
        if (ruleNode.type === 'Rule') {
          rules.push(parseRule(ruleNode, dynamic || true));
          return csstree.walk.skip;
        }
      });
      return csstree.walk.skip;
    }
  });
  return rules;
};

const computeOwnStyle = (node, stylesheet) => {
  const computedStyle = {};
  const importantStyles = new Map();

  // collect attributes
  if (node.attrs) {
    for (const { name, value } of Object.values(node.attrs)) {
      if (attrsGroups.presentation.includes(name)) {
        computedStyle[name] = { type: 'static', inherited: false, value };
        importantStyles.set(name, false);
      }
    }
  }

  // collect matching rules
  for (const { selectors, declarations, dynamic } of stylesheet) {
    if (is(node, selectors, cssSelectOptions)) {
      for (const { name, value, important } of declarations) {
        const computed = computedStyle[name];
        if (computed && computed.type === 'dynamic') {
          continue;
        }
        if (dynamic) {
          computedStyle[name] = { type: 'dynamic', inherited: false };
          continue;
        }
        if (
          computed == null ||
          important === true ||
          importantStyles.get(name) === false
        ) {
          computedStyle[name] = { type: 'static', inherited: false, value };
          importantStyles.set(name, important);
        }
      }
    }
  }

  // collect inline styles
  for (const [name, { value, priority }] of node.style.properties) {
    const computed = computedStyle[name];
    const important = priority === 'important';
    if (computed && computed.type === 'dynamic') {
      continue;
    }
    if (
      computed == null ||
      important === true ||
      importantStyles.get(name) === false
    ) {
      computedStyle[name] = { type: 'static', inherited: false, value };
      importantStyles.set(name, important);
    }
  }

  return computedStyle;
};

const computeStyle = (node) => {
  // find root
  let root = node;
  while (root.parentNode) {
    root = root.parentNode;
  }
  // find all styles
  const styleNodes = selectAll('style', root, cssSelectOptions);
  // parse all styles
  const stylesheet = [];
  for (const styleNode of styleNodes) {
    const dynamic =
      styleNode.hasAttr('media') && styleNode.attr('media').value !== 'all';
    if (
      styleNode.hasAttr('type') === false ||
      styleNode.attr('type').value === '' ||
      styleNode.attr('type').value === 'text/css'
    ) {
      const children = styleNode.content || [];
      for (const child of children) {
        const css = child.text || child.cdata;
        stylesheet.push(...parseStylesheet(css, dynamic));
      }
    }
  }
  // sort by selectors specificity
  stable.inplace(stylesheet, (a, b) =>
    compareSpecificity(a.specificity, b.specificity)
  );

  // collect inherited styles
  const computedStyles = computeOwnStyle(node, stylesheet);
  let parent = node;
  while (parent.parentNode && parent.parentNode.elem !== '#document') {
    const inheritedStyles = computeOwnStyle(parent.parentNode, stylesheet);
    for (const [name, computed] of Object.entries(inheritedStyles)) {
      if (
        computedStyles[name] == null &&
        // ignore not inheritable styles
        inheritableAttrs.includes(name) === true &&
        presentationNonInheritableGroupAttrs.includes(name) === false
      ) {
        computedStyles[name] = { ...computed, inherited: true };
      }
    }
    parent = parent.parentNode;
  }

  return computedStyles;
};
exports.computeStyle = computeStyle;
