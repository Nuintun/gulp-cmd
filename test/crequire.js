/**
 * Created by nuintun on 2015/4/29.
 */

'use strict';

var UglifyJS = require('uglify-js');

/**
 * Ensure it it a parsed UglifyJS ast
 */
function getAst(ast, options){
  if (isString(ast)) return UglifyJS.parse(ast, options || {});

  return ast;
}

/**
 * Parse everything in `define`.
 *
 * Example:
 *
 *   define('id', ['deps'], fn)
 *
 * Return value:
 *
 *   [{id: 'id', dependencies: ['deps'], factory: fnAst}]
 */
function parse(ast){
  var walker, meta = [];

  ast = getAst(ast);

  walker = new UglifyJS.TreeWalker(function (node){
    var define;

    // don't collect dependencies in the define in define
    if (node instanceof UglifyJS.AST_Call && node.expression.name === 'define' && node.args.length) {
      define = getDefine(node);

      if (define) meta.push(define);

      return true;
    }
  });

  ast.walk(walker);

  return meta;
}
exports.parse = parse;

/**
 * The first meta data returned by `parse`.
 */
exports.parseFirst = function (ast){
  return parse(ast)[0];
};

/**
 * Modify `define` and `require` of the given code.
 *
 * Example:
 *
 *   define('id', ['foo'], function(require) {
 *     var bar = require('bar')
 *   })
 *
 * Replace code with:
 *
 *   modify(code, function(value) {
 *     return value + '-debug';
 *   })
 *
 * Return value (`print_to_string` to get the code):
 *
 *   define('id-debug', ['foo-debug'], function(require) {
 *       var bar = require('bar-debug');
 *   })
 */
function modify(ast, options){
  var idfn, depfn, requirefn,
    asyncfn, alias, trans;

  ast = getAst(ast);
  options = options || {};

  if (isFunction(options)) {
    idfn = depfn = requirefn = asyncfn = options;
  } else {
    idfn = options.id;
    depfn = options.dependencies;
    requirefn = options.require;
    asyncfn = options.async;
  }

  if (isObject(depfn)) {
    alias = depfn;
    depfn = function (value){
      if (alias.hasOwnProperty(value)) {
        return alias[value];
      } else {
        return value;
      }
    };
  }

  trans = new UglifyJS.TreeTransformer(function (node){
    // modify define
    if ((idfn || depfn) && node instanceof UglifyJS.AST_Call
      && node.expression.name === 'define' && node.args.length) {
      var elements, value, args = [],
        meta = getDefine(node);

      if (idfn && isFunction(idfn)) {
        meta.id = idfn(meta.id);
      } else if (idfn && isString(idfn)) {
        meta.id = idfn;
      }

      if (meta.id) {
        args.push(new UglifyJS.AST_String({
          value: meta.id
        }));
      }

      // modify dependencies
      if (meta.dependencyNode && !depfn) {
        args.push(meta.dependencyNode);
      } else if (depfn) {
        elements = [];

        if (meta.dependencies.length && isFunction(depfn)) {
          for (var i = 0, len = meta.dependencies.length; i < len; i++) {
            value = depfn(meta.dependencies[i]);

            if (value) elements.push(new UglifyJS.AST_String({ value: value }));
          }
        } else if (isString(depfn)) {
          elements = [new UglifyJS.AST_String({ value: depfn })];
        } else if (Array.isArray(depfn)) {
          elements = depfn.map(function (value){
            return new UglifyJS.AST_String({
              value: value
            });
          });
        }

        if (meta.dependencyNode) {
          args.push(new UglifyJS.AST_Array({
            start: meta.dependencyNode.start,
            end: meta.dependencyNode.end,
            elements: elements
          }));
        } else {
          args.push(new UglifyJS.AST_Array({ elements: elements }));
        }
      } else {
        args.push(new UglifyJS.AST_Array({ elements: [] }));
      }

      if (meta.factory) args.push(meta.factory);

      node.args = args;

      return node;
    }
  });

  ast = ast.transform(trans);

  if (requirefn || asyncfn) ast = replaceRequire(ast, requirefn, asyncfn);

  return ast;
}
exports.modify = modify;

