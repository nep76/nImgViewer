
export default class UpslideNotification {

    constructor()
    {
		this.timerId  = null;
		this.promiseResolve = null;

		this.html    = document.createRange().createContextualFragment( `
			<div id="UpslideNotification" class="UpslideNotification-hide" hidden>
				<p id="UpslideNotification-content"></p>
				<button id="UpslideNotification-ok" hidden>OK</button>
			</div>
		` );

		this.domTree = {
			root:    this.html.firstElementChild,
			content: this.html.getElementById( "UpslideNotification-content" ),
			ok     : this.html.getElementById( "UpslideNotification-ok" )
		};

		this.domTree.root.addEventListener( "transitionend", ( e ) => {
			if( e.currentTarget.classList.contains( "UpslideNotification-hide" ) ){
				e.currentTarget.hidden = true;
			}
		} );

		this.domTree.ok.addEventListener( "click", () => {
			this.#close();
			if( this.promiseResolve ){
				this.promiseResolve();
				this.promiseResolve = null;
			}
		} );
    }

	#close()
	{
		this.domTree.root.classList.replace( "UpslideNotification-show", "UpslideNotification-hide" );
		this.timerId = null;
	}

	getRootElement()
	{
		return this.domTree.root;
	}

	show( text, interactive = false, async = false )
	{
		let promise;

		if( this.timerId ){
			if( interactive ) throw new Error( "An interactive notification is already in progress." );
			clearTimeout( this.timerId );
		}

		this.domTree.content.textContent = text;
		this.domTree.root.hidden = false;

		if( interactive ){
			this.domTree.ok.hidden = false;
			if( async ) promise = new Promise( ( resolve ) => { this.promiseResolve = resolve; } );
		} else{
			this.domTree.ok.hidden = true;
			this.timerId = setTimeout( () => this.#close(), 3000 );
		}
		
		requestAnimationFrame( () => {
			requestAnimationFrame( () => {
				this.domTree.root.classList.replace( "UpslideNotification-hide", "UpslideNotification-show" );
			} );
		} );

		return promise;
	}

	hide()
	{
		if( this.timerId ){
			clearTimeout( this.timerId );
			this.#close();
		}
	}
}