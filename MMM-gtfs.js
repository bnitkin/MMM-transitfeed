/* Magic Mirror
 * Module: MMM-gtfs
 * A generic transit parser to display upcoming departures
 * for a selected set of lines
 *
 * By Ben Nitkin
 * MIT Licensed.
 */

Module.register("MMM-gtfs", {
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
               "url": "https://transitfeeds.com/p/septa/262/latest/download",
               // Excluding shapes makes loading faster.
               exclude: ['shapes']
            },
         ],
      },

      // Route + station pairs to monitor for departures
      queries: [
         {route_name: "West Trenton", stop_name: "30th"},
         {route_name: "Warminster", stop_name: "Warminster", direction: 1},
         {stop_name: "Chestnut Hill East", direction: 1},
      ],
      departuresPerRoute: 3,
      // If true, show minutes till arrival. If false, show arrival time in HH:MM
      showTimeFromNow: false,
      // Display the station name above the routes appearing at that station
      showStationNames: true,
      // If true, separate multi-terminus routes into one line per terminus.
      showAllTerminus: true,
      departureTimeColorMinutes: 5,
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

      for (trip of this.trips) {
         if (this.config.showStationNames && trip.stop_name != lastTrip.stop_name) {
            row = this.wrapper.insertRow();
            let stop = row.insertCell();
            stop.innerHTML = trip.stop_name;
            stop.colSpan = 2 + this.config.departuresPerRoute;
            stop.className = "align-left";
         }
         if (trip.route_name != lastTrip.route_name
          || trip.direction != lastTrip.direction
          || (this.config.showAllTerminus && (trip.trip_terminus != lastTrip.trip_terminus))) {
            departureCount = 0;

            row = this.wrapper.insertRow();
            let route = row.insertCell();
            route.innerHTML = trip.route_id;
            route.className = "align-left bright";

            let terminus = row.insertCell();
            terminus.innerHTML = trip.trip_terminus;
            terminus.className = "align-left";
            terminus.className += " xsmall";
         }

         lastTrip = trip;

         if (departureCount == this.config.departuresPerRoute) continue;
         departureCount += 1;

         let departure_time = row.insertCell();
         Log.log(trip);
         let minutes = ((trip.stop_time - Date.now()) / 1000 / 60).toFixed();
         if (this.config.showTimeFromNow)
            departure_time.innerHTML = minutes;
         else
            departure_time.innerHTML = trip.stop_time.toTimeString().slice(0,5);

         if (minutes <= this.config.departureTimeColorMinutes) {
            departure_time.style.color = "#f66";
         }
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
         Log.log("Querying");
         Log.log(this.config.queries);
         for (query of this.config.queries) { 
            this.sendSocketNotification("GTFS_QUERY_SEARCH",
               {'gtfs_config': this.config.gtfs_config, 'query': query});
         }
         this.sendSocketNotification("GTFS_BROADCAST");
      }
      if (notification == "GTFS_QUERY_RESULTS") {
         Log.log("MMM-gtfs got a query response");
         // Times don't survive the JSON serialization - need to recover them.
         Log.log(payload);
         this.updateDepartures(payload);
      }
   },

   updateDepartures: function(trips) {
      // TODO: Update departures with realtime data.
      Log.log(trips.length + " trips in queue");

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

      for (trip of trips) trip.stop_time = new Date(trip.stop_time);
      trips = trips.sort(sortFunc);
      Log.log(trips)
      this.trips = trips.filter(trip => trip.stop_time > Date.now())
      this.updateDom();
   },
});
