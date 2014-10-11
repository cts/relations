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
    var towardOpts = this.optsFor(toward);
    var fromOpts   = this.optsFor(opp);
    if (typeof fromOpts.createNew != 'undefined') {
      return this._creationGraft(toward, towardOpts, opp, fromOpts);
    } else {
      return this._regularGraft(toward, opp);
    }
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
      child.markRelationsAsForCreation(true, true);
    }
    d.resolve();
    return d.promise;
  },

  _runCreation: function(toward, towardOpts, from, fromOpts) {
    // Step 1: Assume iterable on FROM side.
    var iterables = this._getIterables(from);
    var self = this;

    if ((typeof CTS != 'undefined') && (typeof CTS.engine != 'undefined') && (typeof CTS.engine.ui != 'undefined')) {
      CTS.engine.ui.showSendingModal();
    }

        // // Create a new one.
    return iterables[iterables.length - 1].clone(
      function(clone) {
        var form = self.opposite(from);
        // clone.pruneRelations(form);
        // We can't prune relations here because what if there are multiple forms
        // hooked up to the same list!
        Util.Log.Info("Processing incoming on newly created item");
        // Now RUN relations
        var p = Util.Promise.defer();
        // Now turn OFF creation only.
        clone.markRelationsAsForCreation(false, true, form);

        clone._processIncoming(undefined, {disableRemote: true}).then(
          function() {
            // Turn back ON creation only.
            clone.markRelationsAsForCreation(true, true, form);
            // Now insert! The insertion handler on an enumerated node should cause
            // any corresponding data structures to also be altered.
            from.insertChild(clone, from.children.length - 1, true);
            if ((typeof CTS != 'undefined') && (typeof CTS.engine != 'undefined') && (typeof CTS.engine.ui != 'undefined')) {
              CTS.engine.ui.hideSendingModal();
            }

            // Finally, let's reset the form elements.
            Util._.each(form.value.find('input'), function(elem) {
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
    );
    // // Create a new one.
    // iterables[iterables.length - 1].clone().then(
    //   function(clone) {
    //     console.log("Got cloned iterable");
    //     // Now set relations on to those coming to ME.
    //     var form = self.opposite(from);
    //     clone.pruneRelations(form);
    //             console.log("Pruned relations");

    //     // Now turn OFF creation only.
    //     clone.markRelationsAsForCreation(false, true);
    //                     console.log("Marked relations as for creation");

    //     Util.Log.Info("Processing incoming on newly created item");

    //     // Now RUN relations
    //     clone._processIncoming().then(
    //       function() {
    //         Util.Log.Tock("CTS:Graft:CreateIterable");
    //         // Turn back ON creation only.
    //         clone.markRelationsAsForCreation(true, true);
    //         // Now insert! The insertion handler on an enumerated node should cause
    //         // any corresponding data structures to also be altered.
    //         from.insertChild(clone, from.children.length - 1, true);
    //       },
    //       function(reason) {
    //         d.reject(reason);
    //       }
    //     );
    //   },
    //   function(reason) {
    //     d.reject(reason);
    //   }
    // ).done();

    // return d.promise;
  },

  _regularGraft: function(toward, opp) {
    var d = Util.Promise.defer();
    var self = this;

    //Util.Log.Info("Graft from", opp.tree.name, "to", toward.tree.name);
    //Util.Log.Info("Opp", opp.value.html());
    // Util.Log.Info("To", toward.value.html());

    if (opp != null) {

      if (Util.LogLevel.Debug()) {
        Util.Log.Debug("GRAFT THE FOLLOWING");
        CTS.Debugging.DumpTree(opp);
        Util.Log.Debug("GRAFT ONTO THE FOLLOWING");
        CTS.Debugging.DumpTree(toward);
      }

      var replacements = [];
      var promises = [];

      for (var i = 0; i < opp.children.length; i++) {
        var kidPromise = Util.Promise.defer();
        promises.push(kidPromise.promise);
        opp.children[i].clone().then(
          function(child) {
            // TODO(eob): This is a subtle bug. It means that you can't graft-map anything outside
            // the toward node that is being grafted. But if this isn't done, then ALL of the things
            // grafting one thing will overwrite each other (i.e., all users of a button widget will
            // get the label of the last widget.
            child.pruneRelations(toward);

            // TODO(eob): We were pruning before because of geometric duplication of relations
            // when graft happened multiple times, and took out the pruneRelations above because it
            // also removed relations from grafts of grafts (i.e., when one theme includes components of
            // a common libray). So.. need to make sure that the fix to _subclass_begin_clone in Node (where
            // nonzero starting .relations[] is cleared) fixes the original reason we were pruning)
            child._processIncoming().then(
              function() {
                kidPromise.resolve(child);
              },
              function(reason) {
                kidPromise.reject(reason);
              }
            );
          },
          function(reason) {
            kidPromise.reject(reason);
          }
        );
      }
      Util.Promise.all(promises).then(
        function (children) {
          for (var i = 0; i < children.length; i++) {
            replacements.push(children[i]);
          }
          if (Util.LogLevel.Debug()) {
            Util._.map(replacements, function(r) {
              Util.Log.Debug("replacement", r.value.html());
            });
          }
          toward.replaceChildrenWith(replacements);
          toward.setProvenance(opp.tree, opp);

          // We'll throw the event on the forrest.
          toward.tree.forrest.trigger('cts-received-graft', {
            target: toward,
            source: opp,
            relation: this
          });
          d.resolve();
        },
        function(reason) {
          d.reject(reason);
        }
      );
    }
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
    return [];
  }

});

module.exports = Graft;
