# Module: MMM-gtfs

This module shows upcoming departure times for a user-specified
set of transit stations and routes. It's designed to do the same thing as
https://github.com/BlinkTagInc/transit-arrivals-widget (but in MagicMirror!)

GTFS is a general-purpose arrivals board for public transit.
Most transit agencies publish schedules in a GTFS format - that's
the magic that lets Google & Apple Maps show transit directions without
someone reading PDF timetables by hand every time anything changes.

This module will pull the same GTFS sources and monitor a list of
stations & routes you provide


## Installation

Installation is pretty standard, though a specific version of the NPM GTFS library
is required. (The new one requires `import` syntax, and MagicMirror uses `require`
to bring in libraries.

```
# Clone the module into your `modules/` directory:
git clone https://github.com/bnitkin/MMM-gtfs.git

# Install the gtfs parsing library
npm install gtfs@2.4.4
```

## Configuration

### Sample Config
```
   config: {
      gtfs_config: {
         agencies: [
            // These are SEPTA regional rail routes. Go to transitfeeds.com
            // or your transit agency's site to find local GTFS data.
            {
               "url": "https://transitfeeds.com/p/septa/262/latest/download",
               // Excluding shapes makes loading faster.
               exclude: ['shapes']
            },
            // Multiple URLs are supported!
            {
               "url": "https://transitfeeds.com/p/septa/263/latest/download",
               exclude: ['shapes']
            },
         ],
      },

      // Route + station pairs to monitor for departures
      queries: [
         {route_name: "West Trenton", stop_name: "30th"},
         {route_name: "Warminster", stop_name: "Warminster", direction: 1},
         {route_name: "Chestnut Hill", stop_name: "Chestnut Hill East", direction: 1},
      ],
   },
```

### `gtfs_config`
 Unless you're using SEPTA, you'll need to find GTFS
data for your transit agency. `transitfeeds.com` has a bunch, and if you
search your agency for an API URL, you'll likely find something.

The example below imports two GTFS files; any number is supported. Just duplicate or
delete entries in the `agencies` list as needed.

In most cases, updating the `"url"` field should work. If not, The `gtfs_config`
structure is fed directly to `gtfs` and supports auth-tokens and special headers.
Advanced details are described at
https://www.npmjs.com/package/gtfs/v/2.4.4#configuration-files

### `queries`
`queries` is a list of searches to run, and determines what the widget displays.

Queries may have a route name, stop name, and direction. At minimum, stop name
is required. `{stop_name: "Wayne Junction"}` will show all vehicles stopping there.

Adding `route_name` or `direction` will filter to that route & direction.
(`direction` is agency-defined - it'll be consistent by route, but `0`/`1`
don't necessarily mean north/south or inbound/outbound.

Any route/stop matching the query will be added. i.e. `{stop_name: "Trenton"}`
will match both `West Trenton` and `Trenton`.

### Display options
There are a few options to customize how the widget looks:

 - `departuresPerRoute`: How many upcoming departures to show for each route.
   Defaults is `3`.
 - `showTimeFromNow`: If `true`, display minutes till departure. If `false`, display
   clock-time of departure. Default is `false`.
 - `showStationNames`: Whether to show station names above the routes. Default `true`
      showAllTerminus: true,
 - `departureTimeColorMinutes`: Vehicles departing soon are displayed in red. This
   controls how many minutes before departure the color should change. Set to a negative
   number to disable entirely. Default is `5`

## Limitations
 - The 2.4.4 version of `gtfs` doesn't support the realtime spec for vehicles.
   This display is based on scheduled times, without realtime updates.
 - Only one block is supported; if you add two blocks they'll both display all queries.
