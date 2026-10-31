
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

		this.displayReady = true;
		this.displayIndex = 0;

		this.thumbWorkerReady = true;
		this.thumbWorkerPromise = null;
		this.thumbCache = {};

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
        this.lineStart      = 0;
        this.lineEnd        = 0;
		this.images         = [];
        this.imgsRatio      = [];
        this.totalLineWidth = 0;
		this.numImages      = 0;
		this.thumbCache     = {};
		this.displayIndex   = 0;
		this.linesOffset    = [];
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

	#tiling( image )
	{
		let cur_width = 0, cur_ratio = 0;

    	cur_ratio = this.baseHeight / image.realHeight;
    	cur_width = image.realWidth * cur_ratio;

    	if( this.galleryWidth < ( this.totalLineWidth + cur_width ) ){
    		const image_cnt  = this.lineEnd - this.lineStart;
    		const zoom_ratio = this.galleryWidth / this.totalLineWidth;

    		for( let i = 0; i < image_cnt; i++ ){
    			this.images[this.lineStart + i].element.width  = ( this.images[this.lineStart + i].realWidth * this.imgsRatio[i] * zoom_ratio ) - 2;
    			this.images[this.lineStart + i].element.height = ( this.images[this.lineStart + i].realHeight * this.imgsRatio[i] * zoom_ratio ) - 2;
    		}
        
    		this.imgsRatio.length = 0;
    		this.totalLineWidth = 0;
    		this.lineStart = this.lineEnd;
			this.linesOffset.push( this.lineStart );
    	}

    	this.totalLineWidth += cur_width;
    	this.imgsRatio.push( cur_ratio );

    	this.lineEnd++;
	}

	#tiling_finish()
	{
		for( let i = this.lineStart; i < this.lineEnd; i++ ){
    		this.images[i].element.width  = this.images[i].realWidth * ( this.baseHeight / this.images[i].realHeight );
    		this.images[i].element.height = this.baseHeight;
		}
	}

	async reCalcTilingAsync( signal )
	{
		if( ! this.numImages ) return;

		this.lineStart        = 0;
		this.lineEnd          = 0;
		this.totalLineWidth   = 0;
		this.imgsRatio.length = 0;

		this.#updateGalleryWidth();

		for( let i = 0; i < this.images.length; i++ ){
			if( signal?.aborted ) return;

			this.#tiling( this.images[i] );

			if( i % 100 === 99 ) await ImageTile.#sleep( 0 );
		}

		this.#tiling_finish();
	}

	async #workerPoolAsync( array, start_index, maxjobs, cb, signal )
	{
		let cur_idx = start_index;

		async function worker()
		{
			while( ! signal?.aborted ){
				const i = cur_idx++;
				if( i >= array.length ) return;
				
				await cb( array[i] );
			}
		}

		await Promise.all(
			Array.from( { length: Math.min( maxjobs, array.length ) }, () => worker() )
		);
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

	async #createThumbnailsAsync( signal )
	{
		if( ! this.thumbWorkerReady ) return;

		this.thumbWorkerReady = false;

		try{
			let thumbdb = {};

			const t_base_height = this.baseHeight * 2;

			while( ! signal?.aborted ){
				const pending = [];

				for( const image of this.images ){
					if( image.thumbUrl !== image.url && ( ! this.thumbCache[image.thumbKey].data.done ) ){
						pending.push( image );
					}
				}
				if( ! pending.length ) break;
				
				await this.#workerPoolAsync( pending, 0, 4, async ( image ) => {
					if( signal?.aborted ) return;

					const ratio = t_base_height / image.realHeight;

					let blob;
					if( ratio < 1 ){
						const bitmap = await createImageBitmap( image.fileObj );
						try {					
							const target_width  = Math.round( image.realWidth * ratio );
							const target_height = Math.round( image.realHeight * ratio );
							let canvas_width    = image.realWidth;
							let canvas_height   = image.realHeight;
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

							URL.revokeObjectURL( this.thumbUrl );
							image.thumbUrl = image.element.src;
						} finally{
							bitmap.close();
						}
					}

					this.thumbCache[image.thumbKey].data.done = true;
					this.thumbCache[image.thumbKey].data.blob = blob;
					thumbdb[image.thumbKey] = this.thumbCache[image.thumbKey].data;

					if( Object.keys( thumbdb ).length >= 10 ){
						const chunk = thumbdb;
						thumbdb = {};
						await this.idh.storeDataAsync( "thumbCache", chunk );
					}
				}, signal );

				if( Object.keys( thumbdb ).length ){
					await this.idh.storeDataAsync( "thumbCache", thumbdb );
				}
			}
		} catch( e ){
			console.error( e );
		} finally{
			this.thumbWorkerReady   = true;
			this.thumbWorkerPromise = null;
		}
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

    async addImagesByDirHandleAsync( dir_handle, gid, signal )
    {
		const maxjobs = Math.min( navigator.hardwareConcurrency || 4, 6 );
		let thumbdb = {};
    	let max_entries, cnt = 0;

		this.#updateGalleryWidth();

		{
			const new_images = [];

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

		await this.#workerPoolAsync( this.images, this.numImages, maxjobs, async ( image ) => {
			if( signal?.aboted ) return;

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
			image.element.dataset.index   = this.numImages + cnt++;
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
			
			try{
				return await new Promise( ( resolve, reject ) => {
					image.element.addEventListener( "load", async () => {
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
					}, { once: true } );

					image.element.addEventListener( "error", () => {
						reject();
					}, { once: true } );
					
					image.element.src = image.thumbUrl ?? image.url;
				} );
			} catch{
				URL.revokeObjectURL( image.url );
				if( image.thumbUrl ) URL.revokeObjectURL( image.thumbUrl );
				image.url        = null;
				image.element    = null;
				image.realWidth  = 0;
				image.realHeight = 0;
			}
		}, signal );

		if( Object.keys( thumbdb ).length ) await this.idh.storeDataAsync( "thumbCache", thumbdb );
		
		this.#tiling_finish();
		this.thumbWorkerPromise = this.#createThumbnailsAsync( signal );

		this.numImages += cnt;
    	return cnt;
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

	waitCancelAsync()
	{
		return this.thumbWorkerReady ? this.thumbWorkerPromise : null;
	}

    clear()
    {
        this.rootElement.replaceChildren();

		for( const image of this.images ) {
			if( image.thumbUrl && ( image.thumbUrl !== image.url ) ){
				 URL.revokeObjectURL( image.thumbUrl );
			}
	  		URL.revokeObjectURL( image.url );
		}

        this.#init();
    }

	getImagesCount()
	{
		return this.numImages;
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
