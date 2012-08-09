# node-couch-sequence

Simple sequence based document versioning for CouchDB. Requires a [Cradle](https://github.com/cloudhead/cradle/) connection to CouchDB for the Changes API.

## Usage

The module will subscribe to a changes feed via the CouchDB Changes API and monitor all the documents within the 'watchList' array.

``npm install node-couch-sequence``

``var opts = { db: [CRADLE_CONNECTION], versioningDoc: 'NAME_OF_DOC_TO_STORE_VERSIONS', watchList: ['products', 'categories']};``
``var SequenceHandler = require('node-couch-sequence')(opts);``

