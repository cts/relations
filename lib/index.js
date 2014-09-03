var Util = require('cts/util');
var Is = require('./is.js');
var Are = require('./are.js');
var Graft = require('./graft.js');
var IfExist = require('./ifexist.js');
var IfNexist = require('./ifnexist.js');

var Factory = {
  CreateFromSpec: function(node1, node2, spec) {
    if (spec.name == 'is') {
      return new Is(node1, node2, spec);
    } else if (spec.name == 'are') {
      return new Are(node1, node2, spec);
    } else if (spec.name == 'graft') {
      return new Graft(node1, node2, spec);
    } else if (spec.name == 'if-exist') {
      return new IfExist(node1, node2, spec);
    } else if (spec.name == 'if-nexist') {
      return new IfNexist(node1, node2, spec);
    } else {
      Util.Log.Fatal("Unsure what kind of relation this is:", spec.name);
      return null;
    }
  }
};

module.exports = {
  Is:       Is,
  Are:      Are,
  Graft:    Graft,
  IfExist:  IfExist,
  IfNexist: IfNexist,
  Factory:  Factory
};