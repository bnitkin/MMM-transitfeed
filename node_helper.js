/* Magic Mirror
 * Module: MMM-transitfeed
 * A generic transit parser to display upcoming departures
 * for a selected set of lines
 *
 * By Ben Nitkin
 * MIT Licensed.
 */

// to download GTFS file
const Log = require("logger");
const fetch = require('fetch');
const NodeHelper = require("node_helper");

// GTFS stuff
const gtfs = require('gtfs');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings-transit');

module.exports = NodeHelper.create(
{
    // Subclassed functions
    start: function () {
        console.log(this.name + ' helper method started...'); /*eslint-disable-line*/
        this.busy = false;
        this.realtime = {};
    },

    socketNotificationReceived: async function (notification, payload) {
        // SQLite (the DB backing gtfs) isn't safe across concurrent
        // or multithread programs - it'll reuse the
        // same memory buffers for new queries and cause corruption.
        // Handling one request at a time from the top level prevents that.
        // This isn't a very good semaphore, but JS isn't actually multithreaded
        // so any operation that isn't explicitly `async` stays atomic.
        while (this.busy) await new Promise(r => setTimeout(r, 100));
        this.busy = true;

        Log.log("MMM-transitfeed: helper recieved", notification, payload);
        if (notification === 'GTFS_STARTUP')       await this.startup(payload);
        if (notification === 'GTFS_QUERY_SEARCH')  await this.query(payload.gtfs_config, payload.query);
        if (notification === 'GTFS_BROADCAST')     await this.broadcast();

        this.busy = false;
    },

    startup: async function(gtfs_config) {
        this.watch = [];
        // Import the data. Send a notification when ready.
        Log.log("MMM-transitfeed: Importing with " + gtfs_config);
        if (this.gtfs_config === undefined) {
            this.gtfs_config = gtfs_config
            this.realtimeDownload();
            await gtfs.import(this.gtfs_config);
            Log.log("MMM-transitfeed: Done importing!");
            this.db = await gtfs.openDb(this.gtfs_config);


            // Start broadcasting the stations & routes we're watching.
            setInterval(() => this.broadcast(), 1000*60*1);
            setInterval(() => this.realtimeDownload(), 1000*60*5);
        }

        // Send a ready message now that we're loaded.
        this.sendSocketNotification("GTFS_READY", null);
    },

    query: async function(gtfs_config, query) {
        // Maps a user query to a list of stops & routes to actually monitor.
        // That makes getting departures much faster.
        query.stops = {};
        query.routes = {};

        // Process the query - perform any human name to ID lookups,
        // then place add it to the watchlist.
        // Find stops matching the query string
        const routes = await gtfs.getRoutes({}, ['route_long_name', 'route_id']);
        for (route of routes) {
            // If a user provided a route name, filter on it.
            if (query.route_name === undefined
                || route.route_id.includes(query.route_name)
                || route.route_long_name.includes(query.route_name)) {

                const stops = await gtfs.getStops({route_id: route.route_id}, ['stop_name', 'stop_id']);
                for (stop of stops) {
                    if (stop.stop_name.includes(query.stop_name)) {
                        query.stops[stop.stop_id] = stop;
                        // Only add the route if it serves a stop we're interested in.
                        query.routes[route.route_id] = route;
                    }
                }
            }
        }
        Log.log("Evaluated", query);
        this.watch.push(query);
    },
    broadcast: async function() {
        Log.log("MMM-transitfeed: Publishing new trips...");
        let results = {};
        realtime_count = 0;
        for (query of this.watch) {
            for (const [_stop_id, stop] of Object.entries(query.stops)) {
                for (const [_route_id, route] of Object.entries(query.routes)) {
                    // Find all trips for the route
                    const trips = await gtfs.getTrips({route_id: route.route_id}, ['trip_id', 'direction_id', 'trip_headsign', 'service_id']);
                    for (trip of trips) {
                        if (query.direction === undefined || query.direction == trip.direction_id) {
                            // Now we have the stop and all the trips.
                            const stopDays = await gtfs.getCalendars({service_id: trip.service_id});
                            const stoptime = await gtfs.getStoptimes({trip_id: trip.trip_id, stop_id: stop.stop_id}, ['id', 'departure_time', 'stop_sequence']);

                            // If stopDays is undefined, the calendar lookup failed.
                            // This happens if transit agencies use a calendar ("Summer", "Day after thanksgiving")
                            // without defining it in calendar.txt.
                            if (stopDays.length == 0) continue;
                            // If there's no stoptime, the train skips this stop.
                            if (stoptime.length == 0) continue;

                            const stopDatetimes = makeStopDatetimes(stopDays[0], stoptime[0].departure_time);
                            for (datetime of stopDatetimes) {
                                const stop_delay = this.realtimeFor(trip.trip_id, stop.stop_sequence, datetime);
                                if (stop_delay !== null) realtime_count += 1;

                                results[trip.trip_id + "@" + datetime] = 
                                    JSON.parse(JSON.stringify({
                                        // IDs for tracing
                                        time_id: stoptime[0].id,
                                        stop_id: stop.stop_id,
                                        route_id: route.route_id,
                                        trip_id: trip.trip_id,

                                        route_name: route.route_long_name,
                                        trip_terminus: trip.trip_headsign,
                                        direction: trip.direction_id,
                                        stop_name: stop.stop_name,
                                        stop_time: datetime,
                                        stop_delay: stop_delay,
                                    }));
                            }
                        }
                    }
                }
            }
        }

        results = Object.values(results);

        // Now we have everything we need.
        Log.log("MMM-transitfeed: Sending " + results.length + " trips; " + realtime_count + " have realtime data.");
        this.sendSocketNotification("GTFS_QUERY_RESULTS", results);
    },
    realtimeDownload: async function() {
        realtime = {};
        // Update realtime data
        for (realtimeURL of this.gtfs_config.realtime) {
            Log.log("MMM-transitfeed: fetching realtime data from", realtimeURL);
            const response = await fetch(realtimeURL);

            if (!response.ok) {
                const message = `Failed while fetching realtime data: ${realtimeURL}: ${response.status}`;
                continue;
            }

            var feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
                new Uint8Array(await response.arrayBuffer()))
            for (entity of feed.entity) {
                if (entity.tripUpdate) {
                    realtime[entity.tripUpdate.trip.tripId] = entity;
                    Log.log(entity.tripUpdate.trip.tripId);
                }
            }
        }
        this.realtime = realtime;
        Log.log("MMM-transitfeed: updated " + realtime.length + " trips with realtime data");
    },
    realtimeFor: function(trip_id, stop_sequence, stop_time) {
        // Only look for realtime data if the vehicle's within an hour and up to 10m late.
        delay = null;
        const entity = this.realtime[trip_id];
        if (entity) {
            if (entity.tripUpdate.stopTimeUpdate) {
                var bestSequence = -1;
                // If stopTimeUpdate is provided, use that.
                // GTFS says updates apply to all stops from the given
                // stop_sequence onwards, until superceded by another update.
                for (stopTimeUpdate of entity.tripUpdate.stopTimeUpdate) {
                    if (stopTimeUpdate.stopSequence < bestSequence ||
                        stopTimeUpdate.stopSequence > stop_sequence) continue;
                    bestSequence = stopTimeUpdate.stopSequence;
                    delay = delayFromStopTimeUpdate(stop_time, stopTimeUpdate.departure, stopTimeUpdate.arrival)
                }
            }
            // Otherwise fall back to generic delay.
            if (delay === null) {
                delay = entity.tripUpdate.delay;
            }
        }
        return delay;
    },
})

