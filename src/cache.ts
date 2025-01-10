import Download from './download';
import Storage from '@liqd-rn/storage';
import ApplicationState from '@liqd-rn/app-state';

type VideoCacheOptions =
{
    priority?   : number
    expires?    : Date
    flags?      : string[]
}

type VideoCacheEntry =
{
    url         : string
    uri         : string
    cached      : boolean
    created     : Date
    priority?   : number
    expires?    : Date
    flags?      : string[]
}

const INIT = Symbol('INIT');

export default class VideoCache
{
    private static files = Storage.Dictionary.open<VideoCacheEntry>( '@liqd-rn:video-cache/files', { type: 'object' })!;
    private static exists: Record<string, Date> = {};
    private static paused = false;
    private static download: Download | null = null;

    private static async[INIT]()
    {
        VideoCache.downloadPending();
        VideoCache.unsetRemoved();

        ApplicationState.listen( state => 
        {
            if( state === 'foreground' )
            {
                VideoCache.downloadPending();
                VideoCache.unsetRemoved();
            }
            else
            {
                VideoCache.download?.cancel();
            }
        });
    }

    private static async downloadPending()
    {
        await VideoCache.ready;
        
        if( VideoCache.paused || VideoCache.download || ApplicationState.current === 'background' ){ return }

        const entry = [...VideoCache.values()].filter( entry => !entry.cached ).sort(( a, b ) => ( b.priority || 0 ) - ( a.priority || 0 ))?.[0];

        if( entry )
        {
            VideoCache.download = new Download( entry.url, uri =>
            {
                if( uri )
                {
                    entry.uri = uri;
                    entry.cached = true;

                    VideoCache.files.save();
                }

                VideoCache.download = null;

                setTimeout(() => VideoCache.downloadPending(), 1000 );
            });
        }
    }

    private static async checkEntryExists( entry?: VideoCacheEntry )
    {
        if( entry?.cached && Date.now() - ( VideoCache.exists[entry.url]?.getTime() ?? 0 ) > 5 * 60 * 1000 )
        {
            VideoCache.exists[entry.url] = new Date();

            if( !await Download.exists( entry.uri ))
            {
                entry.cached = false;
                entry.uri = '';

                VideoCache.files.save();
            }
        }
    }

    private static async unsetRemoved()
    {
        await VideoCache.ready;

        for( let entry of VideoCache.values() )
        {
            VideoCache.checkEntryExists( entry );
        }
    }

    private static removeURL( url: string )
    {
        const entry = VideoCache.files.get( url );

        if( entry )
        {
            VideoCache.files.unset( url );

            if( entry.cached )
            {
                Download.delete( entry.uri );
                delete VideoCache.exists[entry.url];
            }
        }

        if( VideoCache.download?.url === url )
        {
            VideoCache.download.cancel();
        }
    }

    public static get ready()
    {
        return VideoCache.files.ready();
    }

    public static has( url: string ): boolean
    {
        const entry = VideoCache.files.get( url );

        VideoCache.checkEntryExists( entry );

        return !!entry?.cached;
    }

    public static uri( url: string, fallback: string = url ): string
    {
        const entry = VideoCache.files.get( url );

        if( entry?.cached )
        {
            VideoCache.checkEntryExists( entry );

            return entry.uri;
        }

        return fallback;
    }

    public static values(): VideoCacheEntry[]
    {
        return VideoCache.files.values();
    }

    public static cache( url: string, options: VideoCacheOptions = {})
    {
        if( options.expires && options.expires < new Date() )
        {
            return VideoCache.delete( url );
        }

        const entry = VideoCache.files.get( url );

        if( entry )
        {
            entry.priority = options.priority || entry.priority;
            entry.expires = options.expires || entry.expires;
            entry.flags = options.flags || entry.flags;

            VideoCache.files.save();
        }
        else
        {
            VideoCache.files.set( url, { url, uri: '', cached: false, created: new Date(), ...options });
        }

        VideoCache.downloadPending();
    }

    public static delete( url: string )
    {
        VideoCache.removeURL( url );
    }

    public static prune( filter: ( entry: VideoCacheEntry ) => boolean )
    {
        VideoCache.values().filter( filter ).forEach( entry => VideoCache.delete( entry.url ));
    }

    public static clear()
    {
        VideoCache.prune(() => true );
    }

    public static pause()
    {
        if( VideoCache.paused ){ return } else { VideoCache.paused = true }

        VideoCache.download?.cancel();
    }
    
    public static resume()
    {
        if( !VideoCache.paused ){ return } else { VideoCache.paused = false }

        VideoCache.downloadPending();
    }
}

VideoCache[INIT]();