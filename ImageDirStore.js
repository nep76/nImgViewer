
export default class ImageDirStore {
	constructor( name )
	{
		if( name === null || name === undefined || name === "" ) throw new Error( "ImageDirStore: Name required." );

		this.name = name;
    	this.dirs = {};
  	}

  	#open_db()
  	{
    	return new Promise( ( resolve, reject ) => {
      		const req = indexedDB.open( this.name, 1 );

    	  	req.onupgradeneeded = () => {
	        	const db = req.result;
        		db.createObjectStore( "dirs", { keyPath: "__id__" } );
      		};
      		req.onsuccess = () => resolve( req.result );
      		req.onerror   = () => reject( req.error );
    	} );
  	}

	async loadAsync()
	{
		const db = await this.#open_db();
		
		try{
			const dirs_arr = await new Promise( ( resolve, reject ) => {
			  	const req = db.transaction( "dirs", "readonly" ).objectStore( "dirs" ).getAll()
			  	req.onsuccess = () => resolve( req.result );
			  	req.onerror   = () => reject( req.error );
			}) ;
			
			for( const data of dirs_arr ){
			  	this.dirs[data["__id__"]] = data;
			  	delete this.dirs[data["__id__"]]["__id__"];
			}
		} finally{
		  	db.close();
		}
	  
		return this.dirs;
	}

	async storeAsync( dic )
	{
		const db = await this.#open_db();

		try{
			await new Promise( ( resolve, reject ) => {
			  	const tx    = db.transaction( "dirs", "readwrite" );
			  	const store = tx.objectStore( "dirs" );

			  	for( const key of Object.keys( dic ) ){
			    	store.put( { ...dic[key], "__id__": key } );
			  	}

			  	tx.oncomplete = () => {
			    	Object.assign( this.dirs, dic );
			    	resolve();
			  	} 
			  	tx.onerror = () => reject( tx.error );
			  	tx.onabort = tx.onerror;
			} );
		} finally{
		  	db.close();
		}
	}

	async removeAsync( ...keys )
	{
		const db = await this.#open_db();

		try{
			await new Promise( ( resolve, reject ) => {
			  	const tx    = db.transaction( "dirs", "readwrite" );
			  	const store = tx.objectStore( "dirs" );

			  	keys.forEach( key => store.delete( key ) );

			  	tx.oncomplete = () => {
			    	keys.forEach( key => delete this.dirs[key] );
			    	resolve();
			  	}
			  	tx.onerror = () => reject( tx.error );
			  	tx.onabort = tx.onerror;
			} );
		} finally{
		  	db.close();
		}
	}

	async clearAsync()
	{
		const db = await this.#open_db();
		db.close();

		await new Promise( ( resolve, reject ) => {
		    const req = indexedDB.deleteDatabase( this.name );

		    req.onsuccess = resolve;
		    req.onerror   = () => reject( req.error );
		    req.onblocked = () => reject( new Error( "Failed to delete db: Blocked" ) );
		} );

		this.dirs = {};
	}

	getDirs()
	{
	  	return this.dirs;
	}
}
