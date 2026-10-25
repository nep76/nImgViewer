import ImageDirStore from "./ImageDirStore.js";
import OverlayViewer from "./OverlayViewer.js";
import ImageTile from "./ImageTile.js";

const gImgDir        = new ImageDirStore( "nImgViewer" );
const gOverlayViewer = new OverlayViewer( "nImgViewer-overlay" );
const gImageTile     = new ImageTile( "gallery" );

function update_status()
{
	const imgs = document.querySelectorAll( `img[data-dir-id]` );
	const cnt  = gImageTile.getImagesCount();
	document.getElementById( "status" ).textContent = `${cnt} 枚`;
	document.getElementById( "empty" ).hidden = cnt > 0;
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
	gImageTile.clear();
	await gImgDir.clearAsync();
	update_status();
});

async function rebuild_gallery()
{
	const dirs = gImgDir.getDirs();

	let success = true;

	for( const key of Object.keys( dirs ) ){
		const perm = await dirs[key].dirHandle.queryPermission( { mode: "read" } );
		if( perm === "granted" ){
		  	const num = await gImageTile.addImagesByDirHandleAsync( dirs[key].dirHandle, key );
		} else{
		  	success = false;
		}
	}

	document.body.appendChild( gOverlayViewer.getRootElement() );

	update_status();

	if( ! success ){
	  	document.getElementById( "rebuild-modal" ).showModal();
	} else{
	  	document.getElementById( "rebuild-modal" ).close();
	}

	return success;
}

document.getElementById( "rebuild" ).addEventListener( "click", async () => {
	const dirs = gImgDir.getDirs();
	
	for( const key of Object.keys( dirs ) ){
		const perm = await dirs[key].dirHandle.requestPermission( { mode: "read" } );
		if( perm !== "granted" ){
		  	alert( "Failed to requestPermission" );
		  	success = false;
		}
	}

	rebuild_gallery();
} );

document.addEventListener( "DOMContentLoaded", async () => {
	await gImgDir.loadAsync();

	gImageTile.addEventListener( "click", ( e ) => {
		const img = e.target.closest( "img" );
		if( ! img || ! gImageTile.getRootElement().contains( img ) ) return;

		gOverlayViewer.setUrl( img.src );
		gOverlayViewer.show();
	} );

	rebuild_gallery();

	document.body.appendChild( gOverlayViewer.getRootElement() );
	document.querySelector( "main" ).appendChild( gImageTile.getRootElement() );
} );
