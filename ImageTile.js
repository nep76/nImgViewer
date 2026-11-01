
export default class ImageTile extends EventTarget
{
	static requiredDbKeys = [ "thumbCache" ];

	static #sleep = ( ms ) => new Promise( resolve => setTimeout( resolve, ms ) );
	static #regex = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;

    constructor( idh, id )
    {
		super();

		this.idh = idh;
		this.galleryWidth = 0;

		this.addWorkerReady = true;
		this.addWorkerPromise = null;

		this.thumbWorkerReady = true;
		this.thumbWorkerPromise = null;

		this.baseHeight = 220;
		
        this.#init();

        this.rootElement = document.createElement( "div" );
        this.rootElement.id = id;
		//window.addEventListener( "scrollend", () => {
		//	console.log( this.linesOffset );
		//} );

		this.#updateGalleryWidth();
    }

    #init()
    {
		this.knownDirList   = [];

		this.images         = [];
		this.thumbCache     = {};

		this.displayReady = true;
		this.displayIndex = 0;

		this.#initTilingContext( this );
    }

	#initTilingContext( dic ){
        dic.lineStart      = 0;
        dic.lineEnd        = 0;
        dic.totalLineWidth = 0;
        dic.imgsRatio      = [];
	}

	#updateGalleryWidth(){
		const gallery_style = getComputedStyle( this.rootElement );
    	this.galleryWidth = this.rootElement.clientWidth - parseFloat( gallery_style.paddingLeft ) - parseFloat( gallery_style.paddingRight );
	}

	async loadThumbsFromDbAsync()
	{
		try {
			await this.idh.loadDataAsync( "thumbCache", ( key, value ) => {
				this.thumbCache[key] = {
					use  : false,
					data : value
				};
			} );
		} catch( e ){
			console.error( e );
		}
	}

	getRootElement()
	{
		return this.rootElement;
	}

	getId()
	{
		return this.id;
	}

	#tiling( image, ctx = this )
	{
		let cur_width = 0, cur_ratio = 0;

    	cur_ratio = this.baseHeight / image.realHeight;
    	cur_width = image.realWidth * cur_ratio;

    	if( this.galleryWidth < ( ctx.totalLineWidth + cur_width ) ){
    		const image_cnt  = ctx.lineEnd - ctx.lineStart;
    		const zoom_ratio = this.galleryWidth / ctx.totalLineWidth;

    		for( let i = 0; i < image_cnt; i++ ){
    			this.images[ctx.lineStart + i].element.width  = ( this.images[ctx.lineStart + i].realWidth * ctx.imgsRatio[i] * zoom_ratio ) - 2;
    			this.images[ctx.lineStart + i].element.height = ( this.images[ctx.lineStart + i].realHeight * ctx.imgsRatio[i] * zoom_ratio ) - 2;
    		}
        
    		ctx.imgsRatio.length = 0;
    		ctx.totalLineWidth = 0;
    		ctx.lineStart = ctx.lineEnd;
			//this.linesOffset.push( ctx.lineStart );
    	}

    	ctx.totalLineWidth += cur_width;
    	ctx.imgsRatio.push( cur_ratio );

    	ctx.lineEnd++;
	}

	#tiling_finish( ctx = this )
	{
		for( let i = ctx.lineStart; i < ctx.lineEnd; i++ ){
    		this.images[i].element.width  = this.images[i].realWidth * ( this.baseHeight / this.images[i].realHeight );
    		this.images[i].element.height = this.baseHeight;
		}
	}

	async reCalcTilingAsync( signal )
	{
		if( ! this.images.length ) return;

		const ctx = {};

		this.#initTilingContext( ctx );
		this.#updateGalleryWidth();

		for( let i = 0; i < this.images.length && this.images[i].ready; i++ ){
			if( signal?.aborted ) return;

			this.#tiling( this.images[i], ctx );

			if( i % 100 === 99 ) await ImageTile.#sleep( 0 );
		}

		this.#tiling_finish( ctx );
	}

	async #workerPoolAsync( array, start_index, maxjobs, cb, signal )
	{
		let cur_idx = start_index;

		async function worker()
		{
			while( ! signal?.aborted ){
				const i = cur_idx++;
				if( i >= array.length ) return;
				
				try{
					await cb( array[i] );
				} catch( e ){
					const fail = new Error( `Worker failed at index ${i}`, { obj: array[i], cause: e } );
					fail.name = "ImageTileWorkerFailed";
					throw fail;
				}
			}
		}

		const results = await Promise.allSettled(
			Array.from( { length: Math.min( maxjobs, array.length ) }, () => worker() )
		);

		const errs = results.filter( ( r ) => { return r.status === "rejected" } );
		if( errs.length ){
			const fail = new AggregateError(
				errs.map( ( r ) => { return r.reason; } ),
				"Worker pool failed"
			);
			fail.name = "ImageTileWorkerPoolFailed";
			throw fail;
		}
	}

	async #findImageFilesAsync( array, dir_handle, gid ){
		for( const known_dir of this.knownDirList ){
			if( await known_dir.isSameEntry( dir_handle ) ){
				this.rootElement.dispatchEvent( new CustomEvent( "it_knowndir", {
					detail: {
						dir: dir_handle,
						id: gid
					}
				} ) );
				return;
			}
		}

		this.knownDirList.push( dir_handle );

		for await ( const [name, handle] of dir_handle.entries() ){
    		if( handle.kind === "directory" ){
    		  	await this.#findImageFilesAsync( array, handle, gid );
    		  	continue;
    		} else if( handle.kind !== "file" ){
    		  	continue;
    		}

    		if( ImageTile.#regex.test( name ) ){
				array.push( {
					dirHandle : dir_handle,
					fileHandle: handle,
					gruopId   : gid,
					ready     : false
				} );
			}
		}
	}

	async #createThumbnailBlobAsync( image )
	{
		const ratio  = ( this.baseHeight * 2 ) / image.element.naturalHeight;

		if( ratio < 1 ){
			const canvas = document.createElement( "canvas" );
			const ctx    = canvas.getContext( "2d" );

			await image.element.decode();

			canvas.width  = image.element.naturalWidth * ratio;
			canvas.height = image.element.naturalHeight * ratio;

			ctx.drawImage( image.element, 0, 0, canvas.width, canvas.height );

			const blob = await new Promise( ( resolve, reject ) => {
				canvas.toBlob( ( b ) => {
					if( b ){
						resolve( b );
					} else{
						reject( new Error( `Failed to create thumbname for ${image.url}` ) );
					}
				}, "image/png", 0.8 );
			} );

			return blob;
		}
	}

	createThumbnails( signal )
	{
		if( ! this.thumbWorkerReady ) return;

		this.thumbWorkerReady   = false;
		this.thumbWorkerPromise = ( async () => {
			let thumbdb = {};

			const t_base_height = this.baseHeight * 2;

			await this.addWorkerPromise;

			while( ! signal?.aborted ){
				const pending = [];

				for( let i = 0; i < this.images.length; i++ ){
					if( this.images[i].thumbUrl !== this.images[i].url && ( ! this.thumbCache[this.images[i].thumbKey].data.done ) ){
						pending.push( this.images[i] );
					}
				}
				if( ! pending.length ) break;

				await ImageTile.#sleep( 100 );
				
				await this.#workerPoolAsync( pending, 0, 4, async ( image ) => {
					await this.addWorkerPromise;

					if( signal?.aborted || ( ! image.ready ) ) return;

					const bitmap = await createImageBitmap( image.fileObj );
					try{
						const ratio  = t_base_height / bitmap.height;
						let blob;

						if( ratio < 1 ){	
							const target_width  = Math.round( bitmap.width * ratio );
							const target_height = Math.round( bitmap.height * ratio );
							let canvas_width    = bitmap.width;
							let canvas_height   = bitmap.height;
							let canvas_index    = 0;
							let source          = bitmap;

							const canvas_arr = [
								{ canvas: document.createElement( "canvas" ), ctx: null	},
								{ canvas: document.createElement( "canvas" ), ctx: null	}
							];

							for( let i = 0; i < 2; i++ ){
								canvas_arr[i].ctx = canvas_arr[i].canvas.getContext( "2d" );
								canvas_arr[i].ctx.imageSmoothingEnabled = true;
								canvas_arr[i].ctx.imageSmoothingQuality = "high";
							}

							while( ( canvas_height *= 0.5 ) > target_height ){
								canvas_width *= 0.5
								canvas_arr[canvas_index].canvas.width  = canvas_width;
								canvas_arr[canvas_index].canvas.height = canvas_height;
								canvas_arr[canvas_index].ctx.drawImage(
									source, 0, 0, canvas_width, canvas_height
								);
								source = canvas_arr[canvas_index].canvas;
								canvas_index = 1 - canvas_index;
							}

							canvas_arr[canvas_index].canvas.width  = target_width;
							canvas_arr[canvas_index].canvas.height = target_height;
							canvas_arr[canvas_index].ctx.drawImage(
								source, 0, 0, target_width, target_height
							);

							blob = await new Promise( ( resolve, reject ) => {
								canvas_arr[canvas_index].canvas.toBlob( ( b ) => {
									if( b ){
										resolve( b );
									} else{
										console.error("canvas.toBlob failed", {
											canvas_width: canvas_width,
											canvas_height: canvas_height,
											target_width: target_width,
											target_height: target_height,
											url: image.url
										});
										reject( new Error( `Failed to create thumbname for ${image.url}` ) );
									}
								}, "image/png", 0.8 );
							} );

							image.element.src = URL.createObjectURL( blob );

							URL.revokeObjectURL( image.thumbUrl );
							image.thumbUrl = image.element.src;
						}

						this.thumbCache[image.thumbKey].data.done = true;
						this.thumbCache[image.thumbKey].data.blob = blob;
						thumbdb[image.thumbKey] = this.thumbCache[image.thumbKey].data;

						if( Object.keys( thumbdb ).length >= 10 ){
							const chunk = thumbdb;
							thumbdb = {};
							await this.idh.storeDataAsync( "thumbCache", chunk );
						}
					} finally{
						bitmap.close();
					}
				}, signal );

				if( Object.keys( thumbdb ).length ){
					await this.idh.storeDataAsync( "thumbCache", thumbdb );
				}

				await this.addWorkerPromise;
			}
		
		} )().finally( () => {
			this.thumbWorkerPromise = null;
			this.thumbWorkerReady   = true;
		} );
	}

	async #displayImagesAsync()
	{
		if( ! this.displayReady ) return;

		this.displayReady = false;

		try{
			while( this.images[this.displayIndex]?.ready ){
				const image = this.images[this.displayIndex];

				this.#tiling( image );
				this.rootElement.appendChild( image.element );

				this.displayIndex++;
			}
		} finally{
			this.displayReady = true;

			if( this.images[this.displayIndex]?.ready ){
				this.#displayImagesAsync();
			}
		}
	}

    addImagesByDirHandle( dir_handle, gid, signal )
    {
		if( ! this.addWorkerReady ) return;

		this.addWorkerReady   = false;
		this.addWorkerPromise = ( async () => {
			const maxjobs = Math.min( navigator.hardwareConcurrency || 4, 6 );
			let thumbdb = {};
			let max_entries, cnt = 0;
			const start_num_images = this.images.length;

			{
				const new_images = [];

				this.#updateGalleryWidth();

				await this.#findImageFilesAsync( new_images, dir_handle, gid );

				new_images.sort( ( a, b ) => {
					return a.fileHandle.name.localeCompare( b.fileHandle.name, undefined, {
						numeric: true,
						sensitivity: "base"
					} );
				} );

				max_entries = new_images.length;
				this.images.push( ...new_images );
			}

			await this.#workerPoolAsync( this.images, start_num_images, maxjobs, async ( image ) => {
				if( signal?.aborted ) return;

				try{
					image.ready    = false;
					image.fileObj  = await image.fileHandle.getFile();
					image.url      = URL.createObjectURL( image.fileObj );
					image.thumbKey = JSON.stringify({
						dirName : dir_handle.name,
						fileName: image.fileObj.name,
						size    : image.fileObj.size,
						lastMod : image.fileObj.lastModified
					});

					if( this.thumbCache[image.thumbKey] ){
						this.thumbCache[image.thumbKey].use = true;
						if( this.thumbCache[image.thumbKey].data.blob ){
							image.thumbUrl = URL.createObjectURL( this.thumbCache[image.thumbKey].data.blob );
						} else{
							image.thumbUrl = image.url;
						}
					}

					image.element          = document.createElement( "img" );
					image.element.alt      = "";
					image.element.decoding = "async";
					image.element.dataset.groupId = gid;
					image.element.dataset.index   = start_num_images + cnt++;
					image.element.style.contentVisibility = "auto";

					image.element.height = this.baseHeight;

					//逆参照用
					image.element.imageTileObj = image;

					this.rootElement.dispatchEvent( new CustomEvent( "it_preloadimage", {
						detail: {
							image: image,
							dir: dir_handle,
							file: image.fileObj,
							maxEntries: max_entries,
							count: cnt
						}
					} ) );
					
					return await new Promise( ( resolve, reject ) => {
						image.element.addEventListener( "load", async () => {
							try{
								image.realWidth  = image.element.naturalWidth;
								image.realHeight = image.element.naturalHeight;

								if( ! image.thumbUrl ){
									const blob = await this.#createThumbnailBlobAsync( image );
									thumbdb[image.thumbKey] = {
										done: false,
										blob: blob
									};
									this.thumbCache[image.thumbKey] = {
										use: true,
										data: thumbdb[image.thumbKey]
									};
									if( blob ){
										image.thumbUrl = URL.createObjectURL( blob );
										image.element.src = image.thumbUrl;
									}
								}

								image.ready = true;

								this.rootElement.dispatchEvent( new CustomEvent( "it_loadimage", {
									detail: {
										image: image,
										dir: dir_handle,
										file: image.fileObj,
										maxEntries: max_entries,
										count: cnt
									}
								} ) );
								this.#displayImagesAsync();

								if( Object.keys( thumbdb ).length >= 10 ){
									const chunk = thumbdb;
									thumbdb = {};
									await this.idh.storeDataAsync( "thumbCache", chunk );
								}

								resolve();
							} catch( e ){
								reject( new Error( "Failed to create blob for image", { cause: e } ) );
							}
						}, { once: true } );

						image.element.addEventListener( "error", () => {
							reject( new Error ( "Failed to load image" ) );
						}, { once: true } );
						
						image.element.src = image.thumbUrl ?? image.url;
					} );
				} catch( e ){
					const index = this.images.indexOf( image );
					if( index !== -1 ) this.images.splice( index, 1 );

					if( image.url )      URL.revokeObjectURL( image.url );
					if( image.thumbUrl ) URL.revokeObjectURL( image.thumbUrl );
					
					let err = e;
					if( ! ( err instanceof Error ) ){
						err = new Error( "Image processing failed", { cause: e } );
					}
					err.image = image;

					throw err;
				}
			}, signal );

			if( Object.keys( thumbdb ).length ) await this.idh.storeDataAsync( "thumbCache", thumbdb );
			
			this.#tiling_finish();
		} )().finally( () => {
			this.#displayImagesAsync();

			this.addWorkerPromise = null;
			this.addWorkerReady   = true;
		} );
    }

	async cleanupThumbnailsAsync()
	{
		const trash = [];

		for( const key of Object.keys( this.thumbCache ) ){
			if( ! this.thumbCache[key].use ) trash.push( key );
		}

		await this.idh.removeDataAsync( "thumbCache", trash );
		for( const key of trash ){
			delete this.thumbCache[key];
		}
	}

	waitForParseImages()
	{
		return this.addWorkerPromise;
	}

	waitForCreateThumbnails()
	{
		return this.thumbWorkerPromise;
	}

    clear()
    {
        this.rootElement.replaceChildren();

		for( const image of this.images ) {
			if( image.thumbUrl && ( image.thumbUrl !== image.url ) ){
				 URL.revokeObjectURL( image.thumbUrl );
			}
	  		if( image.url ) URL.revokeObjectURL( image.url );
		}

        this.#init();
    }

	getImagesCount()
	{
		return this.images.length;
	}

    addEventListener( event, cb, flags )
    {
        this.rootElement.addEventListener( event, cb, flags );
    }

    removeEventListener( event, cb, flags )
    {
        this.rootElement.removeEventListener( event, cb, flags );
    }
}
