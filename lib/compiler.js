/*

C Preprocessor


© 2016 - Guillaume Gonnet
License GPLv2

Source at https://github.com/ParksProjets/C-Preprocessor

*/


// Libraries
var EventEmitter = require('events'),
	fs = require("fs"),
	path = require("path");



// Return the last character if the string
String.prototype.last = function() {
	return this.slice(-1);
};



// Remove and add in the same time
String.prototype.splice = function(idx, rem, s) {
	return (this.slice(0,idx) + s + this.slice(idx + rem));
};



// Get the next "..." string
String.prototype.getNextString = function() {
	var str = this.match(/^"([A-Za-z0-9\-_\. \/\\]+)"/);
	return (!str || !str[1]) ? '' : str[1];
};




// Test if a character is alpha numeric or _
var StringArray = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";

String.prototype.isAlpha = function(i) {
	return StringArray.indexOf(this[i]) != -1;
};
var Compiler = function(opt) {

	// Inherit of EventEmitter
	EventEmitter.call(this);


	// Options object
	this.options = {};
	this.options.endLine = '\n';
	this.options.commentEscape = true;
	this.options.includeSpaces = 1;
	this.options.emptyLinesLimit = 0;
	this.options.basePath = './';
	this.options.stopOnError = true;
	this.options.enumInHex = true;

	// Apply options
	opt = opt || {};
	for (var i in opt)
		this.options[i] = opt[i];


	// Defined objects
	this.defines = {};

	// #pragma once include
	this.includeOnce = {};
};



// Inherit of EventEmitter, constructor and exports
Compiler.prototype = Object.create(EventEmitter.prototype);
Compiler.prototype.constructor = Compiler;
exports.Compiler = Compiler;




// Compile a text code
Compiler.prototype.compile = function(code, filename) {
	if (filename)
		this.options.filename = filename;

	var processor = new Processor(this, code);
	processor.run();
};





// Compile a file
Compiler.prototype.compileFile = function(file) {
	var _this = this;
	
	fs.readFile(_this.options.basePath + file, 'utf8', function(err, code) {

		if (err)
			return _this._error(`can't read file "${file}"`);

		_this.options.filename = file;

		var processor = new Processor(_this.parent, code);
		processor.run();
	});
};





// Emit an error
Compiler.prototype._error = function(text) {
	this.emit('error', text);
};


// Emit a success
Compiler.prototype._success = function(code) {
	this.emit('success', code);
};
var Processor = function(parent, code) {

	// Parent compiler
	this.parent = parent;
	this.options = parent.options;


	// Defined objects
	this.defines = parent.defines;

	// Is the processor running ?
	this.running = false;


	// Code & result text
	this.code = code;
	this.result = '';

	// Number of empty lines
	this.emptyLines = 0;

	// Current line & file
	this.currentLine = 0;
	this.currentFile = this.options.filename || 'main';

	// Current path
	var p = path.dirname(this.currentFile);
	this.path = (p == '.') ? '' : p + '/';


	// Bind some parent functions
	this.createConstant = parent.createConstant.bind(this);
	this.createMacro = parent.createMacro.bind(this);

	// Bind some others functions
	this.parseNext = this.parseNext.bind(this);
	this.next = this.next.bind(this);
};



// Constructor
Processor.prototype.constructor = Processor;




// Run the processor
Processor.prototype.run = function() {
	var _this = this;

	// Set the processor as running
	this.running = true;
	

	// Get an array of all lines
	var lines = this.code.split('\n');
	this.linesCount = lines.length;

	// Return the next line
	function nextLine() {
		return lines[_this.currentLine++];
	}

	this.nextLine = nextLine;


	// Parse the first line
	this.next();
};




// Parse the next lines (doing it synchronous until an assynchronous command)
Processor.prototype.next = function() {
	
	var running = true;
	while (this.currentLine < this.linesCount && running && this.running)
		running = (this.parseNext() !== false);

	if (this.currentLine >= this.linesCount)
		this.success();
};




// Append a line to the result
Processor.prototype.addLine = function(line) {
	this.result += line + this.options.endLine;
	this.emptyLines = 0;
};






// Emit an error
Processor.prototype.error = function(msg) {
	if (this.options.stopOnError)
		this.running = false;

	msg = `(line ${this.currentLine} in "${this.currentFile}") ${msg}`;
	this.parent._error(msg);
};



