import ImageDirStore from "./ImageDirStore.js";
import OverlayViewer from "./OverlayViewer.js";

const gImgDir        = new ImageDirStore( "nImgViewer" );
const gOverlayViewer = new OverlayViewer( "nImgViewer-overlay" );

const gGallery = document.getElementById( "gallery" );

function update_status()
{
  const imgs = document.querySelectorAll( `img[data-dir-id]` );
  const cnt  = imgs.length; 
  document.getElementById( "status" ).textContent = `${cnt} 枚`;
  document.getElementById( "empty" ).hidden = cnt > 0;
}

async function add_images( dir_handle, target_element, id )
{
  let cnt = 0;

  for await ( const [name, handle] of dir_handle.entries() ){
    if( handle.kind === "directory" ){
      cnt += await add_images( handle, target_element );
      continue
    } else if( handle.kind != "file" ){
      continue;
    }

    if( /\.(jpe?g|png)$/i.test( name ) ){
      const file = await handle.getFile();
      const url = URL.createObjectURL( file );

      const img = document.createElement( "img" );
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "";
      img.src = url;
      img.dataset.dirId = id;

      img.addEventListener( "click", ( e ) => {
        gOverlayViewer.setUrl( e.currentTarget.src );
        gOverlayViewer.show();
      } );
      
      target_element.appendChild( img );

      cnt++;
    }
  }

  return cnt;
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
      const cnt = await add_images( dir, f, id );

      if( cnt ){
        await gImgDir.storeAsync( {
          [id]: {
            dirHandle: dir,
          }
        } );
        
        gGallery.appendChild( f );
        update_status();
      }
    }
  } catch( e ){
    if( e.name !== "AbortError" ) throw e;
  }
});

document.getElementById( "reset" ).addEventListener( "click", async () => {
  gGallery.replaceChildren();

  const imgs = document.querySelectorAll( `img[data-dir-id]` );
  for( const img of imgs ) {
    URL.revokeObjectURL( img.src );
  }

  await gImgDir.clearAsync();

  update_status();
});

async function rebuild_gallery()
{
  const dirs = gImgDir.getDirs();
  const f = document.createDocumentFragment();

  let success = true;

  for( const key of Object.keys( dirs ) ){
    const perm = await dirs[key].dirHandle.queryPermission( { mode: "read" } );
    if( perm === "granted" ){
      await add_images( dirs[key].dirHandle, f, key );
    } else{
      success = false;
    }
  }

  gGallery.appendChild( f );

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

  rebuild_gallery();

  document.body.appendChild( gOverlayViewer.getRootElement() );
} );
