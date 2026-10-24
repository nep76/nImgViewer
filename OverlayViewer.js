
export default class OverlayViewer {
	constructor( id )
	{
		let e;
		
		this.id = id;
		this.domTree = {
		  root : document.createElement( "dialog" ),
		  ctrl : document.createElement( "div" ),
		  close: document.createElement( "button" ),
		  zoom : document.createElement( "input" ),
		  scrl : document.createElement( "div" ),
		  image: document.createElement( "img" )
		};
	  
		this.domTree.root.id  = this.id;
		this.domTree.ctrl.id  = this.id + "-ctrl";
		this.domTree.close.id = this.id + "-close";
		this.domTree.zoom.id  = this.id + "-zoom";
		this.domTree.scrl.id  = this.id + "-scrl";
		this.domTree.image.id = this.id + "-image";
	  
		this.domTree.root.appendChild( this.domTree.ctrl );
		this.domTree.root.appendChild( this.domTree.scrl );
	  
		this.domTree.ctrl.appendChild( this.domTree.close );
		this.domTree.ctrl.appendChild( this.domTree.zoom );
	  
		this.domTree.scrl.appendChild( this.domTree.image );
	  
		this.domTree.close.textContent = "✕"
	  
		this.domTree.zoom.type   = "range";
		this.domTree.zoom.min    = 10;
		this.domTree.zoom.max    = 300;
		this.domTree.zoom.value  = 100;
	  
		this.domTree.root.style.position = "fixed";
		this.domTree.root.style.paddingTop = 0;
		this.domTree.root.style.paddingBottom = 0;
		this.domTree.root.style.scrollbarGutter = "stable";
		this.domTree.root.style.width = "95vw";
		this.domTree.root.style.height = "95vh";
	  
		this.domTree.ctrl.style.position = "absolute";
		this.domTree.ctrl.style.top = 0;
		this.domTree.ctrl.style.left = "50%";
		this.domTree.ctrl.style.transform = "translateX(-50%)";
	  
		this.domTree.scrl.style.overscrollBehavior = "contain";
		this.domTree.scrl.style.width = "100%";
		this.domTree.scrl.style.height = "100%";
		this.domTree.scrl.style.overflow = "auto";
		
		this.domTree.image.style.display = "block";
		this.domTree.image.style.marginInline = "auto";
		this.domTree.image.style.height = "100%";
		this.domTree.image.style.cursor = "zoom-in";
	  
		this.domTree.root.addEventListener( "click", ( e ) => {
		  if( e.target === this.domTree.root || e.target === this.domTree.scrl || e.target == this.domTree.close ){
		    this.hide();
		    this.setUrl( "" );
		  }
		}, false );
	  
		this.domTree.image.addEventListener( "click", ( e ) => {
			if( e.currentTarget.style.height === "auto" ){
			  	e.currentTarget.style.height = "100%";
			  	this.domTree.image.style.cursor = "zoom-in";
			} else{
				let rect = e.currentTarget.getBoundingClientRect();

				const y_ratio = e.offsetY / rect.height;
				const x_ratio  = e.offsetX / rect.width;

				e.currentTarget.style.height = "auto";
				e.currentTarget.style.cursor = "zoom-out";

				requestAnimationFrame( () => {
				  rect = this.domTree.image.getBoundingClientRect();
				  const scrl_rect = this.domTree.scrl.getBoundingClientRect();

				  this.domTree.scrl.scrollTop  = rect.height * y_ratio - scrl_rect.height / 2;
				  this.domTree.scrl.scrollLeft = rect.width  * x_ratio - scrl_rect.width / 2;
				} );
			}
		} );
	}

	getRootElement()
	{
	  	return this.domTree.root;
	}

	show()
	{
	  	this.domTree.root.showModal();
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
