/*
 * ARE
 * ===
 *
 * Intended as a Mix-In to Relation.
 */

var Model = require('cts/model');
var Util = require('cts/util');

var Are = function(node1, node2, spec) {
  this.initializeBase(Are, 'are', node1, node2, spec);
};

Util._.extend(Are.prototype, Model.Relation.Base, {
  getDefaultOpts: function() {
    return {
      prefix: 0,
      suffix: 0,
      step: 0
    };
  },

  execute: function(toward, opts) {
    if (this.forGraftOnly()) {
      return Util.Promise.resolve();
    }

    return this._Are_AlignCardinalities(toward, opts);
//    toward.trigger('received-are', {
//      target: toward,
//      source: this.opposite(toward),
//      relation: this
//    });
  },

  clone: function(n1, n2) {
    if (Util._.isUndefined(n1)) {
      n1 = this.node1;
    }
    if (Util._.isUndefined(n2)) {
      n2 = this.node2;
    }
    return new Are(n1, n2, this.spec);
  },
  
  _Are_AlignCardinalities: function(toward, opts) {
    // var d = Util.Promise.defer();
  
    var from = this.opposite(toward);
    var fromIterables = this._getIterables(from);
    var toIterables = this._getIterables(toward);
    var toOpts = this.optsFor(toward);

    var self = this;

    var filterFn = undefined;
    if (opts && opts.relationFilterFn) {
      filterFn = opts.relationFilterFn;
    }

    // First we either take it down or forward.
    var diff = toIterables.length - fromIterables.length;
    if (! toOpts.mod) {
      toOpts.mod = toIterables.length;
    }

    var promises = [];

    // Filter the overlap
    for (var i = 0; i < Math.max(fromIterables.length, toIterables.length); i++) {
      var fi = (i < fromIterables.length) ? fromIterables[i] : null;
      var ti = (i < toIterables.length) ? toIterables[i] : null;
      if (fi) {
        fi.pruneRelations(toward, ti);
        if (filterFn) {
          fi.pruneRelations(undefined, undefined, filterFn);
        }
      }
      if (ti) {
        ti.pruneRelations(from, fi);
        if (filterFn) {
          ti.pruneRelations(undefined, undefined, filterFn);
        }
      }
    }

    // Whittle down
    while (diff > 0) {
      var bye = toIterables.pop();
      bye.destroy();
      diff--;
    }    

    var clones = [];
    while (diff < 0) {
      var cloneIdx = toIterables.length % toOpts.mod;
      clones.push(this._cloneIterable(toward, cloneIdx, undefined, false, undefined, undefined, filterFn));
      diff++;
    }

    var d = Util.Promise.defer();

    Util.Promise.all(clones).then(
      function(clones) {
        d.resolve(clones);
      }
    )
  },

  /*
   * Returns the number of items in the set rooted by this node,
   * respecting the prefix and suffix settings provided to the relation.
   *
   * An assumption is made here that the tree structure already takes
   * into an account the step size, using intermediate nodes.
   */
  _Are_GetCardinality: function(node) {
    var opts = this.optsFor(node);
    return node.getChildren().length - opts.prefix - opts.suffix;
  },

  eventInterestFor: function(n) {
    return ['ChildInserted', 'ChildRemoved'];
  },

  _findTopmostAreOld: function(node, bestSoFar, callingFrom) {
    var r = Util.filter(node.relations, function(r) {
      return (r.name == 'are');
    });
    if (r.length > 0) {
      bestSoFar = [];      
      for (var i = 0; i < r.length; i++) {
        var are = r[i];
        var root = (are.node1 == node) ? are.node2 : are.node1;
        var idx = Util._.indexOf(this._getIterables(node), callingFrom);
        var iterable = this._getIterables(root)[idx];
        bestSoFar.push([root, iterable]);
      }
    }

    if (node.parentNode == null) {
      return bestSoFar;
    } else {
      return this._findTopmostAre(node.parentNode, bestSoFar, node);
    }
  },

  _subclass_handleEventFromNode: function(evt, thrownFrom, thrownTo) {
    if (evt.eventName == 'ChildInserted') {
      var insertedChild = evt.ctsNode;
      var self = this;
      // XXX: Make diff instead of redo! For efficiency!
      // Clone one.
      var afterIndex = evt.afterIndex;
      var myIterables = this._getIterables(thrownTo);
      // TODO YAY!
      myIterables[afterIndex].clone().then(
        function(clone) {
          // This will force realization of inline specs.
          clone.parseInlineRelationSpecsRecursive().then(
            function() {
              clone.realizeInlineRelationSpecsRecursive();
              thrownTo.tree.forrest.realizeRelations(clone, filterFn);
              var filterFn = self._makeAreTreeFilter(thrownTo, clone, afterIndex+1);  
              clone.pruneRelations(undefined, undefined, filterFn);
              clone._processIncoming(undefined, undefined, clone).then(
                function() {
                  thrownTo.insertChild(clone, afterIndex, false);
                },
                function(reason) {
                  Util.Log.Error(reason);
                }
              ).done();
            }
          )
        },
        function(reason) {
          Util.Log.Error(reason);
        }
      );
    } else if (evt.eventName == 'ChildRemoved') {
      var iterables = this._getIterables(thrownTo);
      var iterable = iterables[evt.childIndex];
      thrownTo.removeChild(iterable, false);
    }
  }
});

module.exports = Are;
