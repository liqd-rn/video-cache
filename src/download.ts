import objectHash from '@liqd-js/fast-object-hash';
import RNFetchBlob, { type FetchBlobResponse } from 'react-native-blob-util';

export default class Download
{
    private task: (Promise<FetchBlobResponse> & { cancel?: () => void }) | null = null;

    constructor( public url: string, callback: ( uri: string | undefined ) => void )
    {
        const root = RNFetchBlob.fs.dirs.CacheDir + '/liqd-rn:video-cache';
        const filename = objectHash( url ) + '.' + (( url.replace(/\?.*$/, '').match(/\.([^./]+)$/)?.[1]) || 'mp4' );

        RNFetchBlob.fs.mkdir( root ).catch(() => {}).then( async() => 
        {
            try
            {
                callback(( await( this.task = RNFetchBlob.config({ fileCache: true, path: root + '/' + filename }).fetch('GET', url))).path() );
            }
            catch( error )
            {
                Download.delete( root + '/' + filename );

                callback( undefined );
            }
        });
    }

    public cancel()
    {
        if( this.task && typeof this.task.cancel === 'function' )
        {
            this.task.cancel();
        }
    }

    public static delete( path: string )
    {
        RNFetchBlob.fs.unlink( path ).catch(() => {});
    }

    public static exists( path: string )
    {
        return RNFetchBlob.fs.exists( path );
    }
}