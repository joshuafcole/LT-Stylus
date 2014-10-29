/*****************************************************************************\
 * CONSTANTS
\*****************************************************************************/
//@FIXME require('./constants');
var constants = require('/home/josh/repos/light-table/Stylus_Language/codemirror/constants');


/*****************************************************************************\
 * UTILITY FUNCTIONS
\*****************************************************************************/
// Converts an array into map for fast and easy indexing.
function keySet(array) {
  var keys = {};
  for (var i = 0; i < array.length; ++i) {
    keys[array[i]] = true;
  }
  return keys;
}

// Converts an UpperCamelCase string to a lowerCamelCase string.
function lowerCamelCase(str) {
  return str.slice(0, 1).toLowerCase() + str.slice(1);
}

// Escapes regexp control characters in the given string.
function escapeRegExpChars(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// Merges multiple regexps / strings together via concatenation.
function join() {
  var args = [].slice.apply(arguments);
  var pattern = args.reduce(function(memo, arg) {
    return memo + (arg.source || arg || '');
  }, '', args);
  return new RegExp(pattern);
}

// Isolates the given regexp by ensuring a valid word boundary or separator prefix and suffix.
function isolate(pattern) {
  return join('(?:^| )', pattern, '(?= |$|;|\/\/|\/*)');
}

// Returns a match group for each given alternative after escaping.
function chooseRegExp(options, unsafe) {
  var alternatives;
  if(typeof options[0] === 'string') {
    if(unsafe) {
      alternatives = options.join('|');
    } else {
      alternatives = options.map(escapeRegExpChars).join('|');
    }

  } else {
    if(!options) { throw new Error('No options specified!'); }
    alternatives = join.apply(null, options.reduce(function(memo, opt) {
      if(memo.length) {
        memo.push('|');
      }
      memo.push(opt);
      return memo;
    }, [])).source;
  }

  return new RegExp('(' + alternatives  + ')');
}


function maybeToken(type, match, meta) {
  if(match) {
    var result = {
      type: type,
      text: match[0]
    };
    if(meta) {
      result.meta = meta;
    }

    return result;
  }
}

function getIndent(str, spacesPerTab) {
  return str.split('').reduce(function(memo, char) {
    return memo += (char === '\t') ? spacesPerTab : 1;
  }, 0);
}

/*****************************************************************************\
 * TOKENIZER
\*****************************************************************************/
function Tokenizer(state, opts) {
  this.state = state = state || {};
  this.opts = opts = opts || {};

  // Selector / RuleBlock / Rule / ExprBlock / Expression
  this.state.stack = state.stack || [];
  this.state.indent = state.indent || 0;

  this.opts.spacesPerTab = opts.spacesPerTab || 2;
}

var pattern = Tokenizer.prototype.pattern = {};
var tokenize = Tokenizer.prototype = {};

Tokenizer.prototype.nextToken = function(stream) {
  var stack = this.state.stack;
  var loc = this.getLocation();
  var token = this.comment(stream);
  if(token) {
    return token;
  }

  if(stream.sol()) {
    token = this.indent(stream);
    if(token) {
      if(token.type === 'Indent') {
        switch(loc) {
          case 'RuleBlock':
            stack.push('Expression');
            break;
          case 'Selector':
            stack.pop();
            stack.push('RuleBlock');
            break;
        }
      }
      else if(token.type === 'Outdent') {
        stack.pop();
      }

      return token;
    }
  }

  var name = lowerCamelCase(loc);
  var tokenizer = this[name];
  if(!tokenizer) {
    throw new Error('Could not find tokenizer for location: "' + name + '"');
  }

  token = this[name](stream) || this.space(stream);
  //console.log('Tokenizing', name, token);

  if(stream.eol()) {
    switch(loc) {
      case 'RuleBody':
        stack.pop();
        break;
    }
  }

  return token;
};

Tokenizer.prototype.getLocation = function() {
  var stack = this.state.stack;
  return stack[stack.length - 1] || 'Root';
};

tokenize.root = function(stream) {
  var token = this.selector(stream);
  if(token && token.type === 'Selector') {
    this.state.stack.push('Selector');
  }
  return token;
};



/*****************************************************************************\
 * SPACE
\*****************************************************************************/
pattern.space = /\s+/;
tokenize.space = function(stream) {
  return maybeToken('Space', stream.match(pattern.space, true));
};

tokenize.indent = function(stream) {
  var spc = this.space(stream);
  if(!spc) { return; }

  var oldIndent = this.state.indent;
  var newIndent = this.state.indent = getIndent(spc.text, this.opts.spacesPerTab);

  if(newIndent > oldIndent) {
    return {type: 'Indent', text: spc.text};
  } else if(newIndent < oldIndent) {
    return {type: 'Outdent', text: spc.text};
  }

  return spc;
};

pattern.singleComment = /^\/\/.*?(?=\n|$)/;
tokenize.singleComment = function(stream) {
  return maybeToken('Comment', stream.match(pattern.singleComment, true));
};

pattern.multiComment = /^.*?(\*\/|\n|$)/;
tokenize.multiComment = function(stream) {
  var loc = this.getLocation();
  if(loc !== 'MultiComment' && stream.match('/*', false)) {
    loc = 'MultiComment';
    this.state.stack.push(loc);
  }

  if(loc === 'MultiComment') {
    var token = maybeToken('Comment', stream.match(pattern.multiComment, true));
    if(token.text.indexOf('*/') !== -1) {
      this.state.stack.pop();
    }
    return token;
  }
};

tokenize.comment = function(stream) {
  return this.multiComment(stream) ||
    this.singleComment(stream);
};

/*****************************************************************************\
 * LITERALS
\*****************************************************************************/
// (Number / Unit / String / Identifier / Hash / List)
tokenize.literal = function(stream) {
  return tokenize.number(stream) ||
    tokenize.unit(stream) ||
    tokenize.string(stream) ||
    tokenize.identifier(stream) ||
    tokenize.hash(stream) ||
    tokenize.list(stream);
};

// 1*DIGIT / 1*DIGIT "." 1*DIGIT
pattern.number = /-?\d+(\.\d+)?/;
tokenize.number = function(stream) {
  return maybeToken('Number', stream.match(isolate(pattern.number), true));
};

// Number Unit
pattern.unit = chooseRegExp(constants.UNITS);
tokenize.unit = function(stream) {
  return maybeToken('Unit', stream.match(isolate(join(pattern.number, pattern.unit)), true));
};

pattern.string = /".*?"|'.*?'/;
tokenize.string = function(stream) {
  return maybeToken('String', stream.match(isolate(pattern.string), true));
};

pattern.identifier = /\w+/;
tokenize.identifier = function(stream) {
  return maybeToken('Identifier', stream.match(isolate(pattern.identifier), true));
};

//@FIXME BlockStart *Pairs  BlockEnd === ExprBlock;
tokenize.hash = function(stream) {
};

//@FIXME 1*(Expression *1",")
tokenize.list = function(stream) {
};

pattern.namedOperator = chooseRegExp(constants.NAMED_OPERATORS);
pattern.operator = chooseRegExp(constants.OPERATORS);
tokenize.operator = function(stream) {
  return maybeToken('Operator',
                    stream.match(chooseRegExp([pattern.namedOperator, pattern.operator]), true));
};

/*****************************************************************************\
 * EXPRESSIONS
\*****************************************************************************/
//@FIXME Will break on strings with parens. -.-
pattern.fnCall = join(pattern.identifier, /\s*(?=\()/);
tokenize.fnCall = function(stream) {
  return maybeToken('FnCall', stream.match(pattern.fnCall, true));
};

tokenize.expression = function(stream) {
  var token = this.space(stream) ||
    this.fnCall(stream) ||
    this.operator(stream) ||
    this.literal(stream);

  if(token) {
    if(token.type === 'operator') {
      if(token.text === '(') {
        this.state.stack.push('Expression');
      }
      else if(token.text === ')') {
        this.state.stack.pop();
      }
      console.log(token, this.state.stack);
    }
    return token;
  }
};

tokenize.expressionBlock = function(stream) {
  return this.expression(stream);
};


/*****************************************************************************\
 * RULES
\*****************************************************************************/
var PROPERTY_MAP = keySet(constants.PROPERTIES);
var NONSTANDARD_PROPERTY_MAP = keySet(constants.NONSTANDARD_PROPERTIES);
pattern.property = /(-|\w)+/;
tokenize.property = function(stream) {
  // @TODO filter by set of valid properties.
  var token = maybeToken('Property', stream.match(isolate(pattern.property), true));
  if(!token) { return; }
  if(PROPERTY_MAP.hasOwnProperty(token.text) || NONSTANDARD_PROPERTY_MAP.hasOwnProperty(token.text)) {
    return token;
  }
  stream.backUp(token.text.length);
};

tokenize.rule = function(stream) {
  var token = this.property(stream);
  if(token) {
    this.state.stack.push('RuleBody');
  }
  return token;
};

tokenize.ruleBody = tokenize.expression;
tokenize.ruleBody = function(stream) {
  return this.expression(stream);
};

pattern.elSelector = pattern.property;
pattern.idSelector = join('#', pattern.elSelector);
pattern.classSelector = join('\\.', pattern.elSelector);

pattern.pseudoSelector = join(/:{1,2}/, pattern.elSelector, /(\(.*?\))?/);

pattern.attrOps = chooseRegExp(constants.SELECTOR_ATTR_OPS);
pattern.attrSelector = join('\\[', pattern.property, pattern.attrOps, /.+?/, '\\]');

pattern.selector = join(
  '(', '(', pattern.elSelector, '|\\*|&)?',
  chooseRegExp([pattern.idSelector, pattern.classSelector, pattern.pseudoSelector, pattern.attrSelector]), '*',
  /(,|\s)*/, ')+(?=\n|$)');
tokenize.selector = function(stream) {
  var token = maybeToken('Selector', stream.match(isolate(pattern.selector), true));
  if(token && token.text) {
    return token;
  }
};

//@FIXME Will break on strings with parens. -.-
pattern.mixCall = join(pattern.property, /\s*(?=\()/);
tokenize.mixCall = function(stream) {
  var token = maybeToken('MixCall', stream.match(pattern.mixCall, true));
  if(token) {
    this.state.stack.push('RuleBody');
    return token;
  }
};

tokenize.ruleBlock = function(stream) {
  var token = this.rule(stream) || this.selector(stream) || this.mixCall(stream);
  if(token && token.type === 'Selector') {
    this.state.stack.push('Selector');
  }

  return token;
};

/*****************************************************************************\
 * DEBUG
\*****************************************************************************/
var fs = require('fs');
var CM = CodeMirror;
var Stream = CM.StringStream;

function readTokens(lines) {
  var tokenizer = new Tokenizer();
  var tokens = [];
  for(var i = 0; i < lines.length; i++) {
    var stream = new Stream(lines[i]);
    while(!stream.eol()) {
      var token = tokenizer.nextToken(stream);
      if(!token || !token.text) {
        console.log('STACK', tokenizer.state.stack);
        console.log('TOKENS', tokens);
        throw new Error('Failed to advance stream at: [' + i + '/' + stream.pos + '] "' +
                        stream.string.slice(0, stream.pos) + ']|[' + stream.string.slice(stream.pos) + '"');
      }
      token.loc = tokenizer.getLocation();
      tokens.push(token);

    }
  }
  return tokens;
}

var lines = fs.readFileSync('/home/josh/repos/light-table/cm-stylus/test/test.styl', {encoding: 'utf8'}).split('\n');
readTokens(lines);


// var tokenizer = new Tokenizer({stack: ['RuleBlock']});
// tokenizer.nextToken(stream);

// /*jshint expr:true*/
// tokenizer.state;
// [stream.pos, stream.string];
