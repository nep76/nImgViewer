// まずgetRootElementでDOMを繋げてからつかうこと
// 画像のサイズ計算ができない

export default class ImageTile extends EventTarget
{
    constructor( id )
    {
		super();

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
        this.imgs           = [];
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

	async #tiling_async( img, gallery_width )
	{
		let cur_img_width = 0, cur_img_ratio = 0

		await img.decode();

		console.log( img.naturalWidth );

    	cur_img_ratio =  this.baseHeight / img.naturalHeight;
    	cur_img_width = img.naturalWidth * cur_img_ratio;

    	if( gallery_width < ( this.totalLineWidth + cur_img_width ) ){
    		const image_cnt  = this.lineEnd - this.lineStart;
    		const zoom_ratio = gallery_width / this.totalLineWidth;

    		for( let i = 0; i < image_cnt; i++ ){
    			this.imgs[this.lineStart + i].style.width  = ( this.imgs[this.lineStart + i].naturalWidth * this.imgsRatio[i] * zoom_ratio ) - 2 + "px";
    			this.imgs[this.lineStart + i].style.height = "auto";
    		}
        
    		this.imgsRatio = [];
    		this.totalLineWidth = 0;
    		this.lineStart = this.lineEnd;
    	}

    	this.totalLineWidth += cur_img_width;
    	this.imgsRatio.push( cur_img_ratio );

    	this.lineEnd++;
	}

	#tiling_finish()
	{
		for( let i = this.lineStart; i < this.lineEnd; i++ ){
    		this.imgs[i].style.width  = "auto";
    		this.imgs[i].style.height = this.baseHeight + "px";
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

		for( const img of this.imgs ){
			await this.#tiling_async( img, gallery_width );
		}

		this.#tiling_finish();

		return this.numImages;
	}

    async addImagesByDirHandleAsync( dir_handle, gid )
    {
    	let cnt = 0;

    	const gallery_style = getComputedStyle( this.rootElement );
    	const gallery_width = this.rootElement.clientWidth - parseFloat( gallery_style.paddingLeft ) - parseFloat( gallery_style.paddingRight );

    	for await ( const [name, handle] of dir_handle.entries() ){
    		if( handle.kind === "directory" ){
    		  	cnt += await this.addImagesByDirHandleAsync( handle, gid );
    		  	continue
    		} else if( handle.kind != "file" ){
    		  	continue;
    		}

			const ev_dir_open = new CustomEvent( "OpenDirectory", {
				detail: { handle: handle }
			} );
			this.dispatchEvent( ev_dir_open );
        
    		if( /\.(jpe?g|png)$/i.test( name ) ){
    		  	const file = await handle.getFile();
    		  	const url = URL.createObjectURL( file );

    		  	const img = document.createElement( "img" );
    		  	img.loading = "eager";
    		  	img.decoding = "async";
				img.width = this.baseHeight;
				img.height = this.baseHeight;
    		  	img.alt = "";
    		  	img.src = url;
    		  	img.dataset.groupId = gid;

				img.style.display = "block";

				const ev_file_open = new CustomEvent( "OpenFile", {
					detail: {
						handle: file,
						element: img
					}
				} );
				this.dispatchEvent( ev_file_open );

				this.rootElement.appendChild( img );

    			await this.#tiling_async( img, gallery_width );

				this.imgs.push( img );

    		  	cnt++;
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
