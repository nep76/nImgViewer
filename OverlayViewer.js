
export default class OverlayViewer {
	constructor( id )
	{
		let e;
		
		this.id = id;
		this.fit = true;
		this.zoomRaf = null;
		
		this.focusRatioX = 0;
		this.focuxRatioY = 0;

		this.domTree = {
		  	root : document.createElement( "dialog" ),
		  	ctrl : document.createElement( "div" ),
		  	close: document.createElement( "button" ),
		  	zoom : document.createElement( "input" ),
			zoomNum: document.createElement( "span" ),		
		 	scrl : document.createElement( "div" ),
		  	image: document.createElement( "img" )
		};
	  
		this.domTree.root.id  = this.id;
		this.domTree.ctrl.id  = this.id + "-ctrl";
		this.domTree.close.id = this.id + "-close";
		this.domTree.zoom.id  = this.id + "-zoom";
		this.domTree.zoomNum.id = this.id + "-zoom-num";
		this.domTree.scrl.id  = this.id + "-scrl";
		this.domTree.image.id = this.id + "-image";
	  
		this.domTree.root.appendChild( this.domTree.ctrl );
		this.domTree.root.appendChild( this.domTree.scrl );
	  
		this.domTree.ctrl.appendChild( this.domTree.close );
		this.domTree.ctrl.appendChild( this.domTree.zoom );
		this.domTree.ctrl.appendChild( this.domTree.zoomNum );
	  
		this.domTree.scrl.appendChild( this.domTree.image );
	  
		this.domTree.close.textContent = "✕"
	  
		this.domTree.zoom.type   = "range";
		this.domTree.zoom.min    = 10;
		this.domTree.zoom.max    = 1600;
		this.domTree.zoom.value  = 100;

	  	this.domTree.zoomNum.textContent = this.domTree.zoom.value + "%";

		this.domTree.root.style.position = "fixed";
		this.domTree.root.style.paddingTop = 0;
		this.domTree.root.style.paddingBottom = 0;
		this.domTree.root.style.width = "95vw";
		this.domTree.root.style.height = "95vh";
	  
		this.domTree.ctrl.style.position = "absolute";
		this.domTree.ctrl.style.top = 0;
		this.domTree.ctrl.style.left = "50%";
		this.domTree.ctrl.style.transform = "translateX(-50%)";
	  
		this.domTree.zoomNum.style.cursor = "pointer";

		this.domTree.scrl.style.display = "flex";
		this.domTree.scrl.style.width = "100%";
		this.domTree.scrl.style.height = "100%";
		this.domTree.scrl.style.overflow = "auto";
		this.domTree.scrl.style.scrollbarGutter = "stable";
		this.domTree.scrl.style.overscrollBehavior = "contain";
		
		this.domTree.image.style.display = "block";
		this.domTree.image.style.marginInline = "auto";
		this.domTree.image.style.marginBlock = "auto";
		this.domTree.image.style.height = "100%";
		this.domTree.image.style.cursor = "zoom-in";
	  
		this.domTree.root.addEventListener( "click", ( e ) => {
		  if( e.target === this.domTree.root || e.target === this.domTree.scrl || e.target == this.domTree.close ){
		    this.hide();
		    this.setUrl( "" );

			this.fit = true;
			this.domTree.zoom.value = 100;
			this.domTree.zoomNum.textContent = this.domTree.zoom.value +"%";
			this.#updateZoom();
		  }
		}, false );

		this.domTree.zoomNum.addEventListener( "click", () => {
			this.domTree.zoom.value = 100;
			this.domTree.zoomNum.textContent = this.domTree.zoom.value + "%";
			this.#updateZoom();
		} );

		this.domTree.zoom.addEventListener( "pointerdown", () => {
			this.#updateFocusRatio( null, null );
		} );
		this.domTree.zoom.addEventListener( "input", () => {
			this.#updateZoom();
	  		this.domTree.zoomNum.textContent = this.domTree.zoom.value + "%";
		} );
	  
		this.domTree.image.addEventListener( "click", ( e ) => {
			this.fit = ( ! this.fit );

			this.#updateFocusRatio( e.offsetX, e.offsetY );
			if( ! this.fit ){
			  	this.#updateZoom();
			  	e.target.style.cursor = "zoom-out";
			} else{
				this.#updateZoom();
				e.target.style.cursor = "zoom-in";
			}
		} );
	}

	#updateFocusRatio( x, y )
	{
		const rect = this.domTree.image.getBoundingClientRect();

		this.focusRatioY = ( y !== null ? y : this.domTree.scrl.scrollTop  + Math.min( this.domTree.image.clientHeight, this.domTree.scrl.clientHeight ) / 2 ) / rect.height;
		this.focusRatioX = ( x !== null ? x : this.domTree.scrl.scrollLeft + Math.min( this.domTree.image.clientWidth, this.domTree.scrl.clientWidth ) / 2 ) / rect.width;
	}

	#updateZoom()
	{
		const scale = this.domTree.zoom.valueAsNumber / 100;

		this.domTree.image.style.height = this.fit ? `${100 * scale}%` : `${this.domTree.image.naturalHeight * scale}px`

		if( this.zoomRaf ) cancelAnimationFrame( this.zoomRaf );
		this.zoomRaf = requestAnimationFrame( () => {
		  const rect = this.domTree.image.getBoundingClientRect();

		  this.domTree.scrl.scrollTop  = rect.height * this.focusRatioY - this.domTree.scrl.clientHeight / 2;
		  this.domTree.scrl.scrollLeft = rect.width  * this.focusRatioX - this.domTree.scrl.clientWidth / 2;

		  this.zoomRaf = null;
		} );
	}

	getRootElement()
	{
	  	return this.domTree.root;
	}

	show()
	{
	  	this.domTree.root.showModal();

		requestAnimationFrame( () => {
			this.#updateFocusRatio( null, null );
		} );
	}

	hide()
	{
	  	this.domTree.root.close();
	}

	setUrl( url )
	{
	  	if( url === "" ){
	    	this.domTree.image.removeAttribute( "src" );
	  	} else{
	    	this.domTree.image.src = url;
	  	}
	}
}
