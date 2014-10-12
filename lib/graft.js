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

    console.log("pruned", opp.value);

    var towardOpts = this.optsFor(toward);
    var fromOpts   = this.optsFor(opp);
    var res;
    if (typeof fromOpts.createNew != 'undefined') {
      var res = this._creationGraft(toward, towardOpts, opp, fromOpts);
    } else {
      var res = this._regularGraft(toward, opp);
    }

    console.log("Addinggrafter", opp.value);
    opp.addGrafter(toward);
    return res;
  },

  _creationGraft: function(toward, towardOpts, from, fromOpts) {
    var d = Util.Promise.defer();
    var createOn = null;
    var self = this;
    if (typeof towardOpts.createOn != 'undefined') {
      createOn = toward.find(towardOpts.createOn);
    } else {
      createOn = toward.find('button');
    }
    Util.Log.Info("Creating on", createOn);
    if ((createOn != null) && (createOn.length> 0)) {
      createOn[0].click(function() {
        self._runCreation(toward, towardOpts, from, fromOpts);
      });
    }

    for (var i = 0; i < toward.children.length; i++) {
      var child = toward.children[i];
      this.markNodeRelationsAsForGraft(child, true, true);
    }
    d.resolve();
    return d.promise;
  },

  _beforeCreationPersists: function(newItemContainer, intoList) {
    var self = this;
    return function(clone) {
      // clone.pruneRelations(form);
      // We can't prune relations here because what if there are multiple forms
      // hooked up to the same list!
      Util.Log.Info("Processing incoming on newly created item");
      // Now RUN relations 
      var p = Util.Promise.defer();
      // Now turn OFF creation only.
      self.markNodeRelationsAsForGraft(clone, false, true, newItemContainer);

      clone._processIncoming(undefined, {disableRemote: true}).then(
        function() {
          // Turn back ON creation only.
          self.markNodeRelationsAsForGraft(clone, true, true, newItemContainer);
          // Now insert! The insertion handler on an enumerated node should cause
          // any corresponding data structures to also be altered.
          intoList.insertChild(clone, intoList.children.length - 1, true);
          if ((typeof CTS != 'undefined') && (typeof CTS.engine != 'undefined') && (typeof CTS.engine.ui != 'undefined')) {
            CTS.engine.ui.hideSendingModal();
          }

          // Finally, let's reset the form elements.
          Util._.each(newItemContainer.value.find('input'), function(elem) {
            var $elem = Util.$(elem);
            if ($elem.is('[type="checkbox"]')) {
              if ($elem.attr('default')) {
                if ($elem.attr('default').toLowerCase() == 'false') {
                  $elem.prop('checked', false);
                } else {
                  $elem.prop('checked', !! $elem.attr('default'));
                }
              } else {
                $elem.prop('checked', false);
              }           
            } else {
              if ($elem.attr('default')) {
                $elem.val($elem.attr('default'));
              } else {
                $elem.val('');
              }                
            }
          });
          p.resolve();
        },
        function(reason) {
          console.log(reason);
          p.reject(reason);
        }
      );
      return p.promise;
    }
  },

  _runCreation: function(newItemContainer, newItemOpts, intoList, intoListOpts) {
    // Step 1: Assume iterable on FROM side.
    var iterables = this._getIterables(intoList);
    var self = this;

    if ((typeof CTS != 'undefined') && (typeof CTS.engine != 'undefined') && (typeof CTS.engine.ui != 'undefined')) {
      CTS.engine.ui.showSendingModal();
    }

    // // Create a new one.
    return iterables[iterables.length - 1].clone(this._beforeCreationPersists(newItemContainer, intoList), true);

  },

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
            return templateNode._processIncoming();
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
            deferred.resolve();
          },
          function(err) {
            deferred.reject(err);
          }
        );
      },
      function(err) {
        deferred.reject(err);
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
