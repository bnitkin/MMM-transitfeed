/* Magic Mirror
 * Module: MMM-transitfeed
 * A generic transit parser to display upcoming departures
 * for a selected set of lines
 *
 * By Ben Nitkin
 * MIT Licensed.
 */

Module.register("MMM-transitfeed", {
    // Default module config.
    defaults: {
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
                    "url": "https://www3.septa.org/developer/google_rail.zip",
                    "realtimeUrls": ["https://www3.septa.org/gtfsrt/septarail-pa-us/Trip/rtTripUpdates.pb"],
                    // Excluding shapes makes loading faster.
                    exclude: ['shapes']
                },
            ],
            realtime: [
                "https://www3.septa.org/gtfsrt/septarail-pa-us/Trip/rtTripUpdates.pb"
            ],
        },

        // Route + station pairs to monitor for departures
        queries: [
            {route_name: "West Trenton", stop_name: "30th"},
            {route_name: "Warminster", stop_name: "Warminster", direction: 1},
            {stop_name: "Norristown", direction: 1},
        ],
        departuresPerRoute: 3,
        // If true, show minutes till arrival. If false, show arrival time in HH:MM
        showTimeFromNow: false,
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

    start: function () {
        // Set up initial DOM wrapper
        this.wrapper = document.createElement("table");
        this.loading = true;
        this.trips = [];

        // Send the config dictionary to the helper.
        this.sendSocketNotification("GTFS_STARTUP", this.config.gtfs_config);
        this.updateDom();
    },

    getDom: function () {
        // Fake trip for comparison purposes
        let lastTrip = {trip_terminus: '', route_name: '', stop_name: '', direction:-1};
        let row;
        let departureCount = 0;

        // Clear contents
        this.wrapper.innerHTML = "";

        if (this.loading) {
            this.wrapper.innerHTML = "Loading GTFS data... <br> This may take a few minutes.";
        } else if (this.trips.length == 0) {
            this.wrapper.innerHTML = "No trips found yet. <br> Check <code>queries</code> in the config if this persists.";
        }

        // Trips arrive from the node_helper presorted by stop name and time.
        // So the render engine just needs to display the right number of
        // stops in a table, and add a row when the stop name changes.
        for (trip of this.trips) {
            // If showing station names, render the station name.
            if (this.config.showStationNames && trip.stop_name != lastTrip.stop_name) {
                row = this.wrapper.insertRow();
                let stop = row.insertCell();
                stop.innerHTML = trip.stop_name;
                stop.colSpan = 2 + this.config.departuresPerRoute;
                stop.className = "align-left";
            }
            // If the route changes (name/direction/terminus) start a new row.
            if (trip.route_name != lastTrip.route_name
                || trip.direction != lastTrip.direction
                || (this.config.showAllTerminus && (trip.trip_terminus != lastTrip.trip_terminus))) {
                departureCount = 0;

                // Rows start with the route ID (short name for the route)
                row = this.wrapper.insertRow();
                let route = row.insertCell();
                route.innerHTML = trip.route_id;
                route.className = "align-left bright";

                // And also display the terminus.
                let terminus = row.insertCell();
                terminus.innerHTML = trip.trip_terminus;
                terminus.className = "align-left";
                terminus.className += " xsmall";
            }

            lastTrip = trip;

            // Only show departuresPerRoute departures.
            if (departureCount == this.config.departuresPerRoute) continue;
            departureCount += 1;

            // After all the special logic, populate departure times.
            let departure_time = row.insertCell();

            if (this.config.showTimeEstimated && trip.stop_delay !== null) {
                trip.stop_time = new Date(trip.stop_time.getTime() + trip.stop_delay*1000);
            }

            let minutes = ((trip.stop_time - Date.now()) / 1000 / 60).toFixed();
            if (this.config.showTimeFromNow)
                departure_time.innerHTML = minutes;
            else
                departure_time.innerHTML = trip.stop_time.toTimeString().slice(0,5);
                if (departure_time.innerHTML[0] == '0')
                    departure_time.innerHTML = departure_time.innerHTML.slice(1,5);

            if (trip.stop_delay !== null)
                departure_time.style.color = this.config.liveTrackingColor;

            if (minutes <= this.config.departingSoonMinutes)
                departure_time.style.color = this.config.departingSoonColor;

            // Add a superscript +/- time estimate
            if (!this.config.showTimeEstimated && trip.stop_delay !== null) {
                var start = "<span style=vertical-align:top;font-size:70%>";
                if (trip.stop_delay >= 0)
                    start += "+";
                departure_time.innerHTML = start + (trip.stop_delay/60).toFixed() + "</span>" + departure_time.innerHTML;
            }

            // Show the next departure bolder than the rest.
            if (departureCount == 1) {
                departure_time.className = "bright";
                departure_time.style.width = "35px";
            } else {
                departure_time.className = "dim xsmall";
                departure_time.style.width = "30px";
            }
        }

        return this.wrapper;
    },

    socketNotificationReceived: async function(notification, payload) {
        // Once the GTFS data is all imported, resolve our queries.
        if (notification == "GTFS_READY") {
            // Update from "Loading GTFS" to "No trips found"
            this.loading = false;
            this.updateDom();
            // Set up the helper to send us data.
            Log.log("MMM-transitfeed: Querying");
            Log.log(this.config.queries);
            for (query of this.config.queries) { 
                this.sendSocketNotification("GTFS_QUERY_SEARCH",
                                            {'gtfs_config': this.config.gtfs_config, 'query': query});
            }
            this.sendSocketNotification("GTFS_BROADCAST");
        }
        if (notification == "GTFS_QUERY_RESULTS") {
            Log.log("MMM-transitfeed: got a query response");
            // Times don't survive the JSON serialization - need to recover them.
            Log.log("MMM-transitfeed: ", payload);
            this.updateDepartures(payload);
        }
    },

    updateDepartures: function(trips) {
        Log.log("MMM-transitfeed: " + trips.length + " trips in queue");

        sortFunc = (one, two) => {
            // Alphabetize by station names if they're displayed.
            if (this.config.showStationNames) {
                stop_name = one.stop_name.localeCompare(two.stop_name, "en-u-kn-true");
                if (stop_name != 0) return stop_name;
            }

            route_id = one.route_id.localeCompare(two.route_id, "en-u-kn-true");
            if (route_id != 0) return route_id;

            direction = one.direction - two.direction;
            if (direction != 0) return direction;

            // The table-renderer expects all trips for a row to be in order.
            // If we're displaying all terminii, they need to be sorted.
            // And if not, all terminii for a route need to be sorted by arrival time, not terminus.
            if (this.config.showAllTerminus) {
                trip_terminus = one.trip_terminus.localeCompare(two.trip_terminus, "en-u-kn-true");
                if (trip_terminus != 0) return trip_terminus;
            }

            return one.stop_time - two.stop_time;
        };

        // Convert stop_time back to a Date (lost in serialization from backend
        for (trip of trips) {
            trip.stop_time = new Date(trip.stop_time);
            trip.route_name = this.tr(trip.route_name);
            trip.trip_terminus = this.tr(trip.trip_terminus);
            trip.route_id = this.tr(trip.route_id);
        }

        // Sort trips into the order the renderer wants
        trips = trips.sort(sortFunc);
        Log.log(trips)
        // Cull trips from the past
        // (More than 5m ago, including estimated delay)
        this.trips = trips.filter(
            trip => (trip.stop_time - Date.now()) > -(300)*1000);
        Log.log("Filtered to", this.trips.length);

        this.updateDom();
        this.updateDom();
    },

    tr: function(text) {
        for (const [word, wd] of Object.entries(this.config.replace)) {
            text = text.replace(word, wd);
        }
        return text;
    },
});
