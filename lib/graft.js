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
  this.klass = Graft;
  if (Util._.isUndefined(spec)) {
    spec = {};
  }
  this.node1 = node1;
  this.node2 = node2;
  this.spec = spec;
  this.name = 'graft';
  this.initializeBase();
};

Util._.extend(Graft.prototype, Model.Relation.Base, {
  execute: function(toward) {
    if (this.spec.forCreationOnly) {
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

    // What event should trigger the item creation?
    // We'll default to the first button inside the GRAFT subtree.
    // But the createOn property on the graft invoker can specify a different
    // css selector.
    // var createOn = (typeof invokerOpts.createOn != 'undefined') ?
    //   invoker.find(invokerOpts.createOn) : invoker.find('button');
    
    // if ((createOn != null) && (createOn.length> 0)) {
    //   createOn[0].click(function() {
    //     self._runCreation(invoker, invokerOpts, template, templateOpts);
    //   });
    // }

    invoker.value.on('submit', function(e) {
      self._runCreation(invoker, invokerOpts, template, templateOpts);
      e.preventDefault();
      e.stopPropagation();
    });

    // Now we need to mark all the relations as for a graft so that we don't
    // accidentally execute them during a render.
    for (var i = 0; i < invoker.children.length; i++) {
      var child = invoker.children[i];
      this.markNodeRelationsAsForGraft(child, true, true);
    }
    d.resolve();
    return d.promise;
  },

  // _beforeCreationPersists: function(newItemContainer, intoList) {
  //   var self = this;
  //   return function(clone) {
  //     // clone.pruneRelations(form);
  //     // We can't prune relations here because what if there are multiple forms
  //     // hooked up to the same list!
  //     Util.Log.Info("Processing incoming on newly created item");
  //     // Now RUN relations 
  //     var p = Util.Promise.defer();
  //     // Now turn OFF creation only.
  //     self.markNodeRelationsAsForGraft(clone, false, true, newItemContainer);

  //     clone._processIncoming(undefined, {disableRemote: true}, intoList).then(
  //       function() {
  //         // Turn back ON creation only.
  //         self.markNodeRelationsAsForGraft(clone, true, true, newItemContainer);
  //         // Now insert! The insertion handler on an enumerated node should cause
  //         // any corresponding data structures to also be altered.
  //         var newIndex = intoList.children.length;
  //         intoList.insertChild(clone, newIndex - 1, true, function(newNode) {
  //           for (var i = 0; i < newNode.parentNode.relations.length; i++) {
  //             var are = newNode.parentNode.relations[i];
  //             if (are.name == 'are') {
  //               var opposite = are.opposite(newNode.parentNode);
  //               var iterables = this._getIterables(opposite);
  //               intoList.children.length
  //             }
  //           }

  //           var filterFn = Util.Helper.rejectUnless(newNode.parentNode, newNode);
  //           newNode.pruneRelations(null, null, filterFn);
  //         });

  //         if ((typeof CTS != 'undefined') && (typeof CTS.engine != 'undefined') && (typeof CTS.engine.ui != 'undefined')) {
  //           CTS.engine.ui.hideSendingModal();
  //         }

  //         // Finally, let's reset the form elements.
  //         Util._.each(newItemContainer.value.find('input'), function(elem) {
  //           var $elem = Util.$(elem);
  //           if ($elem.is('[type="checkbox"]')) {
  //             if ($elem.attr('default')) {
  //               if ($elem.attr('default').toLowerCase() == 'false') {
  //                 $elem.prop('checked', false);
  //               } else {
  //                 $elem.prop('checked', !! $elem.attr('default'));
  //               }
  //             } else {
  //               $elem.prop('checked', false);
  //             }           
  //           } else {
  //             if ($elem.attr('default')) {
  //               $elem.val($elem.attr('default'));
  //             } else {
  //               $elem.val('');
  //             }                
  //           }
  //         });
  //         p.resolve();
  //       },
  //       function(reason) {
  //         console.log(reason);
  //         p.reject(reason);
  //       }
  //     );
  //     return p.promise;
  //   }
  // },

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

  // _cloneIterable: function(toward, cloneFromIndex, insertAfterIndex, throwEvent, beforePersistenceFn, cloneRelns, filterFn) {

    // Step 1: Clone an iterable from the GRAFT-related container.
                     // list      cloneSource           dest(last) event  beforePFn  cloneRelns
    var iterables = this._getIterables(intoList);    
    this._cloneIterable(intoList, iterables.length - 1, undefined, false, undefined, true).then(
      function(clone) {
        if (!clone) {
          debugger;
          return deferred.reject("Clone null.");
        }

        // Step 3: Filter relations
        var filterFnInst = filterFn(clone);
        filterFnInst.deletionPolicy = 'mark';
        clone.pruneRelations(undefined, undefined, filterFnInst);

        var otherFilterFn = self._makeAreTreeFilter(intoList, clone, iterables.length);
        clone.pruneRelations(undefined, undefined, otherFilterFn);
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

            // Step 6: Call childInserted on the receiving container
            // intoList.trigger("ChildInserted", {
            //   eventName: "ChildInserted",
            //   ctsNode: clone,
            //   sourceNode: intoList,
            //   sourceTree: intoList.tree,
            //   afterIndex: iterables.length - 1
            // });

          },
          function(err) {
            deferred.reject(err);
          }
        );

        deferred.resolve(clone);
      },
      function(err) {
        deferred.resolve(err);
      }
    );

    // var iterables = this._getIterables(intoList);
    // // args: container, cloneIdx, insertAfter, throwEvent
    // var beforePersistenceFn = function(clone) {
    //   var deferred = Util.Promise.defer();
    //   self.markNodeRelationsAsForGraft(clone, false, true, newItemContainer);
    //   debugger;
    //   clone._processIncoming(undefined, {disableRemote: true}).then(
    //     function() {
    //       self.markNodeRelationsAsForGraft(clone, true, true, newItemContainer);
    //       deferred.resolve();
    //     },
    //     function(err) {
    //       deferred.reject(err);
    //     }
    //   );
    //   return deferred.promise;
    // };



    return deferred.promise;
  },

  // 3. ProcessIncoming
  // --- Important. At this point, it is just as if a child was
  // --- inserted from another process.
  // 4. Call childInserted.

  _cloneChildrenWithRelations: function(template, invoker) {

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

    return Util.Promise.all(
      Util._.map(template.getChildren(), function(node) {
        return node.clone(undefined, true, invoker, filterFn);
      })
    );
  },

  _regularGraft: function(invoker, template) {
    var d = Util.Promise.defer();
    var self = this;

    this._cloneChildrenWithRelations(template, invoker).then(
      function(templateCopy) {
        // Now we run the graft.
        Util.Promise.all(
          Util._.map(templateCopy, function(templateNode) {
            return templateNode._processIncoming(undefined, undefined, templateNode);
          })
        ).then(
          function() {
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
    return [];
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
