// まずgetRootElementでDOMを繋げてからつかうこと
// 画像のサイズ計算ができない

export default class ImageTile extends EventTarget
{
    constructor( id )
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
			//	this.images[this.lineStart + i].element.style.containIntrinsicSize = `${this.images[this.lineStart + i].element.width}px ${this.images[this.lineStart + i].element.height}px`;
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
		//	this.images[i].element.style.containIntrinsicSize = `${this.images[i].element.width}px ${this.images[i].element.height}px`;
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

	async #workerPool( start_index, maxjobs, cb )
	{
		let cur_idx = start_index;
		const images = this.images;

		async function worker()
		{
			while( 1 ){
				const i = cur_idx++;
				if( i >= images.length ) return;
				await cb( images[i] );
			}
		}

		await Promise.all(
			Array.from( { length: Math.min( maxjobs, images.length ) }, () => worker() )
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
					fileHandle: await handle.getFile(),
					gruopId: gid
				} );
			}
		}
		return cnt;
	}

    async addImagesByDirHandleAsync( dir_handle, gid )
    {
    	let cnt = 0;

    	const gallery_style = getComputedStyle( this.rootElement );
    	const gallery_width = this.rootElement.clientWidth - parseFloat( gallery_style.paddingLeft ) - parseFloat( gallery_style.paddingRight );

		await this.#findImageFilesAsync( dir_handle, gid );

		await this.#workerPool( this.numImages, 10, async ( image ) => {
			image.url         = URL.createObjectURL( image.fileHandle );
			image.element     = document.createElement( "img" );
			image.element.alt      = "";
			image.element.decoding = "async";
			image.element.dataset.groupId = gid;
			image.element.dataset.index   = this.numImages + cnt++;

			image.element.style.contentVisibility = "auto";
			
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
					image.element.src = image.url;
				} );
			} catch{
				URL.revokeObjectURL( image.url );
				image.url        = null;
				image.element    = null;
				image.realWidth  = 0;
				image.realHeight = 0;
			}
		} );
		
		for( let i = this.numImages; i < this.images.length; i++ ){
			if( this.images[i].element ){
				this.images[i].element.loading  = "lazy";
				await this.#tiling_async( this.images[i], gallery_width );
				this.rootElement.appendChild( this.images[i].element );
			}
		}

		this.#tiling_finish();
		this.numImages += cnt;

    	return cnt;
    }

    clear()
    {
        this.rootElement.replaceChildren();

		const imgs = this.rootElement.getElementsByTagName( "img" );
		for( const img of imgs ) {
	  		URL.revokeObjectURL( img.src );
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
