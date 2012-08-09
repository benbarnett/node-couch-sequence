var extend = require('xtend'),
	Queue = require('nqueue');

var SequenceHandler = (function() {

	function SequenceHandler(opts) {
		var defaults = {
			db: null,
			versioningDoc: "sequences",
			watchList: []
		};

		this.opts = extend({}, defaults, opts);

		this.init(function(lastCouchSeq) {
			this.listenForChanges(lastCouchSeq);
		});
		
		return this;
	}

	var SequencePrototype = SequenceHandler.prototype;

	/**
	* Sequence handler init, will create the change tracker document in db if it doesn't exist
	* @param  {Function} done [description]
	* @return {[type]}        [description]
	*/
	SequencePrototype.init = function(done) {
		var sequenceHandler = this,
			_done = function(lastCouchSeq, latestSequenceIndex) {
				sequenceHandler.latestSequenceIndex = latestSequenceIndex;

				sequenceHandler.takeWholeSnapshot(function(snapshot) {
					sequenceHandler.snapshot = snapshot;
					done.apply(sequenceHandler, [lastCouchSeq]);
				});
			};


		sequenceHandler.opts.db.get(sequenceHandler.opts.versioningDoc, function(err, doc) {
			if (!doc) {
				sequenceHandler.opts.db.save(sequenceHandler.opts.versioningDoc, { latestSequenceIndex: 0, lastCouchSeq: 0, diffs: {} }, function(err, doc) {
					if (err) {
						return new Error('Failed to create ' + sequenceHandler.opts.versioningDoc);
					}
					_done(0, 0);
				});
			}
			else {
				_done(doc.lastCouchSeq, doc.latestSequenceIndex);
			}
		});
	};

	/**
	* Take a snapshot of all the docs in the wathclist
	* @param  {Function} done [description]
	* @return {[type]}        [description]
	*/
	SequencePrototype.takeWholeSnapshot = function(done) {
		var sequenceHandler = this,
			queue = new Queue(),
			snapshot = {};

		this.opts.watchList.forEach(function(docID) {
			queue.push(function(_done) {
				sequenceHandler.takeSnapshot(docID, function(docSnapshot) {
					_done(docID, docSnapshot);
				});
			});
		});

		queue.execute(
			function(docID, docSnapshot) {
				snapshot[docID] = docSnapshot;
			},
			function() {
				done.apply(sequenceHandler, [snapshot]);
			}
		);
	};

	/**
	* Grab the snapshots at the current lols
	* @param  {[type]} rev optional revision || latest version
	* @return {[type]}     [description]
	*/
	SequencePrototype.takeSnapshot = function(docID, _rev, done) {
		var sequenceHandler = this,
			queue = new Queue(),
			snapshot = {};

		if (typeof _rev == 'function') {
			done = _rev;
			_rev = null;
		}

		sequenceHandler.opts.db.get(docID, _rev, function(err, doc) {
			snapshot = doc;
			done.apply(sequenceHandler, [snapshot]);
		});
	};



	/**
	* Externalise latest sequence index
	* @return {[type]} [description]
	*/
	SequencePrototype.getLatestSequenceIndex = function() {
		return ''+this.latestSequenceIndex || new Error('Not yet initalised.');
	};

	SequencePrototype.listenForChanges = function(sinceSequence) {
		var sequenceHandler = this;

		var feed = this.feed = sequenceHandler.opts.db.changes({ 
				since: sinceSequence, 
				include_docs: true, 
				filter: function(doc, req) {
					if (sequenceHandler.opts.watchList.indexOf(doc._id) > -1) {
						return true;
					}
					return false;
				} 
			});

		feed.on('change', function(change) {
			sequenceHandler.handleChange(change);
		});
	};

	/**
	* Handle a change event from the DB
	* @param  {[type]} change [description]
	* @return {[type]}        [description]
	*/
	SequencePrototype.handleChange = function(change) {
		var sequenceHandler = this;

		this.takeSnapshot(change.doc._id, change.doc._rev, function(newSnapshot) {
			var existingSnapshot = this.snapshot[change.doc._id] || {},
				changeObjects = [];

			// loop through the new snapshot and compare
			this.filterGeneric(Object.keys(newSnapshot)).forEach(function(key) {
				var data = newSnapshot[key];

				// this has been added
				if (typeof existingSnapshot[key] === 'undefined') {
					changeObjects.push(sequenceHandler.generateChangeObject('INSERT', key, data));
				}
				else {
					// has it changed?
					if (JSON.stringify(data) !== JSON.stringify(existingSnapshot[key])) {
						changeObjects.push(sequenceHandler.generateChangeObject('UPDATE', key, data));
					}
				}
			});

			// loop through the other way to check for deletions
			this.filterGeneric(Object.keys(existingSnapshot)).forEach(function(key) {
				if (typeof newSnapshot[key] === 'undefined') {
					changeObjects.push(sequenceHandler.generateChangeObject('DELETE', key));
				}
			});

			// write to db and increment sequence index
			this.saveSequence(++this.latestSequenceIndex, change.seq, change.doc._id, changeObjects);

			// update the main snapshot to this new image
			this.snapshot[change.doc._id] = newSnapshot;
		});
	};

	SequencePrototype.generateChangeObject = function(action, key, data) {
		return {
			action: action,
			key: key,
			data: typeof data == 'array' ? this.filterGeneric(data) : data
		};
	};

	/**
	* Write this patch script to the db
	* @param  {[type]} sequenceIndex [description]
	* @param  {[type]} docID         [description]
	* @param  {[type]} changeObjects [description]
	* @return {[type]}               [description]
	*/
	SequencePrototype.saveSequence = function(sequenceIndex, lastCouchSeq, docID, changeObjects) {
		var sequenceHandler = this;

		sequenceHandler.opts.db.get(this.opts.versioningDoc, function(err, doc) {
			var data = doc.diffs;
			data[sequenceIndex] = {};
			data[sequenceIndex][docID] = changeObjects;

			sequenceHandler.opts.db.merge(sequenceHandler.opts.versioningDoc, { 
				latestSequenceIndex: sequenceIndex,
				lastCouchSeq: lastCouchSeq,
				diffs: data
			}, function(err, res) {
				// console.log(res);
			});
		});
	};

	/**
	* Get changes doc and send all the changes since this ID
	* @param  {[type]} sinceIndex [description]
	* @return {[type]}            [description]
	*/
	SequencePrototype.getChangesSince = function(sinceIndex, done) {
		sequenceHandler.opts.db.get(this.opts.versioningDoc, function(err, doc) {
			if (err) {
				return done(err, null);
			}


			var changes = [];
			Object.keys(doc.diffs).forEach(function(index) {
				if (index <= sinceIndex) return;
				changes.push(doc.diffs[index]);
			});

			done(null, changes);
		});
	};

	/**
	* Filter out the generic properties from the doc so we only deal with the data
	* @param  {[type]} arr [description]
	* @return {[type]}     [description]
	*/
	SequencePrototype.filterGeneric = function(arr) {
		return arr.filter(function(element, index, array) {
			return element != '_id' && element != '_rev';
		});
	};

	return SequenceHandler;

})();

module.exports = new SequenceHandler();