
export default class IndexedDbHash extends EventTarget {
	constructor( name, ver, keys )
	{
		super();

		if( name === null || name === undefined || name === "" ) throw new Error( "ImageDb: Database name required." );

		this.name = name;
		this.ver  = ver;
		this.keys = keys;
  	}

  	#open_db()
  	{
    	return new Promise( ( resolve, reject ) => {
      		const req = indexedDB.open( this.name, this.ver );

    	  	req.onupgradeneeded = ( e ) => {
	        	const db = req.result;

				for( const key of Array.from( db.objectStoreNames ) ){
        			db.deleteObjectStore( key );
    			}

				for( const key of this.keys ){
					db.createObjectStore( key );
				}

				this.dispatchEvent(
					new CustomEvent( "idh_upgrade", {
						detail: {
							currentVersion : e.newVersion,
							previousVersion: e.oldVersion
						}
					} )
				);
      		};
      		req.onsuccess = () => resolve( req.result );
      		req.onerror   = () => reject( req.error );
    	} );
  	}

	async loadDataAsync( key, cb )
	{
		const db = await this.#open_db( key );
		const data = {};

		try{
			await new Promise( ( resolve, reject ) => {
				const tx  = db.transaction( key, "readonly" );
				const req = tx.objectStore( key ).openCursor();
				req.onsuccess = ( e ) => {
					const cursor = e.target.result;
					if( cursor ){
						if( cb ){
							cb( cursor.key, cursor.value );
						} else{
							data[cursor.key] = cursor.value;
						}
						cursor.continue();
					} else{
						resolve();
					}
				};
				req.onerror = () => reject( req.error );
				tx.onerror  = () => reject( tx.error );
				tx.onabort  = tx.onerror;
			} );
		} finally{
		  	db.close();
		}
		return cb ? null : data;
	}

	async storeDataAsync( key, dic )
	{
		const db = await this.#open_db( key );

		try{
			await new Promise( ( resolve, reject ) => {
			  	const tx    = db.transaction( key, "readwrite" );
			  	const store = tx.objectStore( key );

			  	for( const id of Object.keys( dic ) ){
			    	store.put( dic[id], id );
			  	}

			  	tx.oncomplete = resolve;
			  	tx.onerror = () => reject( tx.error );
			  	tx.onabort = tx.onerror;
			} );
		} finally{
		  	db.close();
		}

		return dic;
	}

	async removeDataAsync( key, id_arr )
	{
		const db = await this.#open_db( key );

		try{
			await new Promise( ( resolve, reject ) => {
			  	const tx    = db.transaction( key, "readwrite" );
			  	const store = tx.objectStore( key );

			  	id_arr.forEach( ( id ) => { store.delete( id ) } );

			  	tx.oncomplete = resolve;
			  	tx.onerror = () => reject( tx.error );
			  	tx.onabort = tx.onerror;
			} );
		} finally{
		  	db.close();
		}
	}

	async clearDbAsync()
	{
		const db = await this.#open_db();
		db.close();

		await new Promise( ( resolve, reject ) => {
		    const req = indexedDB.deleteDatabase( this.name );

		    req.onsuccess = resolve;
		    req.onerror   = () => reject( req.error );
		    req.onblocked = () => reject( new Error( "Failed to delete db: Blocked" ) );
		} );
	}

}
