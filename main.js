import IndexedDbHash from "./IndexedDbHash.js";
import ImageTile from "./ImageTile.js";
import OverlayViewer from "./OverlayViewer.js";
import ToastNotification from "./ToastNotification.js";

const mIndexedDbHash = new IndexedDbHash( "nImgViewer",
	3, [ "dirs", ...ImageTile.requiredDbKeys ]
);
const mImageTile     = new ImageTile( mIndexedDbHash, "gallery" );
const mOverlayViewer = new OverlayViewer( null );
const mNotification  = new ToastNotification();

const mAddImageState = {
	abortCtrl  : null,
	lastPromise: null,
	queue      : [],
	busy       : false
}

const mReCalcState = {
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

async function add_image_wrapper_async( dir_handle, id )
{
	mAddImageState.queue.push( [ dir_handle, id ] );

	if( mAddImageState.abortCtrl ) return;
	mAddImageState.abortCtrl = new AbortController();

	try{
		while( true ){
			if( ! mAddImageState.queue.length ) break;

			const dir = mAddImageState.queue.shift();

			mAddImageState.lastPromise = mImageTile.addImagesByDirHandleAsync( dir[0], dir[1], mAddImageState.abortCtrl.signal );
			await Promise.all( [ mAddImageState.lastPromise, mImageTile.waitCancelAsync() ] );
		}
		if( mAddImageState.abortCtrl.signal.aborted ){
			throw( new DOMException( "UserCancel", "AbortError" ) );
		}
	} finally{
		mAddImageState.abortCtrl    = null;
		mAddImageState.lastPromise  = null;
		mAddImageState.queue.length = 0;
	}

	return;
}

document.getElementById( "app-name" ).addEventListener( "click", () => {
	document.getElementById( "policy-modal" ).showModal();
} );

document.getElementById( "policy-ok" ).addEventListener( "click", () => {
	document.getElementById( "policy-modal" ).close();
	try{
		localStorage.setItem( "policy-ok", "1" );
	} catch( e ){
		console.error( e );
	}
} );

document.getElementById( "add" ).addEventListener( "click", async () =>
{
	try{
		const dir = await window.showDirectoryPicker();
		if( dir ){
			const id  = crypto.randomUUID();

			try{
				Object.assign( mDirs,
					await mIndexedDbHash.storeDataAsync( "dirs", { [id]: { dirHandle: dir } } )
				);
			} catch( e ){
				console.error( e );
			}

			await add_image_wrapper_async( dir, id );

			update_status();
		}
	} catch( e ){
	  	if( e.name !== "AbortError" ){
			console.error( e );
		}
	}
});

document.getElementById( "delete-ok" ).addEventListener( "click", async ( e ) => {
	const clear_button = e.currentTarget;
	const add_button   = document.getElementById( "add" );

	clear_button.disabled = true;
	add_button.disalbed   = true;

	try {
		if( mAddImageState.abortCtrl ){
			mAddImageState.abortCtrl.abort();

			try{
				await mAddImageState.lastPromise;
			} catch( e ){
				if( e.name !== "AbortError" ){
					console.error( e );
				}
			}
		}

		mImageTile.clear();
		update_status();
		
		localStorage.clear();
		await mIndexedDbHash.clearDbAsync();

		mDirs = {};
	} catch( e ){
		console.error( e );
	} finally{
		clear_button.disabled = false;
		add_button.disabled   = false;
		
		mNotification.show( "ギャラリーが初期化されました。" );
	}

	document.getElementById( "delete-modal" ).close();
} );

document.getElementById( "rebuild-ok" ).addEventListener( "click", async () => {
	document.getElementById( "rebuild-modal" ).close();

	const desc = document.getElementById( "rebuild-desc" );
	try{
		for( const key of Object.keys( mDeniedDirHandle ) ){
			const perm = await mDeniedDirHandle[key].dirHandle.requestPermission( { mode: "read" } );
			if( perm !== "granted" ){
				console.log( `nImgViewer: Permission denied to read for the directory: ${mDeniedDirHandle[key].dirHandle.name }` );
			} else{
				await add_image_wrapper_async( mDirs[key].dirHandle, key );
			}
			delete mDeniedDirHandle[key];
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
	mIndexedDbHash.addEventListener( "idh_upgrade", () => {
		mNotification.show( "ギャラリーが初期化されました。", true );
	} );

	mImageTile.addEventListener( "click", ( e ) => {
		const img = e.target.closest( "img" );
		if( ! img || ! mImageTile.getRootElement().contains( img ) ) return;

		mOverlayViewer.setUrl( img.imageTileObj.url );
		mOverlayViewer.show();
	} );

	mImageTile.addEventListener( "it_knowndir", async ( e ) => {
		mNotification.show( `フォルダ "${e.detail.dir.name}" は既にギャラリーに追加されています。` );
		await mIndexedDbHash.removeDataAsync( "dirs", [ e.detail.id ] );
	} );
	
	mImageTile.addEventListener( "it_preloadimage", ( e ) => {
		mNotification.show( `${e.detail.dir.name} (${e.detail.count}/${e.detail.maxEntries}) ${e.detail.file.name}` );
	} );

	document.body.appendChild( mOverlayViewer.getRootElement() );
	document.body.appendChild( mNotification.getRootElement() );
	document.querySelector( "main" ).appendChild( mImageTile.getRootElement() );

	try{
		mDirs = await mIndexedDbHash.loadDataAsync( "dirs" );
		await mImageTile.loadThumbsFromDbAsync();
	} catch( e ){
		console.error( e );
		mNotification.show( "ギャラリーの読み込みに失敗しました。", true );
		return;
	}

	const resize_tiling = async () => {
		if( ! mReCalcState.lastPromise ){
			mReCalcState.abortCtrl   = new AbortController();
			mReCalcState.lastPromise = mImageTile.reCalcTilingAsync( mReCalcState.abortCtrl.signal );
		} else if( ! mReCalcState.pending ){
			mReCalcState.pending = true;
			mReCalcState.abortCtrl.abort();
			
			await mReCalcState.lastPromise;

			mReCalcState.abortCtrl   = new AbortController();
			mReCalcState.lastPromise = mImageTile.reCalcTilingAsync( mReCalcState.abortCtrl.signal );
			mReCalcState.pending     = false;
		}

		const current_promise = mReCalcState.lastPromise;

		mReCalcState.lastPromise.finally( () => {
			if( mReCalcState.lastPromise !== current_promise ) return;

			mReCalcState.abortCtrl   = null;
			mReCalcState.lastPromise = null;
			mReCalcState.pending     = false;
		}) ;
	};

	const observer = new ResizeObserver( ( () => {
		let prev_width = null;

		return async ( entries ) => {
			for( const e of entries ){
				if(
					e.target !== mImageTile.getRootElement() ||
					e.contentRect.width === prev_width       ||
					mReCalcState.pending
				) break;

				prev_width = e.contentRect.width;
				resize_tiling();
				
				break;
			}
		}
	} )() );

	observer.observe( mImageTile.getRootElement() );

	for( const key of Object.keys( mDirs ) ){
		const perm = await mDirs[key].dirHandle.queryPermission( { mode: "read" } );
		if( perm === "granted" ){
			await add_image_wrapper_async( mDirs[key].dirHandle, key );
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
	
	if( ! mReCalcState.pending ){
		resize_tiling();
	}

	try{
		if( ! localStorage.getItem( "policy-ok" ) && ! Object.keys( mDirs ).length ){
			document.getElementById( "policy-modal" ).showModal();
		}
	} catch( e ){
		console.error( e );
	}
} );