// Emit the success
Processor.prototype.success = function() {
	if (this.onsuccess)
		this.onsuccess();
	else
		this.parent._success(this.result);
};
Processor.prototype.parseNext = function() {

	// No more line to parse: stop this function
	if (this.currentLine >= this.linesCount)
		return false;


	// Get the line
	var line = this.nextLine(),
		text = line.trimLeft();


	// If the line is empty: apply empty lines limit option
	if (text.length == 0) {
		if (this.options.emptyLinesLimit && this.emptyLines >= this.options.emptyLinesLimit)
			return;

		this.emptyLines++;
		return this.addLine(line);
	}


	// The line starts with a # comment: delete it
	if (this.options.commentEscape && text.startsWith("//#"))
		return;

	if (this.options.commentEscape && text.startsWith("/*#"))
		return this.commentEnd();



	// Check if there is a # command
	var split = text.split(' '),
		first = split[0].trim(),
		name = first.substr(1);


	// If the line dosn't start with #
	if (first[0] != '#')
		return this.addLine(this.addDefines(line));


	// Get the remaining text (without the # command)
	split.shift();
	text = split.join(' ').trimLeft();


	// Get the # command
	var cmd = Commands[name];

	// If the command exists: call the corresponding function
	if (cmd)
		return cmd.call(this, text);


	// Else: remove the line if 'commentEscape' is enabled
	if (!this.options.commentEscape)
		this.addLine(this.addDefines(line));
};
// Add defines object to a line
Processor.prototype.addDefines = function(line) {
	
	// Local variables
	var i1 = -1, i2;
	var d, r;


	// See if the constant is present in the line
	for (var i in this.defines) {

		d = this.defines[i];

		i2 = i.length;
		i1 = -1;

		// It can have the same constant more than one time
		for (;;) {

			// Get the position of the constant (-1 if not present)
			i1 = line.indexOf(i, i1 + 1);
			if (i1 == -1)
				break;

			// Check that the constant isn't in a middle of a word and add the constant if not
			if (line.isAlpha(i1 - 1) || line.isAlpha(i1 + i2))
				continue;

			// Add the macro or the constant
			if (d.count)
				r = this.addMacro(line, i1, d);
			else
				r = this.addConstant(line, i1, d);

			line = r.line;
			i1 = r.index;
			break;
		}
	}

	return line;
};





// Create a constant
Compiler.prototype.createConstant = function(name, value) {

	// Add defines object to the constant value
	value = this.addDefines(value);

	// Store the constant
	this.defines[name] = {
		name: name,
		value: value
	};
};





// Add a constant in a line
Processor.prototype.addConstant = function(line, i, constant) {
	
	line = line.splice(i, constant.name.length, constant.value);
	i += constant.value.length;

	return { line: line, index: i };
};
// Create a macro (text must have the macro arguments be like this '(a,b) a+b')
Compiler.prototype.createMacro = function(name, text) {

	// First, get macro arguments
	var args = [];

	var end = text.indexOf(")"),
		i1 = 1,
		i2 = 0;


	// If there is no closing parenthesis
	if (end == -1)
		return this.error(`no closing parenthesis in the #define of marcro ${name}`);
	

	// Get arguments
	while( (i2 = text.indexOf(",", i2 + 1)) != -1 && i2 < end) {
		args.push(text.substring(i1, i2).trim());
		i1 = i2 + 1;
	}

	args.push(text.substring(i1, end));


	// Remove arguments in the text
	text = text.substr(end + 1).trimLeft();



	// Secondly, makes breaks and store variables positions
	var breaks = [];

	for (var i = 0, l = args.length, p; i < l; i++) {

		i1 = -1;
		p = args[i];
		i2 = p.length;

		for(;;) {
			i1 = text.indexOf(p, i1+1);
			if (i1 == -1)
				break;

			if (text.isAlpha(i1-1) || text.isAlpha(i1+i2))
				continue;

			breaks.push([ i1, i, i2 ]);
		}
	}


	// Sort variables in order of their position in the macro text
	breaks.sort(function(a, b) {
		return a[0] - b[0]
	});



	// Thirdly, cut the text into parts without variable and add defined constants
	var offset = 0,
		content = [],
		pos = [];
		i = 0;

	for (; i < breaks.length; i++) {
		content[i] = this.addDefines(text.slice(offset, breaks[i][0]));
		offset = breaks[i][0] + breaks[i][2];
		pos[i] = breaks[i][1];
	}

	content[i] = this.addDefines(text.slice(offset));



	// Fourthly, store the macro
	this.defines[name] = {
		content: content,
		count: args.length,
		pos: pos,
		name: name
	};
};








