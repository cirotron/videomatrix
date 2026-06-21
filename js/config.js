/**
 * VideoWall Pro — Configuration
 *
 * This is the ONLY file you need to edit to change videos or default settings.
 * Add, remove, or reorder entries in the VIDEOS array.
 * Adjust APP_CONFIG to change default behavior.
 */

'use strict';

/**
 * Video definitions.
 * Each entry represents one available video source.
 *
 * @type {Array<{
 *   id: string,       Unique identifier (must be unique across all videos)
 *   title: string,    Display title shown in hover controls overlay
 *   youtubeId: string YouTube video ID (the part after ?v= in the URL)
 *   channel: string   Channel/source label shown in broadcast overlay
 * }>}
 */
const VIDEOS = [
  { id: 'v1', title: 'Camera 1',  youtubeId: 'cb12KmMMDJA', channel: 'Live Feed 01' },
  { id: 'v2', title: 'Camera 2',  youtubeId: 'Qr61waJ6AZg', channel: 'Live Feed 02' },
  { id: 'v3', title: 'Camera 3',  youtubeId: 'O9mOtdZ-nSk', channel: 'Live Feed 03' },
  { id: 'v4', title: 'Camera 4',  youtubeId: 'Vh8xmLBJtR8', channel: 'Live Feed 04' },
  { id: 'v5', title: 'Camera 5',  youtubeId: 'ArKbAx1K-2U', channel: 'Live Feed 05' },
  { id: 'v6', title: 'Camera 6',  youtubeId: 'pykpO5kQJ98', channel: 'Live Feed 06' },
  { id: 'v7', title: 'Camera 7',  youtubeId: 'YDvsBbKfLPA', channel: 'Live Feed 07' },
  { id: 'v8', title: 'Camera 8',  youtubeId: 'gCNeDWCI0vo', channel: 'Live Feed 08' },
  { id: 'v9', title: 'Camera 9',  youtubeId: 's3iVFJoxrYc', channel: 'Live Feed 09' },
];

/**
 * Application defaults.
 * Values here are overridden by whatever is saved in LocalStorage.
 *
 * @type {{
 *   defaultLayout: { rows: number, cols: number },
 *   defaultVolume: number,
 *   defaultTheme: 'dark'|'light'|'oled'|'broadcast',
 *   showOverlays: boolean,
 *   showControls: boolean,
 *   animations: boolean,
 *   autoplay: boolean,
 *   syncPlayers: boolean
 * }}
 */
const APP_CONFIG = {
  defaultLayout:  { rows: 2, cols: 3 },
  defaultVolume:  80,
  defaultTheme:   'dark',
  showOverlays:   true,
  showControls:   true,
  animations:     true,
  autoplay:       true,
  syncPlayers:    false,
};