function getDefine(node){
  var id, child, factory, firstChild,
    secondChild, dependencyNode, dependencies = [];

  if (node.args.length === 1) {
    factory = node.args[0];

    if (factory instanceof UglifyJS.AST_Function) dependencies = getRequires(factory);
  } else if (node.args.length === 2) {
    factory = node.args[1];
    child = node.args[0];

    if (child instanceof UglifyJS.AST_Array) {
      // define([], function(){});
      dependencies = map(child.elements, function (el){
        if (el instanceof UglifyJS.AST_String) return el.getValue();
      });
      dependencyNode = child;
    }

    if (child instanceof UglifyJS.AST_String) {
      // define('id', function() {});
      id = child.getValue();
      dependencies = getRequires(factory);
    }
  } else {
    factory = node.args[2];
    firstChild = node.args[0];
    secondChild = node.args[1];

    if (firstChild instanceof UglifyJS.AST_String) id = firstChild.getValue();

    if (secondChild instanceof UglifyJS.AST_Array) {
      dependencies = map(secondChild.elements, function (el){
        if (el instanceof UglifyJS.AST_String) return el.getValue();
      });
      dependencyNode = secondChild;
    } else if ((secondChild instanceof UglifyJS.AST_Null)
      || (secondChild instanceof UglifyJS.AST_Undefined)) {
      if (factory instanceof UglifyJS.AST_Function) dependencies = getRequires(factory);
    }
  }

  return {
    id: id,
    dependencies: dependencies,
    factory: factory,
    dependencyNode: dependencyNode
  };
}

/**
 * Return everything in `require`.
 *
 * Example:
 *
 *   define(function(require) {
 *     var $ = require('jquery')
 *     var _ = require('lodash')
 *   })
 *
 * Return value:
 *
 *   ['jquery', 'lodash']
 */
function getRequires(ast){
  var walker, deps = [];

  ast = getAst(ast);

  walker = new UglifyJS.TreeWalker(function (node){
    if (node instanceof UglifyJS.AST_Call && node.expression.name === 'require') {
      var child, args = node.expression.args || node.args;

      if (args && args.length === 1) {
        child = args[0];

        if (child instanceof UglifyJS.AST_String) deps.push(child.getValue());
      }

      return true;
    }
  });

  ast.walk(walker);

  return deps;
}

/**
 * Replace every string in `require`.
 *
 * Example:
 *
 *   define(function(require) {
 *     var $ = require('jquery');
 *     require.async('foo', function(foo){
 *       // TODO callback
 *     });
 *   })
 *
 * Replace requires in this code:
 *
 *   replaceRequire(code, function(value) {
 *     if (value === 'jquery') return 'zepto';
 *     return value;
 *   }, function(value) {
 *     if (value === 'foo') return 'app/foo';
 *     return value;
 *   })
 */
function replaceRequire(ast, requirefn, asyncfn){
  var makeFunction, replaceChild, trans;

  ast = getAst(ast);

  makeFunction = function (fn){
    if (isFunction(fn)) return fn;

    if (isObject(fn)) {
      var alias = fn;

      return function (value){
        if (alias.hasOwnProperty(value)) {
          return alias[value];
        } else {
          return value;
        }
      };
    }

    return function (value){
      return value;
    };
  };

  replaceChild = function (node, fn){
    var child, args = node.args[0],
      children = args instanceof UglifyJS.AST_Array ? args.elements : [args];

    for (var i = 0, len = children.length; i < len; i++) {
      child = children[i];

      if (child instanceof UglifyJS.AST_String) child.value = fn(child.getValue());
    }
  };

  requirefn = makeFunction(requirefn);
  asyncfn = makeFunction(asyncfn);

  trans = new UglifyJS.TreeTransformer(function (node){
    // require('foo')
    if (requirefn && node instanceof UglifyJS.AST_Call
      && node.expression.name === 'require' && node.args.length) {
      return replaceChild(node, requirefn);
    }

    // require.async('foo', function(foo){ //TODO callback })
    if (asyncfn && node instanceof UglifyJS.AST_Call && node.start.value === 'require'
      && node.expression.property === 'async' && node.args.length) {
      return replaceChild(node, asyncfn);
    }
  });

  return ast.transform(trans);
}

function isString(str){
  return typeof str === 'string';
}

function isFunction(fn){
  return typeof fn === 'function';
}

function isObject(object){
  return typeof object === 'object' && !Array.isArray(object);
}

function map(object, fn, context){
  var results = [];

  if (object === null) return results;

  if (object.map === Array.prototype.map) return object.map(fn, context);

  for (var i = 0; i < object.length; i++) {
    results[i] = fn.call(context, object[i], i, object);
  }

  return results;
}