
export default class ImageTile extends EventTarget
{
	static requiredDbKeys = [ "thumbCache" ];

    constructor( idh, id )
    {
		super();

		/*
		this.iocb = new IntersectionObserver( async ( entries ) => {
			for( const entry of entries ){
				if( entry.isIntersecting ){
					entry.target.src = this.images[entry.target.dataset.index].url;
					await entry.target.decode();
					if( entry.target.hasAttribute( "src") ){
						entry.target.style.visibility = "visible";
					}
				} else{
					entry.target.style.visibility = "hidden";
					entry.target.removeAttribute( "src" );
				}
			}
		}, {
			rootMargin: "300px 0px"
		} );
		*/
		this.idh = idh;

		this.thumbWorkerReady = true;
		this.thumbCache = {};

        this.rootElement = document.createElement( "div" );
        this.rootElement.id = id;

		this.rootElement.style.display  = "flex";
		this.rootElement.style.flexWrap = "wrap";
		this.rootElement.style.gap      = "2px";
		this.rootElement.style.padding  = "2px";

		this.baseHeight = 220;
		
        this.#init();
    }

    #init()
    {
        this.lineStart      = 0;
        this.lineEnd        = 0;
		this.images         = [];
        this.imgsRatio      = [];
        this.totalLineWidth = 0;
		this.numImages      = 0;
    }

