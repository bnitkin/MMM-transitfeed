# Module: MMM-transitfeed

![Screenshot](/res/screenshot.png?raw=true "Screenshot of module")

MagicMirror²: https://docs.magicmirror.builders/

This MagicMirror² module shows upcoming departure times for a user-specified
set of transit stations and routes. It's designed to do the same thing as
https://github.com/BlinkTagInc/transit-arrivals-widget (but in MagicMirror²!)

GTFS is a general-purpose arrivals board for public transit.
Most transit agencies publish schedules in a GTFS format - that's
the magic that lets Google & Apple Maps show transit directions without
someone reading PDF timetables by hand every time anything changes.

This module will pull the same GTFS sources and monitor a list of
stations & routes you provide

# Upgrading - BREAKING CHANGES
This release requires updates:
 - Upgrading `gtfs` requires manual intervention:
   ```
   cd MagicMirror                       # Enter magicmirror project directory
   npm uninstall gtfs-realtime-bindings # Now part of gtfs
   npm install gtfs --save-dev          # Force update to latest version 
   ```
 - If you have version errors about `The module was compiled against a different Node.js version`, try rebuilding `better-sqlite3`:
   ```
   cd MagicMirror
   rm -r node_modules/better-sqlite3/
   # Get Electron version with ./node_modules/.bin/electron --version
   npm install better-sqlite3 --build-from-source --runtime=electron --target=26.4.3 --dist-url=https://electronjs.org/headers --force
   ```
 - In `config.js`, the `realtime` configuration option is moved to `realtimeUrls`
   as a subfield of `agencies`.

# Installation

Installation is pretty standard:
```
# Clone the module into your `modules/` directory:
git clone https://github.com/bnitkin/MMM-transitfeed.git

# Install the gtfs parsing library
npm install gtfs
```

# Configuration

## Sample Config
```
   config: {
        // GTFS data to load - this is the config object described in:
        // https://www.npmjs.com/package/gtfs/v/2.4.4#configuration
        //
        // The default below shows how to load multiple GTFS files,
        // but custom headers & auth-tokens are supported.
        gtfs_config: {
            agencies: [
                // These are SEPTA regional rail routes. Go to transitfeeds.com
                // or your transit agency's site to find local GTFS data.
                {
                    "url": "https://transitfeeds.com/p/septa/262/latest/download",
                    "realtimeUrls": ["https://www3.septa.org/gtfsrt/septarail-pa-us/Trip/rtTripUpdates.pb"],
                    // Excluding shapes makes loading faster.
                    exclude: ['shapes']
                },
            ],
        },

        // Route + station pairs to monitor for departures
        queries: [
            {route_name: "West Trenton", stop_name: "30th"},
            {route_name: "Warminster", stop_name: "Warminster", direction: 1},
            {stop_name: "Norristown", direction: 1},
        ],
        departuresPerRoute: 3,
        // Switch from showing clock time (10:38) to minutes until departure (18)
        // showTimeFromNow minutes before departure. Set to 0 to always show clock
        // time or a large number to always show minutes
        showTimeFromNow: 15,
        // If true, use live tracking to show estimated arrival time.
        // If false, show a small +/- indicator to show late/early.
        showTimeEstimated: false,
        // Display the station name above the routes appearing at that station
        // (Use `replace` below to merge similarly-named stations into one banner)
        showStationNames: true,
        // If true, separate multi-terminus routes into one line per terminus.
        // i.e. some routes stop before the end of the line or have multiple service patterns
        showAllTerminus: true,
        // Turn the trip departingSoonColor if it departs in less than departingSoonMinutes minutes
        departingSoonMinutes: 5,
        departingSoonColor: "#f66",
        // Color to use if live tracking is available for the vehicle
        liveTrackingColor: "#66f",
        // Replacements - strings on the left are replaced by those on the right in
        // route, station, and terminus names. Good to shorten long names, add
        // train/bus icons, or remove words entirely.
        // Unicode is supported!
        replace: {
            'Transit Center': 'T.C.',
            'Transfer Center': 'T.C.',
            'Exchange': 'Exc.',
            'BSL': '🚇 BSL',
        }
    },
```

