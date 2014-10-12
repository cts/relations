/*
 * ARE
 * ===
 *
 * Intended as a Mix-In to Relation.
 */

var Model = require('cts/model');
var Util = require('cts/util');

var Are = function(node1, node2, spec) {
  this.klass = Are;
  if (typeof spec == 'undefined') {
    spec = {};
  }
  this.node1 = node1;
  this.node2 = node2;
  this.spec = spec;
  this.initializeBase();
  this.name = 'are';

};

Util._.extend(Are.prototype, Model.Relation.Base, {
  getDefaultOpts: function() {
    return {
      prefix: 0,
      suffix: 0,
      step: 0
    };
  },

  execute: function(toward) {
    var forCreationOnly = this.spec.forCreationOnly;
    if (forCreationOnly) {
      return Util.Promise.resolve();
    }

    return this._Are_AlignCardinalities(toward);
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
  
  _Are_AlignCardinalities: function(toward) {
    // var d = Util.Promise.defer();
  
    var from = this.opposite(toward);
    var fromIterables = this._getIterables(from);
    var toIterables = this._getIterables(toward);
    var toOpts = this.optsFor(toward);

    var self = this;

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
      }
      if (ti) {
        ti.pruneRelations(from, fi);
      }
    }

    // Whittle down
    while (diff > 0) {
      var bye = toIterables.pop();
      bye.destroy();
      diff--;
    }

    // Build up
    var clones = [];
    while (diff < 0) {
      var cloneIdx = toIterables.length % toOpts.mod;
      clones.push(this._cloneIterable(toward, cloneIdx, undefined, false));
      diff++;
    }

    var d = Util.Promise.defer();

    Util.Promise.all(clones).then(
      function(clones) {
        d.resolve(clones);
      }
    )

    // var d = Util.Promise.defer();
    // if (toIterables.length > 0) {
    //   while (toIterables.length > 1) {
    //     var bye = toIterables.pop();
    //     bye.destroy();
    //   }

    //   // Now build it back up.
    //   if (fromIterables.length == 0) {
    //     toIterables[0].destroy();
    //     d.resolve();
    //   } else if (fromIterables.length == 1) {
    //     d.resolve();
    //   } else {
    //     var lastIndex = myOpts.prefix;
    //     // WARNING: Note that i starts at 1
    //     var promises = [];
    //     for (var i = 1; i < fromIterables.length; i++) {
    //       // Clone the iterable.
    //       promises.push(toIterables[0].clone());
    //     }
    //     Util.Promise.all(promises).then(
    //       function(clones) {
    //         self._Are_Filter_Relations(0);
    //         // toIterables[0].pruneRelations(fromIterables[0], from);
    //         Util._.map(clones, function(clone) {
    //           toward.insertChild(clone);
    //         });
    //         for (var i = 0; i < fromIterables.length; i++) {
    //           self._Are_Filter_Relations(i);              
    //         }
    //         // for (var i = 0; i < clones.length; i++) {
    //         //     toward.insertChild(clone, lastIndex, false);

    //         //   var clone = clones[i];             
    //         //   // the ith clone here is the i+1th element! (because 0th is the clone origin)
    //         //   // clone.pruneRelations(fromIterables[i+1], from);
    //         //   lastIndex++;
    //         // }
    //         // if (Util.LogLevel.Debug()) {
    //         //   Util.Log.Debug("After Align");
    //         // }
    //         d.resolve();
    //       },
    //       function(reason) {
    //         d.reject(reason);
    //       }
    //     );
    //   }
    // }
    // return d.promise;
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
    return ['ChildInserted'];
  },

  _subclass_handleEventFromNode: function(evt, thrownFrom, thrownTo) {
    if (evt.eventName == 'ChildInserted') {
      var insertedChild = evt.ctsNode;
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
              thrownTo.tree.forrest.realizeRelations(myIterables[afterIndex], clone);
              clone.pruneRelations(insertedChild, thrownFrom);
              clone._processIncoming().then(
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
    }
  }
});

module.exports = Are;