// Read a line and transform macro by adding their value
Processor.prototype.addMacro = function(line, i, macro) {

	// Local variables
	var m = 0,
		e = i + macro.name.length,
		s = e,
		l = 0,
		args = [];


	// Get arguments between parenthesis (by counting parenthesis)
	for (var v, l = line.length; e < l; e++) {

		v = line[e];

		if (v == "(") {
			m++;
			if (m == 1)
				s = e + 1;
		}

		else if (v == "," && m == 1) {
			args.push(line.slice(s, e));
			s = e + 1;
		}

		else if (v == ")") {
			if (m == 1)
				break;
			m--;
		}

		else if (v != ' ' && m == 0) {
			return this.error(`there is no openning parenthesis for macro ${macro.name}`);
		}
	}


	// If the closing parenthesis is missing
	if (m != 1)
		return this.error(`the closing parenthesis is missing for macro ${macro.name}`);

	// Add the last argument
	args.push(line.slice(s, e));


	// Check if there is the right number of arguments
	if (args.length > macro.count)
		return this.error(`too many arguments for macro ${macro.name}`);

	if (args.length < macro.count)
		return this.error(`too few arguments for macro ${macro.name}`);
	

	// Execute 'addDefines' on each argument
	for (var j = 0; j < macro.count; j++)
		args[j] = this.addDefines(args[j]);


	// Replace macro variables with the given arguments
	var str = macro.content[0];

	for (s = 0, l = macro.pos.length; s < l; s++)
		str += args[ macro.pos[s] ] + macro.content[s+1];


	// Add the result into the line
	line = line.splice(i, e - i + 1, str);
	i += str.length;

	return { line: line, index: i };
};
// Go to the next #elif, #else or #endif
Processor.prototype.conditionNext = function(end) {
	
	// #if commands to strat a condition
	var ifCmd = ['#if', '#ifdef', '#ifndef'];

	// #else commands
	var elseCmd = ['#elif', '#else'];


	// Local variables
	var line, s, n = 1;


	// Count unexploited condtion
	while (this.currentLine < this.linesCount) {

		line = this.nextLine().trimLeft();
		s = line.split(' ')[0].trim();

		if (ifCmd.indexOf(s) != -1)
			n++;

		else if (!end && n == 1 && elseCmd.indexOf(s) != -1)
			return this.callCondition(line);

		else if (s == "#endif") {
			n--;
			if (n == 0)
				return;
		}
	}
};





// Call a #else or #elif condition
Processor.prototype.callCondition = function(text) {
	
	// Get the command name
	var split = text.split(' '),
		name = split[0].trim().substr(1);

	// Get the remaining text (without the # command)
	split.shift();
	text = split.join(' ').trimLeft();


	// Call the coresponding command
	Commands[name].call(this, text, true);
};





// Go to the end of the condtion (#endif)
Processor.prototype.conditionEnd = function() {
	this.conditionNext(true);
};
// Go to the end of a multi-line comment
Processor.prototype.commentEnd = function() {

	this.currentLine--;
	var line, i;
	
	// Find the end of the comment
	while (this.currentLine < this.linesCount) {
		line = this.nextLine();

		if (line.indexOf("*/") != -1)
			break;
	}
};
// List of all commands
var Commands = {};



// Create a command
function createCommand(name, fn) {
	Commands[name] = fn;
}



createCommand("include", function(text) {
	var _this = this;
	
	// Get the name of the file to include
	var name = text.getNextString();
	if (!name)
		return this.error('invalid include');
	

	// File to read
	var file = this.path + name;

	// The file is already included and #pragma once
	if (this.parent.includeOnce[file])
		return;


	// Read the file, asynchronous and parse it
	fs.readFile(this.options.basePath + file, 'utf8', function(err, code) {

		if (err)
			return _this.error(`can't read file "${file}"`);

		var p = path.dirname(file);
		p = (p == '.') ? '' : p + '/';

		var processor = new Processor(_this.parent, code);
		processor.currentFile = file;
		processor.path = p;

		// On success: add file content to the result
		processor.onsuccess = function() {

			var e = '';
			for (var i = 0, l = _this.options.includeSpaces; i < l; i++)
				e += _this.options.endLine;

			_this.addLine(e + processor.result.trim() + e);
			_this.next();
		}

		processor.run();
	});


	// Block the synchronous loop
	return false;
});
// #define command
createCommand("define", function(text) {

	// Get the constant/macro name
	var i = 0;
	while (text.isAlpha(i))
		i++;

	var name = text.substr(0, i),
		isMacro = text[i] == '(';

	text = text.substr(name.length).trimLeft();


	// Read multiline constants/macro if there is an '\' at the end of the line
	var str = text.trimRight();
	text = '';

	while (str.last() == "\\") {
		text += str.substr(0, str.length - 1) + this.options.endLine;
		str = this.nextLine().trimRight();
	}

	text += str;


	// If there if is an '(' after the name: define a macro
	if (isMacro)
		this.createMacro(name, text);

	// Else: create a constant
	else
		this.createConstant(name, text);
});





