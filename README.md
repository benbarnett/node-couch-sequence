# node-couch-sequence

Simple sequence based document versioning for CouchDB. Requires a [Cradle](https://github.com/cloudhead/cradle/) connection to CouchDB for the Changes API. It can be used to publish version based datasets to clients, without having to resend the entire dataset each time an update is requested.

## Usage

The module will subscribe to a changes feed via the CouchDB Changes API and monitor all the documents within the 'watchList' array.

```javascript
npm install node-couch-sequence

var opts = { 
	db: [CRADLE_CONNECTION], 
	versioningDoc: 'NAME_OF_DOC_TO_STORE_VERSIONS', 
	watchList: ['products', 'categories']
};

var SequenceHandler = require('node-couch-sequence')(opts);
```

You can then query the sequence handler as much as you like:

```javascript
var latest = SequenceHandler.getLatestSequenceIndex();
```

```javascript
SequenceHandler.getChangesSince([SEQUENCE NUMBER], function(err, changes) {
	console.log(changes);
});
```

## Example response from getChangesSince()

```javascript
"1": {
   "products": [
       {
           "action": "UPDATE",
           "key": "FirstProduct",
           "data": "New product name"
       }
   ]
},
"2": {
   "products": [
       {
           "action": "INSERT",
           "key": "AnotherProduct",
           "data": null
       },
       {
           "action": "DELETE",
           "key": "FirstProduct"
       }
   ]
}
```

As in,

```javascript
"SEQUENCE_NUMBER": {
	"DOCUMENT_NAME": [
		// ARRAY_OF_CHANGES
		{
			"action": "INSERT/UPDATE/DELETE",
			"key": "KEY THAT HAS BEEN MODIFIED",
			"data": "THE NEW DATA"
		},
		///
	]
}
```