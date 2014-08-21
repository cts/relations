/*
 * IF-EXIST
 * ========
 *
 * Intended as a Mix-In to Relation.
 */

var Util = require('cts/util');
var Model = require('cts/model');

var IfNexist = function(node1, node2, spec) {
  if (typeof spec == 'undefined') {
    spec = {};
  }
  this.node1 = node1;
  this.node2 = node2;
  this.spec = spec;
  this.name = 'if-nexist';
  this.initializeBase();
};

Util._.extend(IfNexist.prototype, Model.Relation.Base, {

  execute: function(toward) {
    if (this.spec.forCreationOnly) {
      return;
    }
    var other = this.opposite(toward);
    if (this.truthyOrFalsy(other)) {
      toward.hide();
    } else {
      toward.unhide();
    }
  },

  clone: function(n1, n2) {
    if (Util._.isUndefined(n1)) {
      n1 = this.node1;
    }
    if (Util._.isUndefined(n2)) {
      n2 = this.node2;
    }
    return new IfNexist(n1, n2, this.spec);
  }

});

module.exports = IfNexist;
