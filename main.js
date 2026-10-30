import IndexedDbHash from "./IndexedDbHash.js";
import ImageTile from "./ImageTile.js";
import OverlayViewer from "./OverlayViewer.js";
import ToastNotification from "./ToastNotification.js";

const mIndexedDbHash = new IndexedDbHash( "nImgViewer",
	2, [ "dirs", ...ImageTile.requiredDbKeys ]
);
const mImageTile     = new ImageTile( mIndexedDbHash, "gallery" );
const mOverlayViewer = new OverlayViewer( null );
const mNotification  = new ToastNotification();

const mReCalc = {
	abortCtrl  : null,
	lastPromise: null,
	pending    : false
};

let mDirs = {};
let mDeniedDirHandle = {};

function update_status()
{
	const cnt = mImageTile.getImagesCount();
	document.getElementById( "status" ).textContent = `${cnt} 枚`;
	document.getElementById( "empty" ).hidden = ( cnt !== 0 );
}

document.getElementById( "app-name" ).addEventListener( "click", () => {
	document.getElementById( "policy-modal" ).showModal();
} );

document.getElementById( "add" ).addEventListener( "click", async () =>
{
	try{
		const dir = await window.showDirectoryPicker();
		if( dir ){
			for( const key of Object.keys( mDirs ) ){
			  	if( await mDirs[key].dirHandle.isSameEntry( dir ) ){
					mNotification.show( `フォルダ "${mDirs[key].dirHandle.name}" は既にギャラリーに含まれています。` );
					return;
				}
			}
		  
			const id  = crypto.randomUUID();
			const cnt = await mImageTile.addImagesByDirHandleAsync( dir, id );
		  
			if( cnt ){
				try{
			  		Object.assign( mDirs,
						await mIndexedDbHash.storeDataAsync( "dirs", { [id]: { dirHandle: dir } } )
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
		mImageTile.clear();
		update_status();
		
		localStorage.clear();
		await mIndexedDbHash.clearDbAsync();

		mDirs = {};
	} catch( e ){
		console.error( e );
	} finally{
		button.disabled = false;
	}

	document.getElementById( "delete-modal" ).close();
} );

document.getElementById( "rebuild-ok" ).addEventListener( "click", async () => {
	document.getElementById( "rebuild-modal" ).close();

	const desc = document.getElementById( "rebuild-desc" );
	try{
		const accpeted_dirs = {};
		for( const key of Object.keys( mDeniedDirHandle ) ){
			const perm = await mDeniedDirHandle[key].dirHandle.requestPermission( { mode: "read" } );
			if( perm !== "granted" ){
				console.log( `nImgViewer: Permission denied to read for the directory: ${mDeniedDirHandle[key].dirHandle.name }` );
			} else{
				accpeted_dirs[key] = mDeniedDirHandle[key];
			}
			delete mDeniedDirHandle[key];
		}

		for( const key of Object.keys( accpeted_dirs ) ){
			await mImageTile.addImagesByDirHandleAsync( accpeted_dirs[key].dirHandle, key );
			delete accpeted_dirs[key];

			update_status();
		}
	} finally{
		const cnt_denied = Object.keys( mDeniedDirHandle ).length;
		update_status();
		if( cnt_denied ){
			desc.textContent = `あと ${cnt_denied} フォルダに対して許可が必要です。`;
			document.getElementById( "rebuild-modal" ).showModal();
		} else{
			mImageTile.cleanupThumbnailsAsync();
		}
	}

	mDeniedDirHandle = {};
} );

document.getElementById( "rebuild-abort" ).addEventListener( "click", async () => {
	document.getElementById( "rebuild-modal" ).close();
	mDeniedDirHandle = {};

	update_status();

	mNotification.show( "アクセスが拒否されたため処理を中断しました。再試行するにはページを再読み込みしてください。", true );
} );

document.addEventListener( "DOMContentLoaded", async () => {
	document.body.appendChild( mOverlayViewer.getRootElement() );
	document.body.appendChild( mNotification.getRootElement() );
	document.querySelector( "main" ).appendChild( mImageTile.getRootElement() );

	try{
		mDirs = await mIndexedDbHash.loadDataAsync( "dirs" );
		mImageTile.loadThumbsFromDb();
	} catch( e ){
		console.error( e );
		mNotification.show( "ブラウザのデータストレージの読み込みに失敗しました。", true );
		return;
	}

	mImageTile.addEventListener( "click", ( e ) => {
		const img = e.target.closest( "img" );
		if( ! img || ! mImageTile.getRootElement().contains( img ) ) return;

		mOverlayViewer.setUrl( img.imageTileObj.url );
		mOverlayViewer.show();
	} );
	
	mImageTile.addEventListener( "it_preloadimage", async ( e ) => {
		mNotification.show( `${e.detail.dir.name}/${e.detail.file.name}` );
	} );

	for( const key of Object.keys( mDirs ) ){
		const perm = await mDirs[key].dirHandle.queryPermission( { mode: "read" } );
		if( perm === "granted" ){
			await mImageTile.addImagesByDirHandleAsync( mDirs[key].dirHandle, key );
			update_status();
		} else{
			mDeniedDirHandle[key] = mDirs[key];
		}
	}

	if( Object.keys( mDeniedDirHandle ).length ){
		document.getElementById( "rebuild-modal" ).showModal();
	} else{
		update_status();
		mImageTile.cleanupThumbnailsAsync();
	}

	const observer = new ResizeObserver( ( () => {
		let prev_width = null;

		return async ( entries ) => {
			for( const e of entries ){
				if(
					e.target !== mImageTile.getRootElement() ||
					e.contentRect.width === prev_width       ||
					mReCalc.pending
				) break;

				prev_width = e.contentRect.width;
				
				if( ! mReCalc.lastPromise ){
					mReCalc.abortCtrl   = new AbortController();
					mReCalc.lastPromise = mImageTile.reCalcTilingAsync( mReCalc.abortCtrl.signal );
				} else if( ! mReCalc.pending ){
					mReCalc.pending = true;
					mReCalc.abortCtrl.abort();
					
					await mReCalc.lastPromise;

					mReCalc.abortCtrl   = new AbortController();
					mReCalc.lastPromise = mImageTile.reCalcTilingAsync( mReCalc.abortCtrl.signal );
					mReCalc.pending     = false;
				}

				const current_promise = mReCalc.lastPromise;

				mReCalc.lastPromise.finally( () => {
					if( mReCalc.lastPromise !== current_promise ) return;

					mReCalc.abortCtrl   = null;
					mReCalc.lastPromise = null;
					mReCalc.pending     = false;
				}) ;
				break;
			}
		}
	} )() );

	observer.observe( mImageTile.getRootElement() );

	try{
		if( ! localStorage.getItem( "policy-ok" ) && ! Object.keys( mDirs ).length ){
			document.getElementById( "policy-modal" ).showModal();
		}
	} catch( e ){
		console.error( e );
	}
} );
