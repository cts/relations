/*
 * IS
 * ==
 *
 * Intended as a Mix-In to Relation.
 */

var Util = require('cts/util');
var Model = require('cts/model');

var Is = function(node1, node2, spec) {
  if (typeof spec == 'undefined') {
    spec = {};
  }
  this.node1 = node1;
  this.node2 = node2;
  this.spec = spec;
  this.name = 'is';
  this.initializeBase();
};

Util._.extend(Is.prototype, Model.Relation.Base, {

  execute: function(toward) {
    // CTS.Fn.map(this.node1.relations, function(r) {console.log(r.node2.ctsId, r.spec.forCreationOnly, r.node2.value.val(), r.node2.value[0])})
    if (this.spec.forCreationOnly) {
      console.log("CREATION ONLY!");
      return;
    }

    var from = this.opposite(toward);
    var content = from.getValue(this.optsFor(from));
    var res = toward.setValue(content, this.optsFor(toward));
    toward.setProvenance(from.tree, from);
    return res;
  },

  clone: function(n1, n2) {
    if (Util._.isUndefined(n1)) {
      n1 = this.node1;
    }
    if (Util._.isUndefined(n2)) {
      n2 = this.node2;
    }
    return new Is(n1, n2, this.spec);
  }

});

module.exports = Is;
