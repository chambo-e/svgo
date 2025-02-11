'use strict';

/**
 * @param {any} node
 * @return {node is any}
 */
const isTag = (node) => {
  return node.isElem();
};

const existsOne = (test, elems) => {
  return elems.some((elem) => {
    if (isTag(elem)) {
      return test(elem) || existsOne(test, getChildren(elem));
    } else {
      return false;
    }
  });
};

const getAttributeValue = (elem, name) => {
  return elem.hasAttr(name) ? elem.attr(name).value : undefined;
};

const getChildren = (node) => {
  return node.content || [];
};

const getName = (elemAst) => {
  return elemAst.elem;
};

const getParent = (node) => {
  return node.parentNode || null;
};

const getSiblings = (elem) => {
  var parent = getParent(elem);
  return parent ? getChildren(parent) : [];
};

const getText = (node) => {
  return node.content[0].text || node.content[0].cdata || '';
};

const hasAttrib = (elem, name) => {
  return getAttributeValue(elem, name) !== undefined;
};

const removeSubsets = (nodes) => {
  let idx = nodes.length;
  let node;
  let ancestor;
  let replace;
  // Check if each node (or one of its ancestors) is already contained in the
  // array.
  while (--idx > -1) {
    node = ancestor = nodes[idx];
    // Temporarily remove the node under consideration
    nodes[idx] = null;
    replace = true;
    while (ancestor) {
      if (nodes.includes(ancestor)) {
        replace = false;
        nodes.splice(idx, 1);
        break;
      }
      ancestor = getParent(ancestor);
    }
    // If the node has been found to be unique, re-insert it.
    if (replace) {
      nodes[idx] = node;
    }
  }
  return nodes;
};

const findAll = (test, elems) => {
  const result = [];
  for (const elem of elems) {
    if (isTag(elem)) {
      if (test(elem)) {
        result.push(elem);
      }
      result.push(...findAll(test, getChildren(elem)));
    }
  }
  return result;
};

const findOne = (test, elems) => {
  for (const elem of elems) {
    if (isTag(elem)) {
      if (test(elem)) {
        return elem;
      }
      const result = findOne(test, getChildren(elem));
      if (result) {
        return result;
      }
    }
  }
  return null;
};

const svgoCssSelectAdapter = {
  isTag,
  existsOne,
  getAttributeValue,
  getChildren,
  getName,
  getParent,
  getSiblings,
  getText,
  hasAttrib,
  removeSubsets,
  findAll,
  findOne,
};

module.exports = svgoCssSelectAdapter;
