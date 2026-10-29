
export default class OverlayViewer {

	constructor( name )
	{
		this.name = name;
		this.fit = true;
		this.zoomRaf = null;
		
		this.focusRatioX = 0;
		this.focuxRatioY = 0;

		this.grabbing       = false;
		this.grabStartCoord = [ 0, 0 ];
		this.grabScrollBase = [ 0, 0 ];
		this.disableClick   = false;

		this.html = document.createRange().createContextualFragment( `
			<dialog id="OverlayViewer">
				<div id="OverlayViewer-ctrl">
					<input type="checkbox" id="OverlayViewer-grayscale"><label for="OverlayViewer-grayscale">グレースケール</label>
					<input type="checkbox" id="OverlayViewer-flip-x"><label for="OverlayViewer-flip-x">左右反転</label>
					<input type="checkbox" id="OverlayViewer-flip-y"><label for="OverlayViewer-flip-y">上下反転</label>
					<input type="range" id="OverlayViewer-zoom">
					<label for="OverlayViewer-zoom">ズーム</label> <span id="OverlayViewer-zoom-num"></span>
					<button id="OverlayViewer-close" title="閉じる" aria-label="ビューワーを閉じる" autofocus>✕</button>
				</div>
				<div id="OverlayViewer-scrl" draggable="false">
					<img id="OverlayViewer-image" draggable="false">
				</div>
			</dialog>
		` );

		this.root = this.html.firstElementChild;
		this.domTree = {
		  	ctrl : this.root.querySelector( "#OverlayViewer-ctrl" ),
		  	close: this.root.querySelector( "#OverlayViewer-close" ),
		 	scrl : this.root.querySelector( "#OverlayViewer-scrl" ),
		  	image: this.root.querySelector( "#OverlayViewer-image" ),

			grayscale: this.root.querySelector( "#OverlayViewer-grayscale" ),
			flipX    : this.root.querySelector( "#OverlayViewer-flip-x" ),
			flipY    : this.root.querySelector( "#OverlayViewer-flip-y" ),
		  	zoom     : this.root.querySelector( "#OverlayViewer-zoom" ),
			zoomNum  : this.root.querySelector( "#OverlayViewer-zoom-num" )
		};

		if( name ) this.root.className = name;
	  
		this.domTree.zoom.min   = 10;
		this.domTree.zoom.max   = 1600;
		this.domTree.zoom.value = 200;
		this.domTree.zoom.step  = 2;
	  	this.domTree.zoomNum.textContent = "100%";

		this.domTree.image.style.height = "100%";
		this.domTree.image.style.cursor = "zoom-in";
	  
		this.root.addEventListener( "click", ( e ) => {
		  if( e.target === this.domTree.root || e.target === this.domTree.scrl || e.target == this.domTree.close ){
			if( this.disableClick ){
				this.disableClick = false;
				return;
			}
		    this.hide();
		    this.setUrl( "" );

			this.fit = true;
			this.#resetZoom();			
		  }
		}, false );

		this.domTree.grayscale.addEventListener( "change", ( e ) => {
			this.domTree.image.style.filter = e.target.checked ? "grayscale(100%)" : "";
		} );

		this.domTree.flipX.addEventListener( "change", ( e ) => {
			let tf = "";
			if( this.domTree.image.style.transform.includes( "scaleY" ) ) tf = "scaleY(-1)";
			if( e.target.checked ) tf += "scaleX(-1)";
			this.domTree.image.style.transform = tf;
		} );

		this.domTree.flipY.addEventListener( "change", ( e ) => {
			let tf = "";
			if( this.domTree.image.style.transform.includes( "scaleX" ) ) tf = "scaleX(-1)";
			if( e.target.checked ) tf += "scaleY(-1)";
			this.domTree.image.style.transform = tf;
		} );

		this.domTree.zoomNum.addEventListener( "click", () => {
			this.#resetZoom();
		} );

		this.domTree.zoom.addEventListener( "pointerdown", () => {
			this.#updateFocusRatio( null, null );
		} );
		this.domTree.zoom.addEventListener( "input", () => {
			this.#updateZoom();
	  		this.domTree.zoomNum.textContent = this.domTree.zoom.value / 2 + "%";
		} );

		this.domTree.scrl.addEventListener( "pointerdown", ( e ) => {
			this.grabStartCoord[0] = e.clientX;
			this.grabStartCoord[1] = e.clientY;
			this.grabScrollBase[0] = e.currentTarget.scrollLeft;
			this.grabScrollBase[1] = e.currentTarget.scrollTop;
			this.grabbing = true;
			e.target.style.cursor = "grabbing";
		} );
		document.body.addEventListener( "pointerup", ( e ) => {
			this.grabbing = false;
			this.domTree.image.style.cursor = this.fit ? "zoom-in" : "zoom-out";
		} );
		this.domTree.scrl.addEventListener( "pointermove", ( e ) => {
			if( ! this.grabbing ) return;

			const dx = this.grabStartCoord[0] - e.clientX;
			const dy = this.grabStartCoord[1] - e.clientY;

			if( Math.abs( dx ) >= 10 || Math.abs( dy ) >= 10 ){
				this.disableClick = true;
			}

			e.currentTarget.scrollLeft = this.grabScrollBase[0] + dx;
			e.currentTarget.scrollTop  = this.grabScrollBase[1] + dy;
		} );
	  
		this.domTree.image.addEventListener( "click", ( e ) => {
			if( this.disableClick ){
				this.disableClick = false;
				return;
			}

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

	#resetZoom()
	{
		this.domTree.zoom.value = 200;
		this.domTree.zoomNum.textContent = "100%";
		this.#updateZoom();
	}

	#updateFocusRatio( x, y )
	{
		const rect = this.domTree.image.getBoundingClientRect();

		this.focusRatioY = ( y !== null ? y : this.domTree.scrl.scrollTop  + Math.min( this.domTree.image.clientHeight, this.domTree.scrl.clientHeight ) / 2 ) / rect.height;
		this.focusRatioX = ( x !== null ? x : this.domTree.scrl.scrollLeft + Math.min( this.domTree.image.clientWidth, this.domTree.scrl.clientWidth ) / 2 ) / rect.width;
	}

	#updateZoom()
	{
		const scale = this.domTree.zoom.valueAsNumber / 200;

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
	  	return this.root;
	}

	show()
	{
	  	this.root.showModal();
		
		requestAnimationFrame( () => {
			this.#updateFocusRatio( null, null );
		} );
	}

	hide()
	{
	  	this.root.close();
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
