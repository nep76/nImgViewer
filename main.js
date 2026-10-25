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

document.getElementById( "delete-ok" ).addEventListener( "click", async () => {
	e.currentTarget.disabled = true;

	try {
		gImageTile.clear();
		await gImgDir.clearAsync();
		update_status();
	} finally{
		e.currentTarget.disabled = true;
	}

	document.getElementById( "delete-modal" ).close();
} );

document.getElementById( "rebuild" ).addEventListener( "click", async ( e ) => {
	const button = e.currentTarget;
	const backup_label = button.textContent;

	button.disabled = true;
	button.textContent = "読み込み中...";

	try{
		for( const key of Object.keys( gDeniedDirHandle ) ){
			const perm = await gDeniedDirHandle[key].dirHandle.requestPermission( { mode: "read" } );
			if( perm === "granted" ){
				await gImageTile.addImagesByDirHandleAsync( gDeniedDirHandle[key].dirHandle, key );
			} else{
				console.log( `nImgViewer: Permission denied to read for the directory: ${gDeniedDirHandle[key].dirHandle.name }` );
			}
		}

		gDeniedDirHandle = {};
	} finally{
		button.textContent = backup_label;
		button.disabled = false;
	}

	update_status();

	document.getElementById( "rebuild-modal" ).close();
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