// #undef command
createCommand("undef", function(text) {
	
	// Get the constant/macro name
	var i = 0;
	while (text.isAlpha(i))
		i++;

	var name = text.substr(0, i);


	// Delete the constant/macro
	delete this.defines[name];
});
// #if command
// See README to know how to use this command
createCommand("if", function(expr) {

	// Exectute 'defined' function
	var i, i2, name;

	while ( (i = expr.indexOf('defined(')) != -1 ) {
		i2 = expr.indexOf(')', i);
		name = expr.substring(i + 8, i2);
		expr = expr.splice(i, i2 + 1 - i, this.defines[name] === undefined ? 'false' : 'true');
	}


	// Replace constants by their values
	expr = this.addDefines(expr);


	// Evaluate the expression
	try {
		var r = eval(expr);
	} catch(e) {
		return this.error('error when evaluating #if expression');
	}


	// If the expr is 'false', go to the next #elif, #else or #endif
	if (!r)
		this.conditionNext();
});





// #ifdef command (note: '#ifdef VARIABLE' is faster than '#if defined(VARIABLE)')
createCommand("ifdef", function(text) {
	
	// Get the constant/macro name
	var i = 0;
	while (text.isAlpha(i))
		i++;

	var name = text.substr(0, i);


	// Checks if the constant/macro exists
	if (this.defines[name] === undefined)
		this.conditionNext();
});





// #ifndef command (note: '#ifndef VARIABLE' is faster than '#if !defined(VARIABLE)')
createCommand("ifndef", function(text) {
	
	// Get the constant/macro name
	var i = 0;
	while (text.isAlpha(i))
		i++;

	var name = text.substr(0, i);


	// Checks if the constant/macro  doesn't exist
	if (this.defines[name] !== undefined)
		this.conditionNext();
});








// #elif command
createCommand("elif", function(expr, called) {

	// If this command wasn't callaed by 'this.callCondition'
	if (!called)
		return this.conditionEnd();

	// Else: execute this command as an #if command
	Commands.if.call(this, expr);
});




// #else command
createCommand("else", function(expr, called) {

	// If this command wasn't callaed by 'this.callCondition'
	if (!called)
		return this.conditionEnd();

	// Else: nothing to compute, parse the next line
});







// #endif command
createCommand("endif", function(expr, called) {
	// Do nothing beacause this command is already evaluated by 'this.conditionNext'
});
// #pragma command
createCommand("pragma", function(text) {
	
	text = text.trim();

	// #pragma once: include a file once
	if (text == 'once')
		this.parent.includeOnce[this.currentFile] = true;

	// Else: error
	else
		this.error(`unknown pragma "${text}"`);
});





// #enum command: c like enumeration
createCommand("enum", function(text) {

	// Get the enum options
	text = text.replace(/=/g, ':');

	try {
		eval(`var opt = { ${text} }`);
	} catch(e) {
		var opt = {};
	}


	// Default options
	opt.start = opt.start || 0;
	opt.step = opt.step || 1;


	// Get all names of constants to create
	var line, str = '';

	while (this.currentLine < this.linesCount) {
		line = this.nextLine();
		if (line.trimLeft().startsWith("#endenum"))
			break;

		str += line;
	}
	

	var split = str.split(','),
		name, v;

	for (var i = 0, l = split.length; i < l; i++) {

		name = split[i].trim();
		v = opt.start + i * opt.step

		this.defines[name] = {
			value: this.options.enumInHex ? '0x'+v.toString(16) : v.toString(),
			name: name
		};
	}
});



// #endenum command
createCommand("endenum", function() {
	// Do nothing beacause this command is evaluated by the #enum command
});