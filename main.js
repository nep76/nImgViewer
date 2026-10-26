import ImageDirStore from "./ImageDirStore.js";
import OverlayViewer from "./OverlayViewer.js";
import ImageTile from "./ImageTile.js";

const gImgDir        = new ImageDirStore( "nImgViewer" );
const gOverlayViewer = new OverlayViewer( "nImgViewer-overlay" );
const gImageTile     = new ImageTile( "gallery" );

let gDeniedDirHandle = {};

function update_status()
{
	const imgs = document.querySelectorAll( `img[data-dir-id]` );
	const cnt  = gImageTile.getImagesCount();
	document.getElementById( "status" ).textContent = `${cnt} 枚`;
	document.getElementById( "empty" ).hidden = ( cnt !== 0 );
}

document.getElementById( "add" ).addEventListener( "click", async () =>
{
	const f = document.createDocumentFragment();
	try{
		const dir = await window.showDirectoryPicker();
		if( dir ){
			const dirs = gImgDir.getDirs();
			for( const key of Object.keys( dirs ) ){
			  	if( await dirs[key].dirHandle.isSameEntry( dir ) ) return;
			}
		  
			const id  = crypto.randomUUID();
			const cnt = await gImageTile.addImagesByDirHandleAsync( dir, id );
		  
			if( cnt ){
			  	await gImgDir.storeAsync( {
			    	[id]: {
			      	dirHandle: dir,
			    	}
			  	} );
			  	update_status();
			}
		}
	} catch( e ){
	  	if( e.name !== "AbortError" ) throw e;
	}
});

document.getElementById( "reset" ).addEventListener( "click", async () => {
	document.getElementById( "delete-modal" ).showModal();
});

document.getElementById( "delete-cancel" ).addEventListener( "click", () => {
	document.getElementById( "delete-modal" ).close();
} );

document.getElementById( "delete-ok" ).addEventListener( "click", async ( e ) => {
	const button = e.currentTarget;
	button.disabled = true;

	try {
		gImageTile.clear();
		await gImgDir.clearAsync();
		update_status();
	} finally{
		button.disabled = true;
	}

	document.getElementById( "delete-modal" ).close();
} );

document.getElementById( "rebuild-ok" ).addEventListener( "click", async ( e ) => {
	document.getElementById( "rebuild-modal" ).close();

	const desc = document.getElementById( "rebuild-desc" );
	let accept_dir_handle = {};

	try{
		for( const key of Object.keys( gDeniedDirHandle ) ){
			const perm = await gDeniedDirHandle[key].dirHandle.requestPermission( { mode: "read" } );
			if( perm !== "granted" ){
				console.log( `nImgViewer: Permission denied to read for the directory: ${gDeniedDirHandle[key].dirHandle.name }` );
			} else{
				accept_dir_handle[key] = gDeniedDirHandle[key];
			}
				delete gDeniedDirHandle[key];
		}

		for( const key of Object.keys( accept_dir_handle ) ){
			await gImageTile.addImagesByDirHandleAsync( accept_dir_handle[key].dirHandle, key );
			delete accept_dir_handle[key];
		}

	} finally{
		const cnt_denied = Object.keys( gDeniedDirHandle ).length;
		update_status();
		if( cnt_denied ){
			desc.textContent = `あと ${cnt_denied} フォルダに対して許可が必要です。`;
			document.getElementById( "rebuild-modal" ).showModal();
		}
	}

	gDeniedDirHandle = {};
} );

document.getElementById( "rebuild-abort" ).addEventListener( "click", async ( e ) => {
	document.getElementById( "rebuild-modal" ).close();
	gDeniedDirHandle = {};
} );

document.addEventListener( "DOMContentLoaded", async () => {
	const dirs = await gImgDir.loadAsync();

	gImageTile.addEventListener( "click", ( e ) => {
		const img = e.target.closest( "img" );
		if( ! img || ! gImageTile.getRootElement().contains( img ) ) return;

		gOverlayViewer.setUrl( img.src );
		gOverlayViewer.show();
	} );
	
	document.body.appendChild( gOverlayViewer.getRootElement() );
	document.querySelector( "main" ).appendChild( gImageTile.getRootElement() );

	for( const key of Object.keys( dirs ) ){
		const perm = await dirs[key].dirHandle.queryPermission( { mode: "read" } );
		if( perm === "granted" ){
			await gImageTile.addImagesByDirHandleAsync( dirs[key].dirHandle, key );
		} else{
			gDeniedDirHandle[key] = dirs[key];
		}
	}

	update_status();
	
	if( Object.keys( gDeniedDirHandle ).length ){
		document.getElementById( "rebuild-modal" ).showModal();
	}

	const observer = new ResizeObserver( ( () => {
		let prev_width = null;

		return async ( entries ) => {
			for( const e of entries ){
				if( e.target !== gImageTile.getRootElement() || e.contentRect.width === prev_width ) break;
				
				prev_width = e.contentRect.width;

				await gImageTile.reCalcTilingAsync();
				break;
			}
		}
	} )() );

	observer.observe( gImageTile.getRootElement() );
} );