function delayFromStopTimeUpdate(stop_time, departure, arrival) {
    // stopTimeUpdate can format delay in terms of adjusted
    // arrival or departure; and as a delay in seconds
    // or a new time. This works through all those options, preferring
    // departure time to arrival and seconds-delay to a new time.
    var stopTimeEvent = null;
    // Prefer departure to arrival, since that's the time we display.
    if (arrival)
        stopTimeEvent = arrival;
    if (departure)
        stopTimeEvent = departure;

    if (stopTimeUpdate.delay !== null)
        return stopTimeEvent.delay;
    if (stopTimeUpdate.time !== null)
        return ((stopTimeUpdate.time - stop_time) / 1000).toFixed();
    // null is important. A delay of 0 means the vehicle's on time.
    // null explicitly says "no tracking".
    return null;
}

function makeStopDatetimes(stop_days, stop_time) {
    // This accepts a GTFS calendar and a stop time
    // and creates Date objects for the next few days of arrivals.
    // Start/end dates are ignored for calendars, as are holidays.
    //
    // Format reference
    //stop_time: '09:43:00'
    //stop_days: {
    //   service_id: 'M3',
    //   monday: 0,
    //   tuesday: 0,
    //   wednesday: 0,
    //   thursday: 0,
    //   friday: 0,
    //   saturday: 0,
    //   sunday: 1,
    //   start_date: 20220821,
    //   end_date: 20230304
    // },

    const departures = [];

    // Create a Date with today's date and stop_time for the time.
    const dateCandidate = new Date();
    const time = new Date('2000-01-01T' + stop_time)
    dateCandidate.setHours(time.getHours());
    dateCandidate.setMinutes(time.getMinutes());
    dateCandidate.setSeconds(time.getSeconds());

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    for (let i = 0; i < 2; i++) {
        const dayofweek = days[dateCandidate.getDay()];
        if (stop_days[dayofweek] == 1)
            departures.push(new Date(dateCandidate));

        dateCandidate.setDate(dateCandidate.getDate() + 1)
    }
    return departures;
}
