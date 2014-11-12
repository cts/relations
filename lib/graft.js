/*
 * GRAFT
 * =====
 *
 * Intended as a Mix-In to Relation.
 *
 * Graft does the following:
 *
 *  1. Copy the subtree of the FROM node.
 *  2. Run all (FROM -> TOWARD) rules in the direction TOWARD->FROM
 *  3. Replace TOWARD subtree with the result of 1 and 2.
 */

var Util = require('cts/util');
var Model = require('cts/model');

var Graft = function(node1, node2, spec) {
  this.initializeBase(Graft, 'graft', node1, node2, spec);
};

Util._.extend(Graft.prototype, Model.Relation.Base, {
  execute: function(toward) {
    if (this.forGraftOnly()) {
      return;
    }

    var opp = this.opposite(toward);

    // A node that participates as a graft soure
    // Should have all its relations removed, as only clones of it will
    // ever actually do anything.
    // opp.pruneRelations(null, null);

    var towardOpts = this.optsFor(toward);
    var fromOpts   = this.optsFor(opp);
    var res;
    if (typeof fromOpts.createNew != 'undefined') {
      var res = this._creationGraft(toward, towardOpts, opp, fromOpts);
    } else {
      var res = this._regularGraft(toward, opp);
    }

    opp.addGrafter(toward);
    return res;
  },

  _creationGraft: function(invoker, invokerOpts, template, templateOpts) {
    var d = Util.Promise.defer();
    var self = this;

    // Now we need to mark all the relations as for a graft so that we don't
    // accidentally execute them during a render.
    // We also need to mark the nodes in case *other* relations
    // bind in after we're done here. E.g., if this template is at the
    // top of the document and others bind in from below.
    for (var i = 0; i < invoker.children.length; i++) {
      var child = invoker.children[i];
      this.markNodeRelationsAsForGraft(child, true, true);
      child.forGraftOnly(true, true);
    }

    invoker.value.on('submit', function(e) {
      // Throw a transform.
      e.preventDefault();
      e.stopPropagation();
      self._runCreation(invoker, invokerOpts, template, templateOpts).then(
        function(newElem) {

          // var t = new Model.Transform({
          //   operation: 'node-inserted',
          //   treeName: invoker.tree.name,
          //   node: invoker
          // });
          // invoker.announceTransform(t);

          // // Step 6: Call childInserted on the receiving container
          // intoList.trigger("ChildInserted", {
          //   eventName: "ChildInserted",
          //   ctsNode: clone,
          //   sourceNode: intoList,
          //   sourceTree: intoList.tree,
          //   afterIndex: iterables.length - 1
          // });

        },
        function(err) {

        }
      );
    });

    d.resolve();
    return d.promise;
  },

  _runCreation: function(newItemContainer, newItemOpts, intoList, intoListOpts) {
    // Step 1: Assume iterable on FROM side.
    var self = this;
    var deferred = Util.Promise.defer();

    if ((typeof CTS != 'undefined') && (typeof CTS.engine != 'undefined') && (typeof CTS.engine.ui != 'undefined')) {
      CTS.engine.ui.showSendingModal();
    }

    // 2. Mark all ARE-related relations as for graft.
    var areRelatedNodes = Util._.filter(intoList.relations, function(relation) {
      return (relation.name == 'are');
    }).map(function(r) { return r.opposite(intoList)});

    var filterFn = function(clone) {
      return function(relation) {
        var otherNode = relation.node1.isDescendantOf(clone) ? relation.node2 : relation.node1;
        var isAreRelated = Util._.reduce(
          Util._.map(areRelatedNodes, function(node) { return otherNode.isDescendantOf(node)} ),
          function(memo, result) { return result || memo },
          false
        );
        return (! isAreRelated);
      };
    };

    var beforePersistence = function(clone) {
      var d = Util.Promise.defer();
      // Step 3: Filter relations
      
      var otherFilterFn = clone.makeIterableLineageFilter(intoList, iterables.length);

      clone.pruneRelations(undefined, undefined, otherFilterFn);

      var filterFnInst = filterFn(clone);
      filterFnInst.deletionPolicy = 'mark';
      filterFnInst.passPolicy = 'mark';
      clone.pruneRelations(undefined, undefined, filterFnInst);

      var graftsToMe = Util._.filter(intoList.getRelations(), function(r) {
        return ((r.name == 'graft') && (r.node1 != newItemContainer) && (r.node2 != newItemContainer))
      });
      var graftFilterFn = function(r) {
        // FALSE if a node is inside a subtree which grafts to me.
        for (var i = 0; i < graftsToMe.length; i++) {
          var relation = graftsToMe[i];
          var otherParent = (relation.node1 == newItemContainer) ? relation.node2 : relation.node1;
          if (r.node1.isDescendantOf(otherParent) || r.node2.isDescendantOf(otherParent)) {
            return false;
          }
        }
        return true;
      };

      clone.pruneRelations(undefined, undefined, graftFilterFn);

      // clone.pruneRelations(clone.parentNode, clone);
      // Step 4: Process Incoming Relations
      clone._processIncoming(undefined, {disableRemote: true, directional: false}, clone).then(
        function() {
          // Step 5: Reverse Filter
          var oppFilterFn = function(relation) {
            return (!filterFnInst(relation));
          };
          oppFilterFn.deletionPolicy = 'mark';
          clone.pruneRelations(undefined, undefined, oppFilterFn);
          self.markNodeRelationsAsForGraft(newItemContainer, true, true);
          d.resolve(clone);
        },
        function(err) {
          d.reject(err);
        }
      );
      return d.promise;
    };

    // Step 1: Clone an iterable from the GRAFT-related container.
                     // list      cloneSource           dest(last) event  beforePFn  cloneRelns
    var iterables = intoList.getIterables(this.optsFor(intoList));

    var nextTimeFn = function() {
      return self._cloneIterable(intoList, iterables.length - 1, undefined, false, beforePersistence, true); 
    };
    var firstTimeFn = function() {
      return self._cloneIterable(intoList, iterables.length - 1, undefined, false, beforePersistence, true);       
    };
    var cloneFn = (iterables.length > 0) ? nextTimeFn : firstTimeFn;

    cloneFn().then(
      function(clone) {
        if (!clone) {
          debugger;
          return deferred.reject("Clone null.");
        }

        var fn = function(r) {
          return false;
        };
        fn.deletionPolicy = 'mark';
        for (var i = 0; i < newItemContainer.children.length; i++) {
          var child = newItemContainer.children[i];
          child.pruneRelations(undefined, undefined, fn);
        }

        console.log("Triggering insertion");

        // Step 6: Call childInserted on the receiving container
        intoList.trigger("ChildInserted", {
          eventName: "ChildInserted",
          ctsNode: clone,
          sourceNode: intoList,
          sourceTree: intoList.tree,
          afterIndex: iterables.length - 1
        });

        deferred.resolve(clone);
      },
      function(err) {
        deferred.resolve(err);
      }
    );

    return deferred.promise;
  },

  _regularGraft: function(invoker, template) {
    var d = Util.Promise.defer();
    var self = this;

    var graftsToMe = Util._.filter(template.getRelations(), function(r) {
      return ((r.name == 'graft') && (r.node1 != invoker) && (r.node2 != invoker))
    });
    var filterFn = function(r) {
      // FALSE if a node is inside a subtree which grafts to me.
      for (var i = 0; i < graftsToMe.length; i++) {
        var relation = graftsToMe[i];
        var otherParent = (relation.node1 == template) ? relation.node2 : relation.node1;
        if (r.node1.isDescendantOf(otherParent) || r.node2.isDescendantOf(otherParent)) {
          return false;
        }
      }
      return true;
    };

    var clonedChildren = Util.Promise.all(
      Util._.map(template.getChildren(), function(node) {
        return node.clone(undefined, true, invoker, filterFn);
      })
    );

    clonedChildren.then(
      function(templateCopy) {
        // Now we have to insert them into the template node so that the forrest can pick 
        // the proper relations while cloning
        for (var i = 0; i < templateCopy.length; i++) {
          template.insertChild(templateCopy[i]);
        }

        // Now we run the graft.
        Util.Promise.all(
          Util._.map(templateCopy, function(templateNode) {
            return templateNode._processIncoming(undefined, {relationFilterFn: filterFn}, templateNode);
          })
        ).then(
          function() {
            Util._.each(templateCopy, function(node) {
              template.removeChild(node, false);
            });
            invoker.replaceChildrenWith(templateCopy);
            invoker.setProvenance(template.tree, template);

            // We'll throw the event on the forrest.
            invoker.tree.forrest.trigger('cts-received-graft', {
              target: invoker,
              source: template,
              relation: self
            });
            d.resolve();
          },
          function(err) {
            d.reject(err);
          }
        );
      },
      function(err) {
        d.reject(err);
      }
    );


    return d.promise;
  },

  clone: function(n1, n2) {
    if (Util._.isUndefined(n1)) {
      n1 = this.node1;
    }
    if (Util._.isUndefined(n2)) {
      n2 = this.node2;
    }
    return new Graft(n1, n2, this.spec);
  },

  eventInterestFor: function(n) {
    return ['transform'];
  },

  _subclass_handleEventFromNode: function(evt, thrownFrom, thrownTo) {
    if (evt.operation) {
      if (evt.operation == 'node-inserted') {    
        this.relayTransform(evt, thrownFrom, thrownTo);
      }
    } 
  },   

  markNodeRelationsAsForGraft: function(node, val, recurse, insideOtherSubtree) {
    var rs = node.getRelations();
    if (typeof insideOtherSubtree == 'undefined') {
      insideOtherSubtree = false;
    }
    for (var i = 0; i < rs.length; i++) {

      if (insideOtherSubtree) {
        if ((rs[i].node1 == node) && (rs[i].node2.isDescendantOf(insideOtherSubtree))) {
          rs[i].forGraftOnly(val);          
        } else if ((rs[i].node2 == node) && (rs[i].node1.isDescendantOf(insideOtherSubtree))) {
          rs[i].forGraftOnly(val);
        }
      } else {
        rs[i].forGraftOnly(val);
      }
    }
    if (recurse) {
      for (var i = 0; i < node.children.length; i++) {
        this.markNodeRelationsAsForGraft(node.children[i], val, recurse, insideOtherSubtree);
      }
    }
  }

});

module.exports = Graft;
