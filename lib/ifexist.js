/*
 * IF-EXIST
 * ========
 *
 * Intended as a Mix-In to Relation.
 */

var Util = require('cts/util');
var Model = require('cts/model');

var IfExist = function(node1, node2, spec) {
  this.klass = IfExist;
  if (typeof spec == 'undefined') {
    spec = {};
  }
  this.node1 = node1;
  this.node2 = node2;
  this.spec = spec;
  this.name = 'if-exist';
  this.initializeBase();
};

Util._.extend(IfExist.prototype, Model.Relation.Base, {

  execute: function(toward) {
    if (this.spec.forCreationOnly) {
      return;
    }

    var other = this.opposite(toward);
    if (this.truthyOrFalsy(other)) {
      toward.unhide();
    } else {
      toward.hide();
    }
  },

  clone: function(n1, n2) {
    if (Util._.isUndefined(n1)) {
      n1 = this.node1;
    }
    if (Util._.isUndefined(n2)) {
      n2 = this.node2;
    }
    return new IfExist(n1, n2, this.spec);
  },

  eventInterestFor: function(n) {
    return ['ValueChanged'];
  },

  _subclass_handleEventFromNode: function(evt, thrownFrom, thrownTo) {
    if (evt.eventName == 'ValueChanged') {
      this.execute(thrownTo);      
    }
  }

});

module.exports = IfExist;