## Required
### `gtfs_config`
Unless you're using SEPTA, you'll need to find GTFS
data for your transit agency.
`https://github.com/MobilityData/mobility-database-catalogs/tree/main/catalogs/sources/gtfs/`
has a bunch (`schedule` for schedules, and `realtime` for realtime data).
If not, try searching your agency for an
API or developer resources, and you'll likely find something.

The example above imports two GTFS files; any number is supported. Just duplicate or
delete entries in the `agencies` list as needed.

In most cases, updating the `"url"` field should work. If not, The `gtfs_config`
structure is fed directly to `gtfs` and supports auth-tokens and special headers.
Advanced details are described at
https://www.npmjs.com/package/gtfs/v/4.5.1#agencies

### `queries`
`queries` is a list of searches to run and determines what the widget displays.

Queries may have a route name, stop name, and direction. At minimum, stop name
is required. `{stop_name: "Wayne Junction"}` will show all vehicles stopping there.

Adding `route_name` or `direction` will filter to that route & direction.
(`direction` is agency-defined - it'll be consistent by route, but `0`/`1`
don't necessarily mean north/south or inbound/outbound.

Any route/stop matching the query will be added. i.e. `{stop_name: "Trenton"}`
will match both `West Trenton` and `Trenton`.

## Optional
### `replace`
`replace` provides a set of text replacements to adjust strings used by
the transit agency. It can decorate routes with Unicode symbols, shorten
or clarify names, and merge similarly-named stations so they display under
the same banner.
```
// Add a Unicode train!
'BSL': '🚇 BSL',
// Use Unicode for a route symbol
'MFL': '🇱'
// Rename neighbor stations to the same name
'Broad-Erie FS': 'Broad-Erie',
'Germantown Av & Erie Av': 'Broad-Erie',
// Abbreviate a long name
'Transfer Center': 'T.C.',
```

### Display options
There are a few options to customize how the widget looks:

 - `departuresPerRoute`: How many upcoming departures to show for each route.
   Defaults is `3`.
 - `showTimeFromNow`: Controls time display. The widget automatically switches from
   clock-time departure to minutes-from-now `showTimeFromNow` minutes before departure.
 - `showStationNames`: Whether to show station names above the routes. Default `true`
 - `showAllTerminus`: Some routes have multiple terminii; either stations are skipped
   late at night or the train runs downtown then back out in different directions.
   `true` gives each terminus a row; `false` collapses them into a single route.
 - `departingSoonMinutes`: Vehicles departing soon are displayed in a different color. This
   controls how many minutes before departure the color should change. Set to a negative
   number to disable entirely. Default is `5`
 - `departingSoonColor`: The color to use with `departingSoonMinutes`.
   Default is `"#f66"` (medium red)

### Realtime
To enable realtime arrival updates, add your agencies realtime GTFS to
the `realtimeUrls` array:
```
gtfs_config: {
    agencies: [
        {
            "url": "https://transitfeeds.com/p/septa/262/latest/download",
            "realtimeUrls": ["https://www3.septa.org/gtfsrt/septarail-pa-us/Trip/rtTripUpdates.pb"],
        },
    ]
```
#### Realtime Options
 - `showTimeEstimated`: Control how realtime delay estimates are displayed.
   If `true`, the estimated delay is added to the display time directly. (7:34 -> 7:38)
   If `false`, delay is shown with a small `+N` in front of the time. (7:34 -> +4 7:34)
 - `liveTrackingColor`: Set a special color for vehicles with realtime data
   available. Default is `"#66f"` (medium blue)

# Limitations
 - Only one block is supported; if you add two blocks they'll both display all queries.
 - The module calculates a few days worth of trips. Using high `departuresPerRoute` on 
   a low-frequency line may not fill the row.
