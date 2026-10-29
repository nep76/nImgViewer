import IndexedDbHash from "./IndexedDbHash.js";
import ImageTile from "./ImageTile.js";
import OverlayViewer from "./OverlayViewer.js";
import ToastNotification from "./ToastNotification.js";

const gIndexedDbHash = new IndexedDbHash( "nImgViewer",
	2, [ "dirs", ...ImageTile.requiredDbKeys ]
);
const gImageTile     = new ImageTile( gIndexedDbHash, "gallery" );
const gOverlayViewer = new OverlayViewer( null );
const gNotification  = new ToastNotification();

let gDirs = {};
let gAcceptDirHandle = {};
let gDeniedDirHandle = {};

let _dbg = [];

function update_status()
{
	const cnt  = gImageTile.getImagesCount();
	document.getElementById( "status" ).textContent = `${cnt} 枚`;
	document.getElementById( "empty" ).hidden = ( cnt !== 0 );
}

document.getElementById( "app-name" ).addEventListener( "click", () => {
	document.getElementById( "policy-content ").textContent = _dbg.join( ", " );
	document.getElementById( "policy-modal" ).showModal();
} );

document.getElementById( "add" ).addEventListener( "click", async () =>
{
	try{
		const dir = await window.showDirectoryPicker();
		if( dir ){
			for( const key of Object.keys( gDirs ) ){
			  	if( await gDirs[key].dirHandle.isSameEntry( dir ) ) return;
			}
		  
			const id  = crypto.randomUUID();
			const cnt = await gImageTile.addImagesByDirHandleAsync( dir, id );
		  
			if( cnt ){
				try{
			  		Object.assign( gDirs,
						await gIndexedDbHash.storeDataAsync( "dirs", { [id]: { dirHandle: dir } } )
					);
				} catch( e ){
					console.error( e );
				}
			  	update_status();
			}
		}
	} catch( e ){
	  	if( e.name !== "AbortError" ){
			console.error( e );
		}
	}
});

document.getElementById( "policy-ok" ).addEventListener( "click", () => {
	document.getElementById( "policy-modal" ).close();
	try{
		localStorage.setItem( "policy-ok", "1" );
	} catch( e ){
		console.error( e );
	}
} );

document.getElementById( "delete-ok" ).addEventListener( "click", async ( e ) => {
	const button = e.currentTarget;
	button.disabled = true;

	try {
		gImageTile.clear();
		update_status();
		
		localStorage.clear();
		await gIndexedDbHash.clearDbAsync();

		gDirs = {};
	} catch( e ){
		console.error( e );
	} finally{
		button.disabled = false;
	}

	document.getElementById( "delete-modal" ).close();
} );

document.getElementById( "rebuild-ok" ).addEventListener( "click", async ( e ) => {
	document.getElementById( "rebuild-modal" ).close();

	_dbg.push( `Start:${performance.now().toFixed(0)}ms` );

	const desc = document.getElementById( "rebuild-desc" );
	try{
		for( const key of Object.keys( gDeniedDirHandle ) ){
			const perm = await gDeniedDirHandle[key].dirHandle.requestPermission( { mode: "read" } );
			if( perm !== "granted" ){
				console.log( `nImgViewer: Permission denied to read for the directory: ${gDeniedDirHandle[key].dirHandle.name }` );
			} else{
				gAcceptDirHandle[key] = gDeniedDirHandle[key];
			}
			delete gDeniedDirHandle[key];
		}

		for( const key of Object.keys( gAcceptDirHandle ) ){
			await gImageTile.addImagesByDirHandleAsync( gAcceptDirHandle[key].dirHandle, key );
			delete gAcceptDirHandle[key];

			update_status();
		}
	} finally{
		const cnt_denied = Object.keys( gDeniedDirHandle ).length;
		update_status();
		if( cnt_denied ){
			desc.textContent = `あと ${cnt_denied} フォルダに対して許可が必要です。`;
			document.getElementById( "rebuild-modal" ).showModal();
		} else{
			gImageTile.cleanupThumbnailsAsync();
		}
	}

	gDeniedDirHandle = {};
} );

document.getElementById( "rebuild-abort" ).addEventListener( "click", async ( e ) => {
	document.getElementById( "rebuild-modal" ).close();
	gDeniedDirHandle = {};

	update_status();

	gNotification.show( "アクセスが拒否されたため処理を中断しました。再試行するにはページを再読み込みしてください。", true );
} );

document.addEventListener( "DOMContentLoaded", async () => {
	document.body.appendChild( gOverlayViewer.getRootElement() );
	document.body.appendChild( gNotification.getRootElement() );
	document.querySelector( "main" ).appendChild( gImageTile.getRootElement() );

	try{
		gDirs = await gIndexedDbHash.loadDataAsync( "dirs" );
		gImageTile.loadThumbsFromDb( gIndexedDbHash );
	} catch( e ){
		console.error( e );
		gNotification.show( "ブラウザのデータストレージの読み込みに失敗しました。" );
		return;
	}

	gImageTile.addEventListener( "click", ( e ) => {
		const img = e.target.closest( "img" );
		if( ! img || ! gImageTile.getRootElement().contains( img ) ) return;

		gOverlayViewer.setUrl( img.imageTileObj.url );
		gOverlayViewer.show();
	} );
	
	gImageTile.addEventListener( "it_preloadimage", async ( e ) => {
		gNotification.show( `${e.detail.dir.name}/${e.detail.file.name}` );
		_dbg.push( `${performance.now().toFixed(0)}ms` );
	} );

	for( const key of Object.keys( gDirs ) ){
		const perm = await gDirs[key].dirHandle.queryPermission( { mode: "read" } );
		if( perm === "granted" ){
			await gImageTile.addImagesByDirHandleAsync( gDirs[key].dirHandle, key );
		} else{
			gDeniedDirHandle[key] = gDirs[key];
		}
	}

	if( Object.keys( gDeniedDirHandle ).length ){
		document.getElementById( "rebuild-modal" ).showModal();
	} else{
		update_status();
		gImageTile.cleanupThumbnailsAsync();
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

	try{
		if( ! localStorage.getItem( "policy-ok" ) && ! Object.keys( gDirs ).length ){
			document.getElementById( "policy-modal" ).showModal();
		}
	} catch( e ){
		console.error( e );
	}
} );