	async loadThumbsFromDb()
	{
		try {
			await this.idh.loadDataAsync( "thumbCache", ( key, value ) => {
				this.thumbCache[key] = value;
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

	async #tiling_async( image, gallery_width )
	{
		let cur_width = 0, cur_ratio = 0

    	cur_ratio = this.baseHeight / image.realHeight;
    	cur_width = image.realWidth * cur_ratio;

    	if( gallery_width < ( this.totalLineWidth + cur_width ) ){
    		const image_cnt  = this.lineEnd - this.lineStart;
    		const zoom_ratio = gallery_width / this.totalLineWidth;

    		for( let i = 0; i < image_cnt; i++ ){
    			this.images[this.lineStart + i].element.width  = ( this.images[this.lineStart + i].realWidth * this.imgsRatio[i] * zoom_ratio ) - 2;
    			this.images[this.lineStart + i].element.height = ( this.images[this.lineStart + i].realHeight * this.imgsRatio[i] * zoom_ratio ) - 2;
    		}
        
    		this.imgsRatio = [];
    		this.totalLineWidth = 0;
    		this.lineStart = this.lineEnd;
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

	async reCalcTilingAsync()
	{
		const gallery_style = getComputedStyle( this.rootElement );
    	const gallery_width = this.rootElement.clientWidth - parseFloat( gallery_style.paddingLeft ) - parseFloat( gallery_style.paddingRight );

		if( ! this.numImages ) return;

		this.lineStart      = 0;
		this.lineEnd        = 0;
		this.totalLineWidth = 0;
		this.imgsRatio      = [];

		for( const image of this.images ){
			await this.#tiling_async( image, gallery_width );
		}

		this.#tiling_finish();

		return this.numImages;
	}

	async #workerPool( array, start_index, maxjobs, cb )
	{
		let cur_idx = start_index;

		async function worker()
		{
			while( 1 ){
				const i = cur_idx++;
				if( i >= array.length ) return;
				await cb( array[i] );
			}
		}

		await Promise.all(
			Array.from( { length: Math.min( maxjobs, array.length ) }, () => worker() )
		);
	}

	async #findImageFilesAsync( dir_handle, gid ){
		let cnt = 0;
		for await ( const [name, handle] of dir_handle.entries() ){
    		if( handle.kind === "directory" ){
    		  	cnt += await this.#findImageFilesAsync( handle, gid );
    		  	continue
    		} else if( handle.kind != "file" ){
    		  	continue;
    		}

			const ev_dir_open = new CustomEvent( "OpenDirectory", {
				detail: { handle: handle }
			} );
			this.dispatchEvent( ev_dir_open );
        
    		if( /\.(jpe?g|png)$/i.test( name ) ){
				this.images.push( {
					fileObj: await handle.getFile(),
					gruopId: gid
				} );
			}
		}
		return cnt;
	}

	async #createThumbnailsAsync()
	{
		if( ! this.thumbWorkerReady ) return;

		this.thumbWorkerReady = false;

		try{
			let thumbdb = {};

			while( 1 ){
				let pending = [];
				let thumbblob;

				for( const image of this.images ){
					if( image.thumbKey ) pending.push( image );
				}
				if( ! pending.length ) break;

				await this.#workerPool( pending, 0, 3, async ( image ) => {
					const t_base_height = this.baseHeight * 2;
					const ratio        = t_base_height / image.realHeight;

					if( ratio < 1 ){
						const target_width  = Math.round( image.realWidth * ratio );
						const target_height = Math.round( image.realHeight * ratio );
						let canvas_width    = image.realWidth;
						let canvas_height   = image.realHeight;
						let canvas_index    = 0;
						let source          = image.element;

						const canvas_arr = [
							{ canvas: document.createElement( "canvas" ), ctx: null	},
							{ canvas: document.createElement( "canvas" ), ctx: null	}
						];

						for( let i = 0; i < 2; i++ ){
							canvas_arr[i].ctx = canvas_arr[i].canvas.getContext( "2d" );
							canvas_arr[i].ctx.imageSmoothingEnabled = true;
							canvas_arr[i].ctx.imageSmoothingQuality = "high";
						}

						await image.element.decode();

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
						
						thumbblob = await new Promise( ( resolve, reject ) => {
							canvas_arr[canvas_index].canvas.toBlob( ( blob ) => {
								if( blob ){
									resolve( blob );
								} else{
									console.error("canvas.toBlob failed", {
										canvas_width: canvas_width,
										canvas_height: canvas_height,
										target_width: target_width,
										target_height: target_height,
										url: image.url
									});
									reject( new Error( "Failed to create thumbname for " + image.url ) );
								}
							}, "image/png", 0.8 );
						} );
						
						image.thumbUrl = URL.createObjectURL( thumbblob );
					} else{
						image.thumbUrl = null;
					}

					thumbdb[image.thumbKey] = thumbblob;

					image.thumbKey    = null;
					image.element.src = image.thumbUrl ?? image.url;
				} );
				await this.idh.storeDataAsync( "thumbCache", thumbdb );
			}
		} catch( e ){
			console.error( e );
		} finally{
			this.thumbWorkerReady = true;
		}
	}

    async addImagesByDirHandleAsync( dir_handle, gid )
    {
    	let cnt = 0;

    	const gallery_style = getComputedStyle( this.rootElement );
    	const gallery_width = this.rootElement.clientWidth - parseFloat( gallery_style.paddingLeft ) - parseFloat( gallery_style.paddingRight );

		await this.#findImageFilesAsync( dir_handle, gid );
		await this.#workerPool( this.images, this.numImages, 10, async ( image ) => {
			image.url      = URL.createObjectURL( image.fileObj );
			image.thumbKey = JSON.stringify({
				dirName : dir_handle.name,
				fileName: image.fileObj.name,
				size    : image.fileObj.size,
				lastMod : image.fileObj.lastModified
			});
			image.thumbUrl = this.thumbCache[image.thumbKey] ?
				 URL.createObjectURL( this.thumbCache[image.thumbKey] ) : null; 
			if( image.thumbUrl ) image.thumbKey = null;

			image.element          = document.createElement( "img" );
			image.element.alt      = "";
			image.element.loading  = "eager";
			image.element.decoding = "async";
			image.element.dataset.groupId = gid;
			image.element.dataset.index   = this.numImages + cnt++;
			image.element.style.contentVisibility = "auto";

			//逆参照用
			image.element.imageTileObj = image;
			
			try{
				return await new Promise( ( resolve, reject ) => {
					image.element.addEventListener( "load", () => {
						image.realWidth  = image.element.naturalWidth;
						image.realHeight = image.element.naturalHeight;
						//this.iocb.observe( image.element );
						resolve();
					}, { once: true } );
					image.element.addEventListener( "error", () => {
						reject();
					}, { once: true } );
					image.element.src = image.thumbUrl || image.url;
				} );
			} catch{
				URL.revokeObjectURL( image.url );
				if( image.thumbUrl ) URL.revokeObjectURL( image.thumbUrl );
				image.url        = null;
				image.element    = null;
				image.realWidth  = 0;
				image.realHeight = 0;
			}
		} );

		for( let i = this.numImages; i < this.images.length; i++ ){
			if( this.images[i].element ){
				//this.images[i].element.loading  = "lazy";
				await this.#tiling_async( this.images[i], gallery_width );
				this.rootElement.appendChild( this.images[i].element );
			}
		}

		this.#tiling_finish();
		//this.#createThumbnailsAsync();

		this.numImages += cnt;
    	return cnt;
    }

    clear()
    {
        this.rootElement.replaceChildren();

		for( const image of this.images ) {
	  		URL.revokeObjectURL( image.url );
			if( image.thumbUrl ) URL.revokeObjectURL( image.thumbUrl );
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
